/**
 * state.js
 * Single source of truth for application state.
 * All mutations go through State methods — no direct property writes
 * from other modules. This pattern makes it straightforward to add
 * reactive bindings, undo/redo, or a proper state management library
 * (e.g. Redux) in a future commercial version.
 */

const State = (() => {
  let _state = {
    project: null,       // Loaded project object (meta, characters, episodes)
    activeEpisodeId: null,
    activeSceneId: null,
    format: 'screenplay',
    isDirty: false,      // Unsaved changes flag
    ui: {
      sidebarTab: 'scenes',    // 'scenes' | 'chars'
      voicePanelOpen: false,
      exportPreviewOpen: false,
      theme: 'light',          // 'dark' | 'light'
      fontSize: 15,
    },
  };

  const _listeners = {};

  function on(event, fn) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(fn);
  }

  function emit(event, data) {
    (_listeners[event] || []).forEach(fn => fn(data));
  }

  function get() {
    return _state;
  }

  // Characters/voices are shared project-wide; scenes live inside whichever
  // episode is currently active. Every scene-mutating function below goes
  // through this so there's one place that knows how to find "the scenes".
  function _activeEpisode() {
    const episodes = _state.project?.episodes;
    if (!Array.isArray(episodes) || !episodes.length) return null;
    return episodes.find(e => e.id === _state.activeEpisodeId) || episodes[0];
  }

  function getActiveEpisode() {
    return _activeEpisode();
  }

  function getActiveScenes() {
    return _activeEpisode()?.scenes || [];
  }

  function setProject(project) {
    _state.project = project;
    _state.format = project.meta?.format || 'screenplay';
    _state.activeEpisodeId = project.episodes?.[0]?.id || null;
    _state.isDirty = false;
    emit('project:loaded', project);
  }

  function setActiveEpisode(id) {
    _state.activeEpisodeId = id;
    emit('episode:changed', id);
  }

  function addEpisode(episode) {
    _state.project.episodes.push(episode);
    markDirty();
    emit('episodes:changed');
  }

  function removeEpisode(id) {
    if (_state.project.episodes.length <= 1) return;
    const wasActive = _state.activeEpisodeId === id;
    _state.project.episodes = _state.project.episodes.filter(e => e.id !== id);
    if (wasActive) {
      _state.activeEpisodeId = _state.project.episodes[0]?.id || null;
    }
    markDirty();
    emit('episodes:changed');
    if (wasActive) emit('episode:changed', _state.activeEpisodeId);
  }

  function updateEpisodeTitle(id, title) {
    const ep = _state.project.episodes.find(e => e.id === id);
    if (ep) {
      ep.title = title;
      markDirty();
      emit('episodes:changed');
    }
  }

  function setActiveScene(id) {
    _state.activeSceneId = id;
    emit('scene:activated', id);
  }

  function setFormat(fmt) {
    _state.format = fmt;
    if (_state.project?.meta) _state.project.meta.format = fmt;
    markDirty();
    emit('format:changed', fmt);
  }

  function markDirty() {
    _state.isDirty = true;
    emit('state:dirty');
  }

  function markClean() {
    _state.isDirty = false;
    emit('state:clean');
  }

  function setUI(key, value) {
    _state.ui[key] = value;
    emit('ui:changed', { key, value });
  }

  function addScene(scene) {
    const ep = _activeEpisode();
    if (!ep) return;
    ep.scenes.push(scene);
    markDirty();
    emit('scenes:changed');
  }

  function removeScene(id) {
    const ep = _activeEpisode();
    if (!ep) return;
    ep.scenes = ep.scenes.filter(s => s.id !== id);
    if (_state.activeSceneId === id) {
      _state.activeSceneId = ep.scenes[0]?.id || null;
    }
    markDirty();
    emit('scenes:changed');
  }

  // Reorders within the scene's own status group (active vs draft), not raw
  // array position — active and draft scenes are interleaved in the same
  // array, so a raw-adjacent swap could silently no-op or cross groups.
  function moveScene(id, direction) {
    const ep = _activeEpisode();
    if (!ep) return;
    const scenes = ep.scenes;
    const scene = scenes.find(s => s.id === id);
    if (!scene) return;
    const status = scene.status || 'active';
    const group = scenes.filter(s => (s.status || 'active') === status);
    const groupIndex = group.findIndex(s => s.id === id);
    const swapIndex = groupIndex + direction;
    if (swapIndex < 0 || swapIndex >= group.length) return;
    const neighbor = group[swapIndex];
    const rawA = scenes.indexOf(scene);
    const rawB = scenes.indexOf(neighbor);
    [scenes[rawA], scenes[rawB]] = [scenes[rawB], scenes[rawA]];
    markDirty();
    emit('scenes:changed');
  }

  function setSceneStatus(id, status) {
    const scene = _activeEpisode()?.scenes.find(s => s.id === id);
    if (scene) {
      scene.status = status;
      markDirty();
      emit('scenes:changed');
    }
  }

  function updateScene(id, blocks) {
    const scene = _activeEpisode()?.scenes.find(s => s.id === id);
    if (scene) {
      scene.blocks = blocks;
      markDirty();
    }
  }

  function updateSceneTitle(id, title) {
    const scene = _activeEpisode()?.scenes.find(s => s.id === id);
    if (scene) {
      scene.title = title;
      markDirty();
      emit('scenes:changed');
    }
  }

  function addCharacter(name) {
    if (!_state.project.characters.includes(name)) {
      _state.project.characters.push(name);
      _state.project.characters.sort();
      markDirty();
      emit('characters:changed');
    }
  }

  function removeCharacter(name) {
    _state.project.characters = _state.project.characters.filter(c => c !== name);
    if (_state.project.characterNotes) delete _state.project.characterNotes[name];
    markDirty();
    emit('characters:changed');
  }

  function setCharacterNotes(name, notes) {
    if (!_state.project.characterNotes) _state.project.characterNotes = {};
    if (notes) {
      _state.project.characterNotes[name] = notes;
    } else {
      delete _state.project.characterNotes[name];
    }
    markDirty();
  }

  return {
    on, emit, get,
    setProject, setActiveScene, setFormat, markDirty, markClean,
    getActiveEpisode, getActiveScenes, setActiveEpisode, addEpisode, removeEpisode, updateEpisodeTitle,
    setUI, addScene, removeScene, moveScene, setSceneStatus, updateScene, updateSceneTitle,
    addCharacter, removeCharacter, setCharacterNotes,
  };
})();
