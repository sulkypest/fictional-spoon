/**
 * storage.js
 * Handles all project persistence.
 *
 * Currently supports:
 *   - Save/load project as JSON file (primary)
 *   - localStorage autosave (backup)
 *
 * Future commercial version would add:
 *   - Cloud storage via authenticated API calls
 *   - Version history
 *   - Collaborative locking
 *
 * The interface is designed so cloud storage can be added
 * without changing any calling code.
 */

const Storage = (() => {

  const KEY = CONFIG.storage.localStorageKey;
const KEY_UI = KEY + '_ui';

  // ── Local file (primary) ──────────────────────────────────────────────────

  function saveToFile(project) {
    const json = JSON.stringify(project, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    const filename = (project.meta?.title || 'project')
      .toLowerCase().replace(/\s+/g, '-') + '.json';
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    return filename;
  }

  function loadFromFile() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return reject(new Error('No file selected'));
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const data = JSON.parse(ev.target.result);
            resolve(data);
          } catch {
            reject(new Error('Invalid project file'));
          }
        };
        reader.onerror = () => reject(new Error('Could not read file'));
        reader.readAsText(file);
      };
      input.click();
    });
  }

  // ── localStorage (autosave backup) ────────────────────────────────────────

  function saveLocal(project) {
    try {
      localStorage.setItem(KEY, JSON.stringify(project));
      return true;
    } catch (e) {
      console.warn('localStorage autosave failed:', e);
      return false;
    }
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function clearLocal() {
    localStorage.removeItem(KEY);
  }

  function saveUI(settings) {
    try {
      localStorage.setItem(KEY_UI, JSON.stringify(settings));
      return true;
    } catch (e) {
      console.warn('localStorage saveUI failed:', e);
      return false;
    }
  }

  function loadUI() {
    try {
      const raw = localStorage.getItem(KEY_UI);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function clearUI() {
    localStorage.removeItem(KEY_UI);
  }

  // ── Export helpers ────────────────────────────────────────────────────────

  function exportTxt(project) {
    let txt = `${project.meta?.title || 'Script'}\n`;
    txt += `${project.meta?.subtitle || ''}\n`;
    txt += '='.repeat(60) + '\n\n';

    project.scenes.forEach((scene, si) => {
      txt += `SCENE ${si + 1}. ${scene.title}\n${'─'.repeat(40)}\n\n`;
      scene.blocks.forEach(b => {
        const t = (b.text || '').trim();
        if (!t) return;
        switch (b.type) {
          case 'scene-heading': txt += `\n${t}\n\n`; break;
          case 'character':     txt += `\n${t}:\n`; break;
          case 'dialogue':      txt += `\t${t}\n`; break;
          case 'parenthetical': txt += `\t(${t.replace(/^\(|\)$/g,'')})\n`; break;
          case 'sound':         txt += `${t}\n`; break;
          case 'transition':    txt += `\n\t\t\t\t${t}\n\n`; break;
          default:              txt += `${t}\n`; break;
        }
      });
      txt += '\n';
    });

    const blob = new Blob([txt], { type: 'text/plain' });
    const a = document.createElement('a');
    const filename = (project.meta?.title || 'script').toLowerCase().replace(/\s+/g,'-') + '.txt';
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /**
   * Export in ElevenLabs-ready format:
   * Dialogue only, CHARACTER: text format.
   * Sound cues separated into a companion list.
   */
  function exportForElevenLabs(project, sceneId = null) {
    const scenes = sceneId
      ? project.scenes.filter(s => s.id === sceneId)
      : project.scenes;

    let dialogue = '';
    const soundCues = [];
    let cueNum = 1;

    scenes.forEach((scene, si) => {
      if (scenes.length > 1) dialogue += `\n# Scene ${si + 1}: ${scene.title}\n\n`;
      let currentChar = null;

      scene.blocks.forEach(b => {
        const t = (b.text || '').trim();
        if (!t) return;
        if (b.type === 'character') { currentChar = t; return; }
        if (b.type === 'dialogue') {
          dialogue += `${currentChar}: ${t}\n`;
          return;
        }
        if (b.type === 'sound') {
          soundCues.push(`[SFX ${cueNum++}] ${t}`);
          return;
        }
        if (b.type === 'action' && t) {
          // Stage manager reads action lines
          dialogue += `NARRATOR: ${t}\n`;
        }
      });
    });

    // Download dialogue file
    const dBlob = new Blob([dialogue.trim()], { type: 'text/plain' });
    const dA = document.createElement('a');
    dA.href = URL.createObjectURL(dBlob);
    dA.download = 'elevenlabs-dialogue.txt';
    dA.click();
    URL.revokeObjectURL(dA.href);

    // Download sound cues file
    if (soundCues.length) {
      setTimeout(() => {
        const sBlob = new Blob([soundCues.join('\n')], { type: 'text/plain' });
        const sA = document.createElement('a');
        sA.href = URL.createObjectURL(sBlob);
        sA.download = 'elevenlabs-soundcues.txt';
        sA.click();
        URL.revokeObjectURL(sA.href);
      }, 500);
    }
  }

  // ── Reaper RPP export ─────────────────────────────────────────────────────

  function _rppEsc(str) {
    return (str || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function exportReaper(project, sceneId) {
    const WPM      = CONFIG.timing.wordsPerMinute;
    const SFX_DUR  = CONFIG.timing.soundEffectSeconds;
    const LINE_GAP = 0.4;
    const SCENE_GAP = 2.0;

    const scenes = sceneId
      ? project.scenes.filter(s => s.id === sceneId)
      : project.scenes;
    if (!scenes.length) return;

    const trackOrder = [];
    const trackMap   = {};
    const markers    = [];

    function ensureTrack(name) {
      if (!trackMap[name]) { trackMap[name] = []; trackOrder.push(name); }
    }

    let pos = 0;

    scenes.forEach((scene, si) => {
      if (si > 0) pos += SCENE_GAP;
      markers.push({ position: pos, label: scene.title || `Scene ${si + 1}` });

      let currentChar = null;

      scene.blocks.forEach(b => {
        const text = (b.text || '').trim();
        if (!text) return;

        if (b.type === 'character') {
          currentChar = text.toUpperCase();
          return;
        }
        if (b.type === 'dialogue') {
          const char = currentChar || 'UNKNOWN';
          ensureTrack(char);
          const dur = Math.max(0.5, (text.split(/\s+/).length / WPM) * 60);
          trackMap[char].push({ position: pos, duration: dur, name: text });
          pos += dur + LINE_GAP;
          return;
        }
        if (b.type === 'action') {
          ensureTrack('NARRATOR');
          const dur = Math.max(0.5, (text.split(/\s+/).length / WPM) * 60);
          trackMap['NARRATOR'].push({ position: pos, duration: dur, name: text });
          pos += dur + LINE_GAP;
          return;
        }
        if (b.type === 'sound') {
          ensureTrack('SFX');
          trackMap['SFX'].push({ position: pos, duration: SFX_DUR, name: text });
          pos += SFX_DUR + LINE_GAP;
        }
      });
    });

    // Characters first, utility tracks last
    const charTracks    = trackOrder.filter(n => n !== 'NARRATOR' && n !== 'SFX');
    const specialTracks = trackOrder.filter(n => n === 'NARRATOR' || n === 'SFX');
    const ordered       = [...charTracks, ...specialTracks];

    const out = [];
    out.push('<REAPER_PROJECT 0.1 "6.0" 0');
    out.push('  TEMPO 120 4 4');
    out.push('  PLAYRATE 1 0 0.25 4');

    markers.forEach((m, i) => {
      out.push(`  MARKER ${i + 1} ${m.position.toFixed(6)} "${_rppEsc(m.label)}" 0 -1 1`);
    });

    ordered.forEach(name => {
      out.push('  <TRACK');
      out.push(`    NAME "${_rppEsc(name)}"`);
      out.push('    VOLPAN 1 0 -1 -1 1');
      out.push('    MUTE 0');
      trackMap[name].forEach(item => {
        out.push('    <ITEM');
        out.push(`      POSITION ${item.position.toFixed(6)}`);
        out.push(`      LENGTH ${item.duration.toFixed(6)}`);
        out.push(`      NAME "${_rppEsc(item.name)}"`);
        out.push('      MUTE 0 0');
        out.push('      VOLPAN 1 0 -1 -1');
        out.push('      SOFFS 0 0');
        out.push('      PLAYRATE 1 1 0 -1 0 0.0025');
        out.push('      <SOURCE EMPTY');
        out.push('      >');
        out.push('    >');
      });
      out.push('  >');
    });

    out.push('>');

    const blob = new Blob([out.join('\n') + '\n'], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    const base = (sceneId ? (scenes[0]?.title || 'scene') : (project.meta?.title || 'project'))
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    a.href = URL.createObjectURL(blob);
    a.download = (base || 'export') + '.rpp';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return {
    saveToFile,
    loadFromFile,
    saveLocal,
    loadLocal,
    clearLocal,
    saveUI,
    loadUI,
    clearUI,
    exportTxt,
    exportForElevenLabs,
    exportReaper,
  };
})();
