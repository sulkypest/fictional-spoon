/**
 * tts.js
 * Browser-based TTS for local script preview.
 * Uses Web Speech API — no API key required.
 * Separate from ElevenLabs (elevenlabs.js) which handles production audio.
 */

const TTS = (() => {
  let _voices = [];
  let _characterVoices = {};   // { CHARACTER_NAME: voiceURI }
  let _activeSceneId = null;
  let _queue = [];
  let _index = 0;
  let _speaking = false;
  let _currentChar = null;
  let _onBlockChange = null;   // Callback for teleprompter highlighting

  // ── Init ──────────────────────────────────────────────────────────────────

  function init(onBlockChange) {
    _onBlockChange = onBlockChange;
    _loadVoices();
  }

  function _loadVoices() {
    const load = () => {
      _voices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
      if (_voices.length) _autoAssign();
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
  }

  function _autoAssign() {
    const chars = State.get().project?.characters || [];
    chars.forEach((char, i) => {
      if (!_characterVoices[char]) {
        _characterVoices[char] = _voices[i % _voices.length]?.voiceURI;
      }
    });
    if (!_characterVoices['__STAGE_MANAGER__']) {
      _characterVoices['__STAGE_MANAGER__'] = _voices[Math.min(2, _voices.length - 1)]?.voiceURI;
    }
  }

  // ── Voice management ──────────────────────────────────────────────────────

  function getVoices() {
    // Always re-fetch — browser may have loaded more
    const fresh = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
    if (fresh.length > _voices.length) _voices = fresh;
    return _voices;
  }

  function setCharacterVoice(character, voiceURI) {
    _characterVoices[character] = voiceURI;
  }

  function getCharacterVoices() {
    return { ..._characterVoices };
  }

  function setCharacterVoices(map) {
    _characterVoices = { ...map };
  }

  function _getVoice(uri) {
    return getVoices().find(v => v.voiceURI === uri) || getVoices()[0] || null;
  }

  // ── Playback ──────────────────────────────────────────────────────────────

  function play(sceneId) {
    stop();
    const scene = State.getActiveScenes().find(s => s.id === sceneId);
    if (!scene) return;

    _queue = _buildQueue(scene.blocks);
    if (!_queue.length) return;

    _activeSceneId = sceneId;
    _index = 0;
    _speaking = true;
    State.emit('tts:started', sceneId);
    _next();
  }

  function stop() {
    _speaking = false;
    _activeSceneId = null;
    _queue = [];
    _index = 0;
    _currentChar = null;
    window.speechSynthesis.cancel();
    State.emit('tts:stopped');
    if (_onBlockChange) _onBlockChange(null);
  }

  function isPlaying() { return _speaking; }
  function activeSceneId() { return _activeSceneId; }

  function _buildQueue(blocks) {
    const q = [];
    let char = null;
    let charId = null;

    for (const b of blocks) {
      const text = (b.text || '').trim();
      if (!text) continue;

      if (b.type === 'character') { char = text; charId = b.id; continue; }

      if (b.type === 'dialogue') {
        q.push({ text, speaker: char || 'NARRATOR', type: 'dialogue', blockId: charId || b.id });
        continue;
      }
      if (b.type === 'parenthetical') {
        q.push({ text: text.replace(/^\(|\)$/g,''), speaker: '__STAGE_MANAGER__', type: 'parenthetical', blockId: b.id });
        char = null; continue;
      }
      if (b.type === 'sound') {
        q.push({ text: 'Sound — ' + text.toLowerCase().replace(/\.$/,''), speaker: '__STAGE_MANAGER__', type: 'sound', blockId: b.id });
        char = null; continue;
      }
      if (b.type === 'action') {
        q.push({ text, speaker: '__STAGE_MANAGER__', type: 'action', blockId: b.id });
        char = null; continue;
      }
      if (b.type === 'scene-heading') {
        q.push({ text: 'Scene — ' + text, speaker: '__STAGE_MANAGER__', type: 'heading', blockId: b.id });
        char = null; continue;
      }
    }
    return q;
  }

  function _next() {
    if (!_speaking || _index >= _queue.length) { stop(); return; }

    const item = _queue[_index++];
    const utt = new SpeechSynthesisUtterance(item.text);

    const voice = _getVoice(_characterVoices[item.speaker]);
    if (voice) utt.voice = voice;

    const isStage = item.type !== 'dialogue';
    utt.rate   = isStage ? 0.85 : 1.0;
    utt.pitch  = isStage ? 0.9  : 1.0;
    utt.volume = isStage ? 0.7  : 1.0;

    State.emit('tts:line', item);
    if (_onBlockChange) _onBlockChange(item.blockId);

    utt.onend   = () => setTimeout(_next, isStage ? 300 : 120);
    utt.onerror = () => _next();
    window.speechSynthesis.speak(utt);
  }

  return {
    init,
    getVoices,
    setCharacterVoice,
    getCharacterVoices,
    setCharacterVoices,
    play,
    stop,
    isPlaying,
    activeSceneId,
  };
})();
