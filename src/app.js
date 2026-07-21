/**
 * app.js
 * Main application controller.
 * Wires together State, Editor, TTS, ElevenLabsService, Storage, and UI.
 */

const App = (() => {

  let _currentUser = null;
  let _elVoices = [];        // ElevenLabs voice list (voices already in this account)
  let _elVoiceMap = {};      // { CHARACTER: elevenlabs_voice_id }
  let _pendingGeneration = null;
  let _fontSize = 15;

  // Voice Library browse/filter state
  let _elLibrary = {
    voices: [],
    filters: { search: '', gender: '', age: '', accent: '', useCase: '' },
    page: 0,
    hasMore: false,
    loading: false,
  };

  // ── Bootstrap ─────────────────────────────────────────────────────────────

  function init() {
    console.log('=== App.init starting ===');
    Editor.init(document.getElementById('script-editor'));
    TTS.init(Editor.highlightBlock);

    _bindStateEvents();
    _bindUIEvents();
    _startAutosave();

    if (window.FirebaseAuth) {
      console.log('✓ FirebaseAuth global found, calling FirebaseAuth.init');
      FirebaseAuth.init(_handleAuthStateChange);
      console.log('✓ FirebaseAuth.init completed');
    } else {
      console.error('✗ FirebaseAuth global NOT found!');
    }

    _restoreUISettings();

    // Try restoring last session from localStorage
    const saved = Storage.loadLocal();
    if (saved) {
      State.setProject(_migrateProject(saved));
      _showToast('Session restored');
    } else {
      // Load blank project — user will open or create
      State.setProject(_blankProject());
    }

    setTimeout(() => TTS.init(Editor.highlightBlock), 500);
  }

  function _blankProject() {
    return {
      version: 2,
      meta: { title: 'New Project', author: '', created: new Date().getFullYear().toString(), format: 'screenplay' },
      characters: [],
      characterNotes: {},
      episodes: [{ id: 'ep' + Date.now(), title: 'Episode 1', scenes: [] }],
    };
  }

  // Older projects/exports store scenes directly on the project. Wrap them into
  // a single episode so every project flowing through the app is the same
  // shape — every load path (local storage, file import, cloud sync) must run
  // through this before the rest of the app ever sees the project.
  function _migrateProject(project) {
    if (!project) return project;
    if (Array.isArray(project.episodes)) {
      project.episodes.forEach(ep => { if (!Array.isArray(ep.scenes)) ep.scenes = []; });
      if (!project.characterNotes) project.characterNotes = {};
      return project;
    }
    const scenes = Array.isArray(project.scenes) ? project.scenes : [];
    const migrated = {
      ...project,
      characterNotes: project.characterNotes || {},
      episodes: [{ id: 'ep' + Date.now(), title: project.meta?.subtitle || 'Episode 1', scenes }],
    };
    delete migrated.scenes;
    return migrated;
  }

  // ── State event bindings ──────────────────────────────────────────────────

  function _bindStateEvents() {
    State.on('project:loaded', (project) => {
      UI.setFormat(project.meta?.format || 'screenplay');
      UI.renderEpisodeSelector();
      UI.renderSidebar();
      UI.renderCharList();
      const scenes = State.getActiveScenes();
      const firstScene = scenes.find(s => (s.status || 'active') === 'active') || scenes[0];
      if (firstScene) _loadScene(firstScene.id);
      else UI.showEmptyState();
      UI.setTitle(project.meta?.title || 'Untitled');
      // The ElevenLabs "Your cast" list reads project.characters at render time —
      // if the project changes after it last rendered (e.g. cloud sync finishing
      // after sign-in, or a manual import), it would otherwise be stuck showing
      // whatever characters existed at that one-time render, not the real cast.
      UI.renderElVoicePanel(_elVoices, _elVoiceMap);
    });

    State.on('scenes:changed', () => {
      UI.renderSidebar();
    });

    State.on('episodes:changed', () => {
      UI.renderEpisodeSelector();
    });

    State.on('episode:changed', () => {
      UI.renderEpisodeSelector();
      UI.renderSidebar();
      const scenes = State.getActiveScenes();
      const firstScene = scenes.find(s => (s.status || 'active') === 'active') || scenes[0];
      if (firstScene) _loadScene(firstScene.id);
      else UI.showEmptyState();
    });

    State.on('characters:changed', () => {
      UI.renderCharList();
      UI.renderElVoicePanel(_elVoices, _elVoiceMap);
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
    const scene = State.getActiveScenes().find(s => s.id === id);
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
      title: title || `Scene ${State.getActiveScenes().length + 1}`,
      blocks: [
        { id: id + '_1', type: 'scene-heading', text: 'INT. LOCATION' },
        { id: id + '_2', type: 'action', text: '' },
      ],
    };
    State.addScene(scene);
    _loadScene(id);
  }

  // ── Episodes ──────────────────────────────────────────────────────────────
  // Characters/voices are shared series-wide; only the scene list is per-episode.

  function newEpisode() {
    _saveCurrentScene();
    const episodes = State.get().project.episodes;
    const episode = { id: 'ep' + Date.now(), title: `Episode ${episodes.length + 1}`, scenes: [] };
    State.addEpisode(episode);
    State.setActiveEpisode(episode.id);
  }

  function switchEpisodeRelative(direction) {
    _saveCurrentScene();
    const episodes = State.get().project.episodes;
    const currentId = State.get().activeEpisodeId;
    const index = episodes.findIndex(e => e.id === currentId);
    const next = episodes[index + direction];
    if (next) State.setActiveEpisode(next.id);
  }

  function renameEpisode(title) {
    const id = State.get().activeEpisodeId;
    if (id) State.updateEpisodeTitle(id, title);
  }

  function deleteEpisode() {
    _saveCurrentScene();
    State.removeEpisode(State.get().activeEpisodeId);
  }

  function deleteScene(id) {
    const scenes = State.getActiveScenes();
    const scene = scenes.find(s => s.id === id);
    if (!scene) return;
    const isActive = (scene.status || 'active') === 'active';
    const activeCount = scenes.filter(s => (s.status || 'active') === 'active').length;
    if (isActive && activeCount <= 1) return;

    const wasOpen = State.get().activeSceneId === id;
    State.removeScene(id);
    if (wasOpen) {
      const remaining = State.getActiveScenes();
      const nextActive = remaining.find(s => (s.status || 'active') === 'active');
      const fallback = nextActive || remaining[0];
      if (fallback) _loadScene(fallback.id);
    }
  }

  function moveScene(id, direction) {
    State.moveScene(id, direction);
    UI.renderSidebar();
  }

  function setSceneStatus(id, status) {
    // If you move the scene you're currently looking at into drafts, don't leave
    // the editor pointed at a scene that's no longer part of the main sequence.
    const movingOpenSceneToDraft = State.get().activeSceneId === id && status === 'draft';
    State.setSceneStatus(id, status);
    if (movingOpenSceneToDraft) {
      const nextActive = State.getActiveScenes().find(s => (s.status || 'active') === 'active');
      if (nextActive) _loadScene(nextActive.id);
    }
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
    UI.setWordCount(words, Timing.estimateSeconds(blocks));
  }

  // ── Character management ──────────────────────────────────────────────────

  function addCharacter(name) {
    const clean = name.trim().toUpperCase();
    if (clean) State.addCharacter(clean);
  }

  function removeCharacter(name) {
    State.removeCharacter(name);
  }

  function setCharacterNotes(name, notes) {
    State.setCharacterNotes(name, notes);
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

  function _requireAuth(action = 'use Cue Fighters') {
    if (_currentUser) {
      UI.clearSignInPrompt();
      return true;
    }
    UI.setSignInPrompt(`Sign in to ${action}.`);
    _showToast('Sign in first to continue');
    return false;
  }

  function saveToFile() {
    if (!_requireAuth('save your project')) return;
    _saveCurrentScene();
    const project = State.get().project;
    project.meta = project.meta || {};
    project.ttsVoices = TTS.getCharacterVoices();
    if (Object.keys(_elVoiceMap).length) project.elVoiceMap = _elVoiceMap;
    const filename = Storage.saveToFile(project);
    State.markClean();
    UI.setSaveIndicator(`⬇ Saved: ${filename}`);
  }

  async function loadFromFile() {
    if (!_requireAuth('load a project')) return;
    try {
      const data = await Storage.loadFromFile();
      if (data.ttsVoices) TTS.setCharacterVoices(data.ttsVoices);
      if (data.elVoiceMap) { _elVoiceMap = { ...data.elVoiceMap, ..._elVoiceMap }; _persistUISettings(); }
      State.setProject(_migrateProject(data));
      // setProject() marks the project clean, so the autosave dirty-check would
      // otherwise skip persisting an import entirely — save immediately instead
      // of relying on a later edit to trigger it.
      _touchProjectUpdatedAt();
      Storage.saveLocal(State.get().project);
      if (_currentUser) {
        const ok = await _saveProjectToCloud();
        _showToast(ok ? 'Project loaded' : 'Project loaded — cloud save failed, local copy kept');
      } else {
        _showToast('Project loaded');
      }
    } catch (e) {
      _showToast('Could not load file: ' + e.message);
    }
  }

  // Exports/PDF are a per-episode concept — build a view shaped like the old
  // flat project (meta + scenes) so storage.js/ui.js don't need to know
  // episodes exist at all.
  function _episodeView() {
    const project = State.get().project;
    const episode = State.getActiveEpisode();
    return {
      meta: { ...project.meta, subtitle: episode?.title || project.meta?.subtitle || '' },
      scenes: State.getActiveScenes(),
    };
  }

  function exportTxt() {
    if (!_requireAuth('export your script')) return;
    _saveCurrentScene();
    Storage.exportTxt(_episodeView());
  }

  function exportForElevenLabs(sceneOnly = false) {
    if (!_requireAuth('export for ElevenLabs')) return;
    _saveCurrentScene();
    const id = sceneOnly ? State.get().activeSceneId : null;
    Storage.exportForElevenLabs(_episodeView(), id);
    _showToast('Exported 2 files: dialogue + sound cues');
  }

  function exportReaper(sceneOnly = false) {
    if (!_requireAuth('export to Reaper')) return;
    _saveCurrentScene();
    const id = sceneOnly ? State.get().activeSceneId : null;
    Storage.exportReaper(_episodeView(), id);
    _showToast('Exported .rpp — open in Reaper to see your tracks');
  }

  function showPdfExport() {
    if (!_requireAuth('preview or export PDF')) return;
    _saveCurrentScene();
    UI.showPdfPreview(_episodeView());
  }

  function _setGenerateUIVisible(visible) {
    const elGenRow = document.getElementById('el-generate-row');
    const elGenOptions = document.getElementById('el-generate-options');
    if (elGenRow) elGenRow.style.display = visible ? 'flex' : 'none';
    if (elGenOptions) elGenOptions.style.display = visible ? 'block' : 'none';
  }

  // ── Project cloud sync ───────────────────────────────────────────────────────
  // Conflict policy is last-write-wins, keyed off project.meta.updatedAt (stamped
  // here on every save) — there's no merge across devices. Whichever copy has the
  // newer timestamp replaces the other.

  function _touchProjectUpdatedAt() {
    const project = State.get().project;
    if (project?.meta) project.meta.updatedAt = Date.now();
  }

  async function _saveProjectToCloud() {
    if (!_currentUser) return;
    try {
      const token = await FirebaseAuth.getToken();
      const res = await fetch(CONFIG.elevenlabs.apiBaseUrl + '/saveProject', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ project: State.get().project }),
      });
      if (!res.ok) {
        console.warn('Cloud project save failed:', res.status);
        UI.setSaveIndicator('⚠ Cloud save failed — project saved locally only');
        return false;
      }
      return true;
    } catch (e) {
      console.warn('Cloud project save failed:', e);
      UI.setSaveIndicator('⚠ Cloud save failed — project saved locally only');
      return false;
    }
  }

  async function _syncProjectWithCloud() {
    if (!_currentUser) return;
    try {
      const token = await FirebaseAuth.getToken();
      const res = await fetch(CONFIG.elevenlabs.apiBaseUrl + '/loadProject', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const cloudProject = data.project ? _migrateProject(data.project) : null;
      const localProject = State.get().project;
      const cloudTime = cloudProject?.meta?.updatedAt || 0;
      const localTime = localProject?.meta?.updatedAt || 0;
      const localHasContent = localProject?.episodes?.some(e => e.scenes.length);

      if (cloudProject && cloudTime > localTime) {
        State.setProject(cloudProject);
        Storage.saveLocal(cloudProject);
        _showToast('Loaded your latest saved project');
      } else if (localHasContent && localTime >= cloudTime) {
        // Only push local → cloud when local actually has content.
        // Never let a blank local project (empty scenes, missing timestamp) overwrite
        // a real cloud project just because the timestamps happen to compare equal.
        await _saveProjectToCloud();
      }
      // If local has no content and cloud has nothing, leave both alone — a blank
      // project should never be pushed to cloud and silently destroy an older save.
    } catch (e) {
      console.warn('Project sync failed:', e);
    }
  }

  async function _handleAuthStateChange(user) {
    console.log('=== Auth state changed ===', user ? `User: ${user.email}` : 'No user (signed out)');
    _currentUser = user;
    UI.setAuthState(user);

    if (user) {
      console.log('✓ User logged in');
      // The editor itself doesn't need ElevenLabs/cloud data to work, so never let a
      // slow/cold backend call (Cloud Function cold start, ElevenLabs API) block
      // the main app from appearing — load it in the background instead.
      UI.clearSignInPrompt();
      UI.hideSplashScreen();
      _syncProjectWithCloud();
      _loadElUserSettings()
        .catch(e => console.warn('Failed to load ElevenLabs user settings:', e))
        .then(() => _refreshElVoicesIfPossible())
        .catch(e => console.warn('Failed to refresh ElevenLabs voices:', e));
    } else {
      console.log('User logged out, showing splash screen');
      _elVoices = [];
      _elVoiceMap = {};
      UI.renderElVoicePanel(_elVoices, _elVoiceMap);
      _setGenerateUIVisible(false);
      UI.setElPanelAuthNote('Sign in to save your ElevenLabs key securely.');
      UI.setSignInPrompt('Sign in to save/load scripts and access ElevenLabs.');
      UI.showSplashScreen();
    }
  }

  async function toggleAuth() {
    if (!_currentUser) {
      try {
        console.log('=== User clicked Sign In ===');
        console.log('Attempting Firebase sign-in...');
        const result = await FirebaseAuth.signIn();
        console.log('✓ Sign-in completed, result:', result);
      } catch (e) {
        console.error('✗ Sign-in error:', e);
        const errorMsg = e?.code || e?.message || 'Unknown error';
        _showToast('Sign-in failed: ' + errorMsg);
      }
    } else {
      try {
        if (State.get().isDirty) {
          _saveCurrentScene();
          _touchProjectUpdatedAt();
          Storage.saveLocal(State.get().project);
          await _saveProjectToCloud();
        }
        await FirebaseAuth.signOut();
      } catch (e) {
        _showToast('Sign-out failed');
      }
    }
  }

  async function _saveElUserSettings() {
    if (!_currentUser) return false;
    try {
      const token = await FirebaseAuth.getToken();
      const res = await fetch(CONFIG.elevenlabs.apiBaseUrl + '/saveSettings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ voiceMap: _elVoiceMap }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        console.warn('Failed to save ElevenLabs user settings:', res.status, error);
        _showToast(`Voice saved on this device only — sync failed (${res.status})`);
        return false;
      }
      return true;
    } catch (e) {
      console.warn('Failed to save ElevenLabs user settings', e);
      _showToast('Voice saved on this device only — sync to your account failed');
      return false;
    }
  }

  async function _loadElUserSettings() {
    if (!_currentUser) return;
    try {
      const token = await FirebaseAuth.getToken();
      const res = await fetch(CONFIG.elevenlabs.apiBaseUrl + '/userSettings', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.voiceMap) {
        // Merge rather than replace: _elVoiceMap may already hold the locally-restored
        // (or just-assigned) map, which is more trustworthy than a server copy that can
        // be stale if a previous save failed or raced with a reload. Local entries win.
        _elVoiceMap = { ...data.voiceMap, ..._elVoiceMap };
      }
    } catch (e) {
      console.warn('Failed to load ElevenLabs user settings', e);
    }
  }

  async function _refreshElVoicesIfPossible() {
    if (!_currentUser) return;
    try {
      _elVoices = await ElevenLabsService.getVoices(null);
      UI.renderElVoicePanel(_elVoices, _elVoiceMap);
      if (_elVoices.length) {
        _setGenerateUIVisible(true);
        UI.setElPanelAuthNote(`Signed in as ${_currentUser.displayName || _currentUser.email}.`);
      }
    } catch (e) {
      console.warn('Could not refresh ElevenLabs voices after sign-in', e);
      _setGenerateUIVisible(false);
      UI.setElPanelAuthNote('Sign in and save your ElevenLabs API key to enable generation.');
    }
  }

  function openElPanel() {
    if (!_currentUser) {
      UI.toggleElPanel();
      _setGenerateUIVisible(false);
      UI.setElPanelAuthNote('Please sign in to Cue Fighters before using ElevenLabs.');
      return;
    }
    UI.toggleElPanel();
    if (!_elLibrary.voices.length && !_elLibrary.loading) {
      elSearchVoiceLibrary();
    }
  }

  // ── ElevenLabs integration ────────────────────────────────────────────────

  async function elSaveApiKey(key) {
    if (!_currentUser) {
      _showToast('Sign in first to save your ElevenLabs key');
      return false;
    }
    if (!key) {
      _showToast('Please enter your ElevenLabs API key');
      return false;
    }
    try {
      const token = await FirebaseAuth.getToken();
      if (!token) { _showToast('Could not get auth token — try signing out and back in'); return false; }
      const res = await fetch(CONFIG.elevenlabs.apiBaseUrl + '/saveKey', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ key, voiceMap: _elVoiceMap }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        _showToast('Could not save key: ' + (error?.error || res.statusText));
        return false;
      }
      _elVoices = await ElevenLabsService.getVoices(null);
      UI.renderElVoicePanel(_elVoices, _elVoiceMap);
      _setGenerateUIVisible(true);
      UI.setElPanelAuthNote(`Key saved securely. Signed in as ${_currentUser.displayName || _currentUser.email}.`);
      _showToast(`Connected — ${_elVoices.length} voices available`);
      elSearchVoiceLibrary();
      return true;
    } catch (e) {
      console.error('Failed to save ElevenLabs key:', e);
      _showToast('Could not save key: ' + (e.message || e));
      return false;
    }
  }

  async function elRefreshVoices() {
    if (!_currentUser) {
      _showToast('Sign in first to refresh voices');
      return false;
    }
    try {
      _saveCurrentScene(); // flush editor so new CHARACTER blocks are in state before scan
      _elVoices = await ElevenLabsService.getVoices(null);
      UI.renderElVoicePanel(_elVoices, _elVoiceMap);
      _showToast(`Voices refreshed — ${_elVoices.length} voices`);
      return true;
    } catch (e) {
      console.error('Failed to refresh voices', e);
      _showToast('Could not refresh voices: ' + (e.message || e));
      return false;
    }
  }

  // ── Voice Library browse/filter ───────────────────────────────────────────

  async function elSearchVoiceLibrary(filters = {}, { append = false } = {}) {
    if (!_currentUser) return;
    const nextFilters = { ..._elLibrary.filters, ...filters };
    const page = append ? _elLibrary.page + 1 : 0;
    _elLibrary.filters = nextFilters;
    _elLibrary.loading = true;
    UI.renderElVoiceLibrary(_elLibrary);
    try {
      const { voices, hasMore } = await ElevenLabsService.searchVoiceLibrary(null, { ...nextFilters, page });
      _elLibrary.voices = append ? [..._elLibrary.voices, ...voices] : voices;
      _elLibrary.page = page;
      _elLibrary.hasMore = hasMore;
    } catch (e) {
      console.error('Voice Library search failed', e);
      _showToast('Could not search Voice Library: ' + (e.message || e));
      if (!append) _elLibrary.voices = [];
    } finally {
      _elLibrary.loading = false;
      UI.renderElVoiceLibrary(_elLibrary);
    }
  }

  function elLoadMoreVoiceLibrary() {
    if (_elLibrary.loading || !_elLibrary.hasMore) return;
    elSearchVoiceLibrary({}, { append: true });
  }

  // Assign a voice found via the Voice Library to a character. Shared voices must be
  // added to this account before their id is usable for generation, so this performs
  // that step first, then assigns the resulting (now-owned) voice id as normal.
  async function elAssignLibraryVoice(character, voice) {
    if (!_currentUser) {
      _showToast('Sign in first to assign voices');
      return;
    }
    try {
      _showToast(`Adding "${voice.name}" to your voices...`);
      const newVoiceId = await ElevenLabsService.addSharedVoice(null, voice.publicOwnerId, voice.id, voice.name);
      elSetVoice(character, newVoiceId);
      _elVoices = await ElevenLabsService.getVoices(null);
      UI.renderElVoicePanel(_elVoices, _elVoiceMap);
      UI.renderElVoiceLibrary(_elLibrary);
      if (_elVoices.length) _setGenerateUIVisible(true);
      _showToast(`${voice.name} assigned to ${character === '__STAGE_MANAGER__' ? 'Stage Mgr' : character}`);
    } catch (e) {
      console.error('Failed to assign library voice', e);
      _showToast('Could not assign voice: ' + (e.message || e));
    }
  }

  function elSetVoice(character, voiceId) {
    _elVoiceMap[character] = voiceId;
    _persistUISettings();
    if (_currentUser) {
      _saveElUserSettings();
    }
  }

  async function elGenerateScene() {
    if (!_currentUser) {
      _showToast('Sign in first to generate with ElevenLabs');
      return;
    }

    UI.showGenerationProgress('Preparing generation...');
    try {
      _saveCurrentScene();
      const id = State.get().activeSceneId;
      const scene = State.getActiveScenes().find(s => s.id === id);
      if (!scene) {
        UI.hideGenerationProgress();
        _showToast('No active scene to generate');
        return;
      }

      const outputMode = document.querySelector('input[name="el-output-mode"]:checked')?.value || 'combined';
      const includeDirections = document.getElementById('el-include-directions')?.checked || false;

      const stageMgrId = _elVoiceMap['__STAGE_MANAGER__'] || _elVoices[0]?.id;
      const { segments, dialogueInputs } = ElevenLabsService.parseSceneForGeneration(
        scene.blocks, _elVoiceMap, stageMgrId, { includeDirections }
      );
      console.log('[elGenerateScene] segments:', segments.length, 'outputMode:', outputMode, 'includeDirections:', includeDirections);

      const unassigned = [...new Set(dialogueInputs.filter(i => !i.voiceId && i.character !== '__STAGE_MANAGER__').map(i => i.character))];
      if (unassigned.length) {
        UI.hideGenerationProgress();
        _showToast(`Please assign ElevenLabs voices for: ${unassigned.join(', ')}`);
        UI.showElVoicePanel();
        return;
      }

      if (!segments.length) {
        UI.hideGenerationProgress();
        _showToast('This scene has nothing to generate');
        return;
      }

      // Generate every segment in script order, so the result can be sequenced
      // (combined mode) or labelled in running order (zip mode).
      const generated = [];
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (seg.type === 'dialogue') {
          UI.showGenerationProgress(`Generating dialogue (${i + 1}/${segments.length})...`);
          const blob = await ElevenLabsService.generateDialogueChunk(null, seg.inputs);
          const chars = [...new Set(seg.inputs.map(i => i.character).filter(Boolean))];
          generated.push({ blob, kind: 'dialogue', label: 'dialogue', characters: chars });
        } else {
          UI.showGenerationProgress(`Generating sound effect (${i + 1}/${segments.length}): ${seg.label}`);
          const blob = await ElevenLabsService.generateSoundEffect(null, seg.prompt);
          generated.push({ blob, kind: 'sound', label: seg.label });
          await _sleep(500);
        }
      }

      const baseName = _slugify(scene.title) || 'scene';
      if (outputMode === 'zip') {
        UI.showGenerationProgress('Packaging zip...');
        const files = [];
        const manifestLines = [`${scene.title} — generated ${new Date().toISOString()}`, ''];
        for (let i = 0; i < generated.length; i++) {
          const g = generated[i];
          const idx = String(i + 1).padStart(2, '0');
          const name = g.kind === 'dialogue' ? `${idx}-dialogue.mp3` : `${idx}-sfx-${_slugify(g.label)}.mp3`;
          files.push({ name, data: await g.blob.arrayBuffer() });
          manifestLines.push(`${idx}. [${g.kind}] ${g.label}`);
        }
        files.push({ name: 'running-order.txt', data: new TextEncoder().encode(manifestLines.join('\n')) });
        _downloadBlob(Zip.createZip(files), `${baseName}.zip`);
      } else if (outputMode === 'reaper') {
        UI.showGenerationProgress('Getting audio durations...');
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const files = [];
        const rppItems = [];
        for (let i = 0; i < generated.length; i++) {
          const g = generated[i];
          const idx = String(i + 1).padStart(2, '0');
          const filename = g.kind === 'dialogue' ? `${idx}-dialogue.mp3` : `${idx}-sfx-${_slugify(g.label)}.mp3`;
          const buf = await g.blob.arrayBuffer();
          let duration = g.kind === 'sound' ? 4.0 : 3.0;
          try {
            const decoded = await audioCtx.decodeAudioData(buf.slice(0));
            duration = decoded.duration;
          } catch (_) { /* use fallback */ }
          files.push({ name: filename, data: buf });
          rppItems.push({ filename, duration, kind: g.kind, characters: g.characters || [], label: g.label });
        }
        audioCtx.close();
        UI.showGenerationProgress('Building Reaper project...');
        const rpp = _buildReaperRpp(scene.title, rppItems);
        files.push({ name: `${baseName}.rpp`, data: new TextEncoder().encode(rpp) });
        _downloadBlob(Zip.createZip(files), `${baseName}-reaper.zip`);
      } else {
        UI.showGenerationProgress('Combining into one file...');
        const combined = await AudioMixer.concatToWav(generated.map(g => g.blob));
        _downloadBlob(combined, `${baseName}.wav`);
      }

      UI.hideGenerationProgress();
      _showToast(`Done — ${generated.length} segments generated`);
    } catch (e) {
      console.error('[elGenerateScene] error', e);
      UI.hideGenerationProgress();
      _showToast('Generation failed: ' + (e && e.message ? e.message : e));
    }
  }

  function _buildReaperRpp(sceneTitle, items) {
    const trackOrder = [];
    const trackMap = {};
    function ensureTrack(name) {
      if (!trackMap[name]) { trackMap[name] = []; trackOrder.push(name); }
    }
    function rppEsc(s) { return (s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }

    let pos = 0;
    const GAP = 0.3;

    for (const item of items) {
      let trackName;
      if (item.kind === 'sound') {
        trackName = 'SFX';
      } else {
        const chars = item.characters.filter(c => c && c !== '__STAGE_MANAGER__');
        if (chars.length === 1) {
          trackName = chars[0];
        } else if (chars.length === 0) {
          trackName = 'NARRATOR';
        } else {
          trackName = 'DIALOGUE';
        }
      }
      ensureTrack(trackName);
      trackMap[trackName].push({ pos, dur: item.duration, file: item.filename, name: item.label || item.filename });
      pos += item.duration + GAP;
    }

    const charTracks = trackOrder.filter(n => n !== 'NARRATOR' && n !== 'SFX' && n !== 'DIALOGUE');
    const utilTracks = trackOrder.filter(n => n === 'DIALOGUE' || n === 'NARRATOR' || n === 'SFX');
    const ordered = [...charTracks, ...utilTracks];

    const out = [];
    out.push('<REAPER_PROJECT 0.1 "6.0" 0');
    out.push('  TEMPO 120 4 4');
    out.push('  PLAYRATE 1 0 0.25 4');
    out.push(`  MARKER 1 0.000000 "${rppEsc(sceneTitle)}" 0 -1 1`);
    ordered.forEach(name => {
      out.push('  <TRACK');
      out.push(`    NAME "${rppEsc(name)}"`);
      out.push('    VOLPAN 1 0 -1 -1 1');
      out.push('    MUTE 0');
      trackMap[name].forEach(item => {
        out.push('    <ITEM');
        out.push(`      POSITION ${item.pos.toFixed(6)}`);
        out.push(`      LENGTH ${item.dur.toFixed(6)}`);
        out.push(`      NAME "${rppEsc(item.name)}"`);
        out.push('      MUTE 0 0');
        out.push('      VOLPAN 1 0 -1 -1');
        out.push('      SOFFS 0 0');
        out.push('      PLAYRATE 1 1 0 -1 0 0.0025');
        out.push('      <SOURCE MP3');
        out.push(`        FILE "${rppEsc(item.file)}"`);
        out.push('      >');
        out.push('    >');
      });
      out.push('  >');
    });
    out.push('>');
    return out.join('\n') + '\n';
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
    // Synchronously flush the current scene to localStorage on page close.
    // The cloud push is async and the browser won't wait for it, but
    // localStorage survives and will be pushed on the next session.
    window.addEventListener('beforeunload', () => {
      _saveCurrentScene();
      _touchProjectUpdatedAt();
      Storage.saveLocal(State.get().project);
    });

    setInterval(() => {
      // Always flush the current scene — the dirty flag can be stale if the editor
      // fires input events faster than markDirty is called. The scene flush is cheap.
      _saveCurrentScene();
      if (!State.get().isDirty) return;
      _touchProjectUpdatedAt();
      Storage.saveLocal(State.get().project);
      if (_currentUser) _saveProjectToCloud();
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
      const payload = { theme: State.get().ui.theme, fontSize: _fontSize };
      if (_elVoiceMap && Object.keys(_elVoiceMap).length) {
        payload.elVoiceMap = _elVoiceMap;
      } else {
        // Don't overwrite an existing voice map with empty — e.g. when font size
        // changes while logged out and _elVoiceMap has been cleared.
        const existing = Storage.loadUI();
        if (existing?.elVoiceMap) payload.elVoiceMap = existing.elVoiceMap;
      }
      Storage.saveUI(payload);
    } catch (e) {
      console.warn('Persist UI settings failed', e);
    }
  }

  async function _restoreUISettings() {
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

      if (uiSettings.elVoiceMap) {
        _elVoiceMap = uiSettings.elVoiceMap;
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
    newEpisode, switchEpisodeRelative, renameEpisode, deleteEpisode,
    deleteScene,
    moveScene,
    setSceneStatus,
    updateSceneTitle,
    addCharacter,
    removeCharacter,
    setCharacterNotes,
    insertCharacterBlock,
    saveToFile,
    loadFromFile,
    exportTxt,
    exportForElevenLabs,
    exportReaper,
    showPdfExport,
    elSaveApiKey,
    elSetVoice,
    elSearchVoiceLibrary,
    elLoadMoreVoiceLibrary,
    elAssignLibraryVoice,
    elGenerateScene,
    openElPanel,
    toggleAuth,
    ttsPlay,
    ttsStop,
    toggleTheme,
    changeFontSize,
  };
})();
