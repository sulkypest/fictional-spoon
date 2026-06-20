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

  return {
    saveToFile,
    loadFromFile,
    saveLocal,
    loadLocal,
    clearLocal,
    exportTxt,
    exportForElevenLabs,
  };
})();
