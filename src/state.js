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
    project: null,       // Loaded project object (meta, characters, scenes)
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

  function setProject(project) {
    _state.project = project;
    _state.format = project.meta?.format || 'screenplay';
    _state.isDirty = false;
    emit('project:loaded', project);
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
    _state.project.scenes.push(scene);
    markDirty();
    emit('scenes:changed');
  }

  function removeScene(id) {
    _state.project.scenes = _state.project.scenes.filter(s => s.id !== id);
    if (_state.activeSceneId === id) {
      _state.activeSceneId = _state.project.scenes[0]?.id || null;
    }
    markDirty();
    emit('scenes:changed');
  }

  function updateScene(id, blocks) {
    const scene = _state.project.scenes.find(s => s.id === id);
    if (scene) {
      scene.blocks = blocks;
      markDirty();
    }
  }

  function updateSceneTitle(id, title) {
    const scene = _state.project.scenes.find(s => s.id === id);
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
    markDirty();
    emit('characters:changed');
  }

  return {
    on, emit, get,
    setProject, setActiveScene, setFormat, markDirty, markClean,
    setUI, addScene, removeScene, updateScene, updateSceneTitle,
    addCharacter, removeCharacter,
  };
})();
