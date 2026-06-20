/**
 * app.js
 * Main application controller.
 * Wires together State, Editor, TTS, ElevenLabsService, Storage, and UI.
 */

const App = (() => {

  let _elApiKey = null;      // ElevenLabs API key — runtime only, never persisted
  let _elVoices = [];        // ElevenLabs voice list
  let _elVoiceMap = {};      // { CHARACTER: elevenlabs_voice_id }
  let _pendingGeneration = null;
  let _fontSize = 15;

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  function init() {
    Editor.init(document.getElementById('script-editor'));
    TTS.init(Editor.highlightBlock);

    _bindStateEvents();
    _bindUIEvents();
    _startAutosave();

    _restoreUISettings();

    // Try restoring last session from localStorage
    const saved = Storage.loadLocal();
    if (saved) {
      State.setProject(saved);
      _showToast('Session restored');
    } else {
      // Load blank project — user will open or create
      State.setProject(_blankProject());
    }

    setTimeout(() => TTS.init(Editor.highlightBlock), 500);
  }

  function _blankProject() {
    return {
      version: 1,
      meta: { title: 'New Project', subtitle: '', author: '', created: new Date().getFullYear().toString(), format: 'screenplay' },
      characters: [],
      scenes: [],
    };
  }

  // ── State event bindings ──────────────────────────────────────────────────

  function _bindStateEvents() {
    State.on('project:loaded', (project) => {
      UI.setFormat(project.meta?.format || 'screenplay');
      UI.renderSidebar();
      UI.renderCharList();
      const firstScene = project.scenes[0];
      if (firstScene) _loadScene(firstScene.id);
      else UI.showEmptyState();
      UI.setTitle(project.meta?.title || 'Untitled');
    });

    State.on('scenes:changed', () => {
      UI.renderSidebar();
    });

    State.on('characters:changed', () => {
      UI.renderCharList();
    });

    State.on('format:changed', (fmt) => {
      UI.setFormat(fmt);
    });

    State.on('state:dirty', () => {
      UI.setSaveIndicator('');
    });

    State.on('tts:started', (sceneId) => {
      UI.renderSidebar(); // Update play buttons
    });

    State.on('tts:stopped', () => {
      UI.renderSidebar();
    });

    State.on('tts:line', (item) => {
      UI.setNowPlaying(item);
    });
  }

  // ── UI event bindings ─────────────────────────────────────────────────────

  function _bindUIEvents() {
    // Cmd+S / Ctrl+S
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveToFile();
      }
    });

    // Format switch
    document.getElementById('format-select').addEventListener('change', (e) => {
      State.setFormat(e.target.value);
    });
  }

  // ── Scene management ──────────────────────────────────────────────────────

  function _saveCurrentScene() {
    const id = State.get().activeSceneId;
    if (!id) return;
    const blocks = Editor.getBlocks();
    State.updateScene(id, blocks);
  }

  function _loadScene(id) {
    _saveCurrentScene();
    State.setActiveScene(id);
    const scene = State.get().project.scenes.find(s => s.id === id);
    if (!scene) { UI.showEmptyState(); return; }
    UI.setSceneTitle(scene.title);
    UI.showEditor();
    Editor.renderScene(scene);
    UI.renderSidebar();
    _updateWordCount();
  }

  function newScene(title) {
    _saveCurrentScene();
    const id = 'b' + Date.now();
    const scene = {
      id,
      title: title || `Scene ${State.get().project.scenes.length + 1}`,
      blocks: [
        { id: id + '_1', type: 'scene-heading', text: 'INT. LOCATION' },
        { id: id + '_2', type: 'action', text: '' },
      ],
    };
    State.addScene(scene);
    _loadScene(id);
  }

  function deleteScene(id) {
    if (State.get().project.scenes.length <= 1) return;
    State.removeScene(id);
    const first = State.get().project.scenes[0];
    if (first) _loadScene(first.id);
  }

  function updateSceneTitle(title) {
    const id = State.get().activeSceneId;
    if (id) State.updateSceneTitle(id, title);
  }

  function _updateWordCount() {
    const blocks = Editor.getBlocks();
    let words = 0;
    blocks.forEach(b => {
      if (b.text.trim()) words += b.text.trim().split(/\s+/).length;
    });
    UI.setWordCount(words);
  }

  // ── Character management ──────────────────────────────────────────────────

  function addCharacter(name) {
    const clean = name.trim().toUpperCase();
    if (clean) State.addCharacter(clean);
  }

  function removeCharacter(name) {
    State.removeCharacter(name);
  }

  function insertCharacterBlock(name) {
    const active = Editor.getActiveBlock();
    // Insert CHARACTER + DIALOGUE block pair after active block
    // Editor handles this internally via keyboard; expose for sidebar clicks
    const idA = 'b' + Date.now();
    const idB = 'b' + (Date.now() + 1);
    const charEl = document.createElement('div');
    // Delegate to Editor to insert blocks at cursor
    // For now, append to end — full implementation in next iteration
    _showToast(`Click in the editor where you want to insert ${name}`);
  }

  // ── Save / Load ───────────────────────────────────────────────────────────

  function saveToFile() {
    _saveCurrentScene();
    const project = State.get().project;
    project.meta = project.meta || {};
    project.ttsVoices = TTS.getCharacterVoices();
    const filename = Storage.saveToFile(project);
    State.markClean();
    UI.setSaveIndicator(`⬇ Saved: ${filename}`);
  }

  async function loadFromFile() {
    try {
      const data = await Storage.loadFromFile();
      if (data.ttsVoices) TTS.setCharacterVoices(data.ttsVoices);
      State.setProject(data);
      _showToast('Project loaded');
    } catch (e) {
      _showToast('Could not load file: ' + e.message);
    }
  }

  function exportTxt() {
    _saveCurrentScene();
    Storage.exportTxt(State.get().project);
  }

  function exportForElevenLabs(sceneOnly = false) {
    _saveCurrentScene();
    const id = sceneOnly ? State.get().activeSceneId : null;
    Storage.exportForElevenLabs(State.get().project, id);
    _showToast('Exported 2 files: dialogue + sound cues');
  }

  function showPdfExport() {
    _saveCurrentScene();
    UI.showPdfPreview(State.get().project);
  }

  // ── ElevenLabs integration ────────────────────────────────────────────────

  async function elSetApiKey(key) {
    const result = await ElevenLabsService.validateApiKey(key);
    if (!result.valid) {
      _showToast('Invalid API key: ' + result.error);
      return false;
    }
    try {
      _elApiKey = key;
      _elVoices = await ElevenLabsService.getVoices(key);
      UI.renderElVoicePanel(_elVoices, _elVoiceMap);
      _showToast(`Connected — ${_elVoices.length} voices available`);
      return true;
    } catch (e) {
      console.error('Failed to fetch ElevenLabs voices:', e);
      _showToast('Could not fetch voices: ' + (e.message || e));
      return false;
    }
  }

  function elSetVoice(character, voiceId) {
    _elVoiceMap[character] = voiceId;
  }

  async function elGenerateScene() {
    // Instrumentation: show immediate feedback and robust error handling
    console.log('App.elGenerateScene invoked');
    UI.showGenerationProgress('Preparing generation...');
    try {
      if (!_elApiKey) {
        UI.hideGenerationProgress();
        UI.showElApiKeyPrompt();
        return;
      }

      _saveCurrentScene();
      const id = State.get().activeSceneId;
      const scene = State.get().project.scenes.find(s => s.id === id);
      if (!scene) {
        UI.hideGenerationProgress();
        _showToast('No active scene to generate');
        return;
      }

      const stageMgrId = _elVoiceMap['__STAGE_MANAGER__'] || _elVoices[0]?.id;
      const { dialogueInputs, soundCues } = ElevenLabsService.parseSceneForGeneration(
        scene.blocks, _elVoiceMap, stageMgrId
      );

      // Check for unassigned voices
      const unassigned = [...new Set(dialogueInputs.filter(i => !i.voiceId && i.character !== '__STAGE_MANAGER__').map(i => i.character))];
      if (unassigned.length) {
        UI.hideGenerationProgress();
        _showToast(`Please assign ElevenLabs voices for: ${unassigned.join(', ')}`);
        UI.showElVoicePanel();
        return;
      }

      UI.showGenerationProgress('Generating dialogue...');

      // Generate dialogue
      const audioBlob = await ElevenLabsService.generateDialogue(_elApiKey, dialogueInputs);
      _downloadBlob(audioBlob, `${scene.title}-dialogue.mp3`);

      // Generate sound effects one at a time
      if (soundCues.length) {
        UI.showGenerationProgress(`Generating ${soundCues.length} sound cues...`);
        for (let i = 0; i < soundCues.length; i++) {
          const cue = soundCues[i];
          UI.showGenerationProgress(`Sound cue ${i+1}/${soundCues.length}: ${cue.label}`);
          const sfxBlob = await ElevenLabsService.generateSoundEffect(_elApiKey, cue.prompt);
          _downloadBlob(sfxBlob, `sfx-${String(i+1).padStart(2,'0')}-${_slugify(cue.label)}.mp3`);
          await _sleep(500); // Rate limiting courtesy pause
        }
      }

      UI.hideGenerationProgress();
      _showToast(`Done — ${soundCues.length} SFX + dialogue downloaded`);
    } catch (e) {
      console.error('elGenerateScene error', e);
      UI.hideGenerationProgress();
      _showToast('Generation failed: ' + (e && e.message ? e.message : e));
    }
  }

  // ── TTS (browser preview) ─────────────────────────────────────────────────

  function ttsPlay(sceneId) {
    if (TTS.isPlaying() && TTS.activeSceneId() === sceneId) {
      TTS.stop();
    } else {
      _saveCurrentScene();
      TTS.play(sceneId);
    }
  }

  function ttsStop() {
    TTS.stop();
  }

  // ── Autosave ──────────────────────────────────────────────────────────────

  function _startAutosave() {
    setInterval(() => {
      if (!State.get().isDirty) return;
      _saveCurrentScene();
      Storage.saveLocal(State.get().project);
    }, CONFIG.storage.autosaveIntervalMs);
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  function toggleTheme() {
    const isLight = document.body.classList.toggle('light');
    document.getElementById('theme-btn').textContent = isLight ? '☾' : '☀︎';
    State.setUI('theme', isLight ? 'light' : 'dark');
  }

  function changeFontSize(delta) {
    _fontSize = Math.min(24, Math.max(12, _fontSize + delta));
    document.body.style.setProperty('--editor-font-size', _fontSize + 'px');
    UI.setSaveIndicator(`Editor text: ${_fontSize}px`);
    State.setUI('fontSize', _fontSize);
    _persistUISettings();
  }
  function _persistUISettings() {
    try {
      Storage.saveUI({ theme: State.get().ui.theme, fontSize: _fontSize });
    } catch (e) {
      console.warn('Persist UI settings failed', e);
    }
  }

  function _restoreUISettings() {
    try {
      const uiSettings = Storage.loadUI();
      if (!uiSettings) {
        document.body.style.setProperty('--editor-font-size', _fontSize + 'px');
        return;
      }

      if (uiSettings.theme) {
        const isLight = uiSettings.theme === 'light';
        document.body.classList.toggle('light', isLight);
        const btn = document.getElementById('theme-btn');
        if (btn) btn.textContent = isLight ? '☾' : '☀︎';
        State.setUI('theme', uiSettings.theme);
      }

      if (uiSettings.fontSize) {
        _fontSize = Math.min(24, Math.max(12, uiSettings.fontSize));
        document.body.style.setProperty('--editor-font-size', _fontSize + 'px');
        State.setUI('fontSize', _fontSize);
      } else {
        document.body.style.setProperty('--editor-font-size', _fontSize + 'px');
      }
    } catch (e) {
      console.warn('Restore UI settings failed', e);
      document.body.style.setProperty('--editor-font-size', _fontSize + 'px');
    }
  }

  function _showToast(msg) {
    UI.setSaveIndicator(msg);
  }

  function _downloadBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function _slugify(str) {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30);
  }

  function _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  return {
    init,
    newScene,
    deleteScene,
    updateSceneTitle,
    addCharacter,
    removeCharacter,
    insertCharacterBlock,
    saveToFile,
    loadFromFile,
    exportTxt,
    exportForElevenLabs,
    showPdfExport,
    elSetApiKey,
    elSetVoice,
    elGenerateScene,
    ttsPlay,
    ttsStop,
    toggleTheme,
    changeFontSize,
  };
})();
