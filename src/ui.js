/**
 * ui.js
 * Handles all DOM rendering that isn't the editor surface itself.
 * Sidebar, toolbar, panels, modals, PDF preview, status bar.
 */

const UI = (() => {

  // ── Format ────────────────────────────────────────────────────────────────

  function setFormat(fmt) {
    const isLight = document.body.classList.contains('light');
    document.body.className = (isLight ? 'light ' : '') + 'format-' + fmt;
    const sel = document.getElementById('format-select');
    if (sel) sel.value = fmt;
  }

  // ── Title ─────────────────────────────────────────────────────────────────

  function setTitle(title) {
    document.querySelector('.app-name').textContent = title || 'Scriptwriter';
  }

  function setAuthState(user) {
    const btn = document.getElementById('auth-btn');
    const label = document.getElementById('auth-user');
    if (!btn || !label) return;
    if (user) {
      btn.textContent = 'Sign out';
      label.textContent = `Signed in as ${user.displayName || user.email}`;
    } else {
      btn.textContent = 'Sign in';
      label.textContent = 'Not signed in';
    }
  }

  function setElPanelAuthNote(text) {
    const note = document.getElementById('el-auth-note');
    if (note) note.textContent = text;
  }
  function setSignInPrompt(text) {
    const prompt = document.getElementById('signin-prompt');
    if (prompt) prompt.textContent = text || '';
  }

  function clearSignInPrompt() {
    setSignInPrompt('');
  }

  function showSplashScreen() {
    const splash = document.getElementById('splash-screen');
    if (splash) splash.classList.remove('hidden');
  }

  function hideSplashScreen() {
    const splash = document.getElementById('splash-screen');
    if (splash) splash.classList.add('hidden');
  }

  // ── Sidebar ───────────────────────────────────────────────────────────────

  function renderSidebar() {
    const project = State.get().project;
    if (!project) return;
    const list = document.getElementById('scene-list');
    list.innerHTML = '';

    project.scenes.forEach((s, i) => {
      const item = document.createElement('div');
      const isActive = s.id === State.get().activeSceneId;
      const isPlaying = TTS.activeSceneId() === s.id;
      item.className = 'scene-item' + (isActive ? ' active' : '');
      item.onclick = (e) => {
        if (!e.target.classList.contains('scene-del') && !e.target.classList.contains('scene-play'))
          App.loadScenePub(s.id);
      };

      const label = document.createElement('div');
      label.className = 'scene-label';
      label.textContent = `${i + 1}. ${s.title || 'Untitled'}`;

      const play = document.createElement('button');
      play.className = 'scene-play' + (isPlaying ? ' playing' : '');
      play.textContent = isPlaying ? '■' : '▶';
      play.title = isPlaying ? 'Stop' : 'Read aloud';
      play.onclick = (e) => { e.stopPropagation(); App.ttsPlay(s.id); };

      const del = document.createElement('button');
      del.className = 'scene-del';
      del.textContent = '×';
      del.title = 'Delete scene';
      del.onclick = (e) => { e.stopPropagation(); App.deleteScene(s.id); };

      item.appendChild(label);
      item.appendChild(play);
      item.appendChild(del);
      list.appendChild(item);
    });
  }

  function renderCharList() {
    const project = State.get().project;
    if (!project) return;
    const list = document.getElementById('char-list');
    list.innerHTML = '';

    project.characters.forEach(c => {
      const item = document.createElement('div');
      item.className = 'char-item';

      const name = document.createElement('div');
      name.className = 'char-name';
      name.textContent = c;
      name.onclick = () => App.insertCharacterBlock(c);

      const del = document.createElement('button');
      del.className = 'char-del';
      del.textContent = '×';
      del.onclick = () => App.removeCharacter(c);

      item.appendChild(name);
      item.appendChild(del);
      list.appendChild(item);
    });
  }

  function switchSideTab(tab) {
    document.querySelectorAll('.stab').forEach((t, i) =>
      t.classList.toggle('active', (i === 0 ? 'scenes' : 'chars') === tab)
    );
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById('panel-' + tab)?.classList.add('active');
  }

  function toggleAddChar() {
    const form = document.getElementById('add-char-form');
    form.classList.toggle('visible');
    if (form.classList.contains('visible')) {
      const input = document.getElementById('new-char-input');
      input.value = '';
      input.focus();
    }
  }

  // ── Editor area ───────────────────────────────────────────────────────────

  function showEditor() {
    document.getElementById('script-editor').style.display = 'block';
    document.getElementById('scene-title-bar').style.display = 'flex';
    document.getElementById('empty-state').style.display = 'none';
  }

  function showEmptyState() {
    document.getElementById('script-editor').style.display = 'none';
    document.getElementById('scene-title-bar').style.display = 'none';
    document.getElementById('empty-state').style.display = 'flex';
  }

  function setSceneTitle(title) {
    document.getElementById('scene-title-input').value = title || '';
  }

  function setWordCount(n) {
    document.getElementById('scene-word-count').textContent = `${n} words`;
  }

  // ── Voice panel (browser TTS) ─────────────────────────────────────────────

  function toggleVoicePanel() {
    const panel = document.getElementById('voice-panel');
    panel.classList.toggle('visible');
    if (panel.classList.contains('visible')) buildVoicePanel();
    document.querySelector('[onclick="UI.toggleVoicePanel()"]')?.classList.toggle('active', panel.classList.contains('visible'));
  }

  function buildVoicePanel() {
    const container = document.getElementById('voice-panel-inner');
    container.innerHTML = '<h4>Browser preview voices</h4>';
    const voices = TTS.getVoices();
    const voiceMap = TTS.getCharacterVoices();
    const project = State.get().project;
    if (!project) return;

    [...project.characters, '__STAGE_MANAGER__'].forEach(char => {
      const row = document.createElement('div');
      row.className = 'voice-row';
      const label = document.createElement('label');
      label.textContent = char === '__STAGE_MANAGER__' ? 'Stage Mgr' : char;
      label.title = char;
      const sel = document.createElement('select');
      voices.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.voiceURI;
        opt.textContent = v.name.replace(/\s*\(.*\)/, '');
        if (voiceMap[char] === v.voiceURI) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.onchange = () => TTS.setCharacterVoice(char, sel.value);
      row.appendChild(label);
      row.appendChild(sel);
      container.appendChild(row);
    });
  }

  // ── ElevenLabs panel ──────────────────────────────────────────────────────

  function toggleElPanel() {
    document.getElementById('el-panel').classList.toggle('visible');
  }

  function showElApiKeyPrompt() {
    document.getElementById('el-panel').classList.add('visible');
  }

  function showElVoicePanel() {
    document.getElementById('el-panel').classList.add('visible');
  }

  function renderElVoicePanel(voices, currentMap) {
    const container = document.getElementById('el-voice-rows');
    if (!container) return;
    container.innerHTML = '';
    // Add a small filter box to help browse large voice lists
    const ctrl = document.createElement('div');
    ctrl.className = 'el-voice-controls';
    const filter = document.createElement('input');
    filter.type = 'search';
    filter.id = 'el-voice-filter';
    filter.placeholder = 'Filter voices by name...';
    ctrl.appendChild(filter);
    container.appendChild(ctrl);
    const project = State.get().project;
    if (!project) return;
    const voicesData = Array.isArray(voices) ? voices.slice() : [];

    function buildRows(filterText = '') {
      // Remove existing rows except controls
        Array.from(container.querySelectorAll('.voice-row, .voice-browse-list')).forEach(n => n.remove());
      const q = (filterText || '').trim().toLowerCase();
      [...project.characters, '__STAGE_MANAGER__'].forEach(char => {
        const row = document.createElement('div');
        row.className = 'voice-row';
        const label = document.createElement('label');
        label.textContent = char === '__STAGE_MANAGER__' ? 'Stage Mgr' : char;
        const sel = document.createElement('select');
        const none = document.createElement('option');
        none.value = ''; none.textContent = '— unassigned —';
        sel.appendChild(none);

        const filtered = q ? voicesData.filter(v => (v.name || '').toLowerCase().includes(q)) : voicesData;
        filtered.forEach(v => {
          const opt = document.createElement('option');
          opt.value = v.id;
          opt.textContent = v.name + (v.preview_url ? ' ▶' : '');
          if (currentMap && currentMap[char] === v.id) opt.selected = true;
          sel.appendChild(opt);
        });

        sel.onchange = () => App.elSetVoice(char, sel.value);
        row.appendChild(label);
        row.appendChild(sel);
        container.appendChild(row);
      });
        // Browse list
        const browse = document.createElement('div');
        browse.className = 'voice-browse-list';
        const title = document.createElement('h4');
        title.textContent = 'Browse voices';
        browse.appendChild(title);

        const list = document.createElement('div');
        list.className = 'voice-list';
        const filteredAll = q ? voicesData.filter(v => (v.name || '').toLowerCase().includes(q)) : voicesData;
        filteredAll.forEach(v => {
          const item = document.createElement('div');
          item.className = 'voice-item';
          const n = document.createElement('div');
          n.className = 'voice-name';
          n.textContent = v.name;
          const meta = document.createElement('div');
          meta.className = 'voice-meta';
          meta.textContent = `${v.category || ''} ${Array.isArray(v.labels) ? v.labels.join(', ') : ''}`;

          const controls = document.createElement('div');
          controls.className = 'voice-controls';
          if (v.previewUrl) {
            const btn = document.createElement('button');
            btn.textContent = 'Preview';
            btn.onclick = async () => {
              try {
                btn.textContent = 'Loading...';
                const r = await fetch(v.previewUrl);
                const b = await r.arrayBuffer();
                const blob = new Blob([b], { type: r.headers.get('content-type') || 'audio/mpeg' });
                const url = URL.createObjectURL(blob);
                const aud = new Audio(url);
                aud.onended = () => { URL.revokeObjectURL(url); btn.textContent = 'Preview'; };
                aud.play();
              } catch (e) {
                console.error('Voice preview failed', e);
                _showToast('Voice preview failed');
                btn.textContent = 'Preview';
              }
            };
            controls.appendChild(btn);
          }

          // Assign dropdown
          const assign = document.createElement('select');
          const optNone = document.createElement('option'); optNone.value = ''; optNone.textContent = 'Assign to...';
          assign.appendChild(optNone);
          [...project.characters, '__STAGE_MANAGER__'].forEach(ch => {
            const o = document.createElement('option'); o.value = ch; o.textContent = ch === '__STAGE_MANAGER__' ? 'Stage Mgr' : ch; assign.appendChild(o);
          });
          assign.onchange = () => {
            const ch = assign.value;
            if (!ch) return;
            App.elSetVoice(ch, v.id);
            _showToast(`${v.name} assigned to ${ch === '__STAGE_MANAGER__' ? 'Stage Mgr' : ch}`);
            // Rebuild to reflect change
            buildRows(filter.value);
          };
          controls.appendChild(assign);

          item.appendChild(n);
          item.appendChild(meta);
          item.appendChild(controls);
          list.appendChild(item);
        });

        browse.appendChild(list);
        container.appendChild(browse);
      }

      buildRows();
      filter.addEventListener('input', (e) => buildRows(e.target.value));

      // Add refresh button
      const refreshBtn = document.createElement('button');
      refreshBtn.textContent = 'Refresh voices';
      refreshBtn.onclick = () => App.elRefreshVoices();
      container.insertBefore(refreshBtn, container.querySelector('.el-voice-controls')?.nextSibling || null);
    }

    buildRows();
    filter.addEventListener('input', (e) => buildRows(e.target.value));
  }

  // ── TTS now-playing ───────────────────────────────────────────────────────

  function setNowPlaying(item) {
    const el = document.getElementById('tts-now-speaking');
    if (!el) return;
    if (item.type === 'dialogue') {
      el.innerHTML = `<strong>${_esc(item.speaker)}</strong> — ${_esc(item.text.substring(0, 60))}${item.text.length > 60 ? '…' : ''}`;
    } else {
      el.innerHTML = `<em style="color:var(--text3)">Stage mgr</em> — ${_esc(item.text.substring(0, 60))}`;
    }
    document.getElementById('tts-panel').classList.add('visible');
  }

  function hideTtsPanel() {
    document.getElementById('tts-panel').classList.remove('visible');
  }

  // ── Generation progress ───────────────────────────────────────────────────

  function showGenerationProgress(msg) {
    const el = document.getElementById('gen-progress');
    el.querySelector('span').textContent = msg;
    el.classList.add('visible');
  }

  function hideGenerationProgress() {
    document.getElementById('gen-progress').classList.remove('visible');
  }

  // ── Save indicator ────────────────────────────────────────────────────────

  function setSaveIndicator(msg) {
    const el = document.getElementById('save-indicator');
    if (!el) return;
    el.textContent = msg;
    el.style.opacity = '1';
    if (msg) setTimeout(() => { el.style.opacity = '0'; }, 3000);
  }

  // ── PDF preview ───────────────────────────────────────────────────────────

  function showPdfPreview(project) {
    const fmt = State.get().format;
    const doc = document.getElementById('pdf-doc');
    let out = '';

    project.scenes.forEach((scene, si) => {
      out += '<div style="margin-bottom:2em;">';
      let i = 0;
      const blocks = scene.blocks;
      while (i < blocks.length) {
        const b = blocks[i];
        const txt = _esc((b.text || '').trim());
        if (!txt) { i++; continue; }

        if (b.type === 'scene-heading') { out += `<p class="ex-scene">${txt}</p>`; i++; }
        else if (b.type === 'action')   { out += `<p class="ex-action">${txt}</p>`; i++; }
        else if (b.type === 'sound')    { out += `<p class="ex-sound"><em>${txt}</em></p>`; i++; }
        else if (b.type === 'transition') { out += `<p class="ex-transition">${txt}</p>`; i++; }
        else if (b.type === 'character') {
          const charName = _esc((b.text || '').trim().toUpperCase());
          i++;
          let parens = [], dialLines = [];
          while (i < blocks.length && (blocks[i].type === 'parenthetical' || blocks[i].type === 'dialogue')) {
            if (blocks[i].type === 'parenthetical') parens.push(_esc((blocks[i].text||'').trim()).replace(/^\(|\)$/g,''));
            else dialLines.push(_esc((blocks[i].text||'').trim()));
            i++;
          }
          if (fmt === 'screenplay') {
            out += '<div class="ex-char-wrap">';
            out += `<span class="ex-char">${charName}</span>`;
            if (parens.length) out += `<span class="ex-paren">(${parens.join(') (')})</span>`;
            if (dialLines.length) out += `<span class="ex-dial">${dialLines.join('<br>')}</span>`;
            out += '</div>';
          } else {
            out += '<div class="ex-char-wrap">';
            let line = `<strong>${charName}:</strong>`;
            if (parens.length) line += ` (${parens.join(') (')})`;
            if (dialLines.length) line += ' ' + dialLines.join(' ');
            out += `<p class="ex-action">${line}</p>`;
            out += '</div>';
          }
        } else { out += `<p class="ex-action">${txt}</p>`; i++; }
      }
      out += '</div>';
    });

    doc.innerHTML = out;
    document.getElementById('pdf-preview').classList.add('visible');
  }

  function hidePdfPreview() {
    document.getElementById('pdf-preview').classList.remove('visible');
  }

  // ── Import modal ──────────────────────────────────────────────────────────

  function showImportModal() {
    document.getElementById('import-text').value = '';
    document.getElementById('modal-overlay').classList.add('visible');
    setTimeout(() => document.getElementById('import-text').focus(), 50);
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.remove('visible');
  }

  // ── Status bar ────────────────────────────────────────────────────────────

  function updateStatus(sceneIndex, sceneCount, words, lines) {
    document.getElementById('sb-scene').textContent = `${sceneIndex} of ${sceneCount}`;
    document.getElementById('sb-words').textContent = words;
    document.getElementById('sb-lines').textContent = lines;
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  function _esc(t) {
    return (t || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return {
    setFormat, setTitle, setAuthState, setElPanelAuthNote,
    renderSidebar, renderCharList, switchSideTab, toggleAddChar,
    showEditor, showEmptyState, setSceneTitle, setWordCount,
    toggleVoicePanel, buildVoicePanel,
    toggleElPanel, showElApiKeyPrompt, showElVoicePanel, renderElVoicePanel,
    setNowPlaying, hideTtsPanel,
    showGenerationProgress, hideGenerationProgress,
    setSaveIndicator,
    showPdfPreview, hidePdfPreview,
    showImportModal, closeModal,
    updateStatus,
  };
})();
