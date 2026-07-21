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
    document.querySelector('.app-name').textContent = title || 'Cue Fighters';
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
    const toolbar = document.getElementById('toolbar');
    const main = document.getElementById('main');
    const statusbar = document.getElementById('statusbar');
    if (splash) splash.classList.remove('hidden');
    if (toolbar) toolbar.classList.add('hidden');
    if (main) main.classList.add('hidden');
    if (statusbar) statusbar.classList.add('hidden');
  }

  function hideSplashScreen() {
    const splash = document.getElementById('splash-screen');
    const toolbar = document.getElementById('toolbar');
    const main = document.getElementById('main');
    const statusbar = document.getElementById('statusbar');
    if (splash) splash.classList.add('hidden');
    if (toolbar) toolbar.classList.remove('hidden');
    if (main) main.classList.remove('hidden');
    if (statusbar) statusbar.classList.remove('hidden');
  }

  // ── Sidebar ───────────────────────────────────────────────────────────────

  function _renderSceneItem(s, i, group, isDraft) {
    const item = document.createElement('div');
    const isActive = s.id === State.get().activeSceneId;
    const isPlaying = TTS.activeSceneId() === s.id;
    item.className = 'scene-item' + (isActive ? ' active' : '');
    item.onclick = (e) => {
      if (e.target.closest('.scene-actions')) return;
      App.loadScenePub(s.id);
      // On mobile the sidebar is an overlay drawer — close it after picking a scene.
      document.getElementById('sidebar')?.classList.remove('open');
      document.getElementById('sidebar-backdrop')?.classList.remove('visible');
    };

    const label = document.createElement('div');
    label.className = 'scene-label';
    label.textContent = isDraft ? (s.title || 'Untitled') : `${i + 1}. ${s.title || 'Untitled'}`;

    const sceneSeconds = Timing.estimateSeconds(s.blocks);
    const time = document.createElement('div');
    time.className = 'scene-time';
    time.textContent = Timing.formatDuration(sceneSeconds);

    const actions = document.createElement('div');
    actions.className = 'scene-actions';

    const up = document.createElement('button');
    up.className = 'scene-move';
    up.textContent = '↑';
    up.title = 'Move up';
    up.disabled = i === 0;
    up.onclick = (e) => { e.stopPropagation(); App.moveScene(s.id, -1); };

    const down = document.createElement('button');
    down.className = 'scene-move';
    down.textContent = '↓';
    down.title = 'Move down';
    down.disabled = i === group.length - 1;
    down.onclick = (e) => { e.stopPropagation(); App.moveScene(s.id, 1); };

    const archive = document.createElement('button');
    archive.className = 'scene-archive';
    archive.textContent = isDraft ? '⤴' : '⤵';
    archive.title = isDraft ? 'Move to Scenes' : 'Move to Drafts';
    archive.onclick = (e) => { e.stopPropagation(); App.setSceneStatus(s.id, isDraft ? 'active' : 'draft'); };

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

    actions.appendChild(up);
    actions.appendChild(down);
    actions.appendChild(archive);
    actions.appendChild(play);
    actions.appendChild(del);

    item.appendChild(label);
    item.appendChild(time);
    item.appendChild(actions);
    return { item, sceneSeconds };
  }

  function renderSidebar() {
    const project = State.get().project;
    if (!project) return;
    const list = document.getElementById('scene-list');
    const draftList = document.getElementById('draft-list');
    const draftsHeader = document.getElementById('drafts-header');
    list.innerHTML = '';
    draftList.innerHTML = '';

    const scenes = State.getActiveScenes();
    const active = scenes.filter(s => (s.status || 'active') === 'active');
    const drafts = scenes.filter(s => s.status === 'draft');

    let totalSeconds = 0;
    active.forEach((s, i) => {
      const { item, sceneSeconds } = _renderSceneItem(s, i, active, false);
      totalSeconds += sceneSeconds;
      list.appendChild(item);
    });

    drafts.forEach((s, i) => {
      const { item } = _renderSceneItem(s, i, drafts, true);
      draftList.appendChild(item);
    });
    if (draftsHeader) draftsHeader.style.display = drafts.length ? 'flex' : 'none';

    const totalEl = document.getElementById('scenes-total-time');
    if (totalEl) totalEl.textContent = active.length ? `~${Timing.formatDuration(totalSeconds)} total` : '';
  }

  const _expandedNotes = new Set();

  function renderCharList() {
    const project = State.get().project;
    if (!project) return;
    const list = document.getElementById('char-list');
    list.innerHTML = '';
    const notes = project.characterNotes || {};

    project.characters.forEach(c => {
      const item = document.createElement('div');
      item.className = 'char-item';

      const row = document.createElement('div');
      row.className = 'char-row';

      const name = document.createElement('div');
      name.className = 'char-name';
      name.textContent = c;
      name.onclick = () => App.insertCharacterBlock(c);

      const hasNote = Boolean(notes[c]);
      const notesBtn = document.createElement('button');
      notesBtn.className = 'char-notes-btn' + (hasNote ? ' has-note' : '');
      notesBtn.textContent = '📝';
      notesBtn.title = 'Notes';
      notesBtn.onclick = () => {
        if (_expandedNotes.has(c)) _expandedNotes.delete(c);
        else _expandedNotes.add(c);
        renderCharList();
      };

      const del = document.createElement('button');
      del.className = 'char-del';
      del.textContent = '×';
      del.onclick = () => App.removeCharacter(c);

      row.appendChild(name);
      row.appendChild(notesBtn);
      row.appendChild(del);
      item.appendChild(row);

      if (_expandedNotes.has(c)) {
        const textarea = document.createElement('textarea');
        textarea.className = 'char-notes';
        textarea.placeholder = 'Notes on this character...';
        textarea.value = notes[c] || '';
        textarea.oninput = () => App.setCharacterNotes(c, textarea.value);
        item.appendChild(textarea);
      }

      list.appendChild(item);
    });
  }

  function renderEpisodeSelector() {
    const project = State.get().project;
    if (!project?.episodes) return;
    const episodes = project.episodes;
    const activeId = State.get().activeEpisodeId;
    const index = episodes.findIndex(e => e.id === activeId);
    const active = episodes[index] || episodes[0];

    const input = document.getElementById('episode-title-input');
    if (input && active) input.value = active.title || '';

    const prevBtn = document.querySelector('#episode-bar .ep-nav:first-child');
    const nextBtn = document.querySelector('#episode-bar .ep-nav:last-of-type');
    const delBtn = document.querySelector('#episode-bar .ep-del');
    if (prevBtn) prevBtn.disabled = index <= 0;
    if (nextBtn) nextBtn.disabled = index >= episodes.length - 1;
    if (delBtn) delBtn.disabled = episodes.length <= 1;

    const bar = document.getElementById('episode-bar');
    if (bar) bar.style.display = episodes.length >= 1 ? 'flex' : 'none';
  }

  function toggleSidebar() {
    document.getElementById('sidebar')?.classList.toggle('open');
    document.getElementById('sidebar-backdrop')?.classList.toggle('visible');
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

  function setWordCount(n, seconds) {
    const time = seconds != null ? ` · ~${Timing.formatDuration(seconds)}` : '';
    document.getElementById('scene-word-count').textContent = `${n} words${time}`;
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

  // Compact per-character assignment list, drawn from voices already in this account.
  function renderElVoicePanel(voices, currentMap) {
    const container = document.getElementById('el-voice-rows');
    if (!container) return;
    container.innerHTML = '';
    const project = State.get().project;
    if (!project) return;
    const voicesData = Array.isArray(voices) ? voices : [];

    const title = document.createElement('h4');
    title.textContent = 'Your cast';
    container.appendChild(title);

    // Collect all CHARACTER blocks from the script so the cast panel reflects the
    // actual script content, not just the sidebar list (which may lag behind).
    const scriptChars = new Set(project.characters || []);
    (State.getActiveScenes() || []).forEach(scene => {
      (scene.blocks || []).forEach(b => {
        if (b.type === 'character' && b.text?.trim()) {
          scriptChars.add(b.text.trim().toUpperCase());
        }
      });
    });
    const allChars = [...scriptChars].sort();

    [...allChars, '__STAGE_MANAGER__'].forEach(char => {
      const row = document.createElement('div');
      row.className = 'voice-row';
      const label = document.createElement('label');
      label.textContent = char === '__STAGE_MANAGER__' ? 'Stage Mgr' : char;
      const sel = document.createElement('select');
      const none = document.createElement('option');
      none.value = '';
      none.textContent = voicesData.length ? '— unassigned —' : '— assign from Voice Library below —';
      sel.appendChild(none);
      voicesData.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = v.name;
        if (currentMap && currentMap[char] === v.id) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.onchange = () => App.elSetVoice(char, sel.value);
      row.appendChild(label);
      row.appendChild(sel);
      container.appendChild(row);
    });

    const refreshBtn = document.createElement('button');
    refreshBtn.textContent = 'Refresh my voices';
    refreshBtn.onclick = () => App.elRefreshVoices();
    container.appendChild(refreshBtn);
  }

  // Builds the filter dropdowns/search box once; they don't depend on search results.
  function _buildElVoiceFiltersOnce() {
    const container = document.getElementById('el-voice-filters');
    if (!container || container.dataset.built) return;
    container.dataset.built = '1';

    const search = document.createElement('input');
    search.type = 'search';
    search.id = 'el-lib-search';
    search.placeholder = 'Search by description, e.g. "gravelly old man"...';
    container.appendChild(search);

    const filterDefs = [
      { key: 'gender', label: 'Gender', options: CONFIG.elevenlabs.voiceFilters.gender },
      { key: 'age', label: 'Age', options: CONFIG.elevenlabs.voiceFilters.age },
      { key: 'accent', label: 'Accent', options: CONFIG.elevenlabs.voiceFilters.accent },
      { key: 'useCase', label: 'Use case', options: CONFIG.elevenlabs.voiceFilters.useCase },
    ];

    filterDefs.forEach(def => {
      const sel = document.createElement('select');
      sel.id = `el-lib-filter-${def.key}`;
      const any = document.createElement('option');
      any.value = '';
      any.textContent = `${def.label}: Any`;
      sel.appendChild(any);
      def.options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        sel.appendChild(o);
      });
      sel.onchange = () => App.elSearchVoiceLibrary({ [def.key]: sel.value });
      container.appendChild(sel);
    });

    let searchTimer = null;
    search.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => App.elSearchVoiceLibrary({ search: search.value }), 350);
    });
  }

  // Renders Voice Library search results as a card grid with preview + assign controls.
  function renderElVoiceLibrary(state) {
    _buildElVoiceFiltersOnce();
    const container = document.getElementById('el-voice-library');
    if (!container) return;
    const project = State.get().project;
    if (!project) return;

    container.innerHTML = '';

    if (state.loading && !state.voices.length) {
      const status = document.createElement('p');
      status.className = 'el-lib-status';
      status.textContent = 'Searching Voice Library...';
      container.appendChild(status);
      return;
    }

    if (!state.voices.length) {
      const status = document.createElement('p');
      status.className = 'el-lib-status';
      status.textContent = 'No voices match these filters.';
      container.appendChild(status);
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'voice-grid';

    state.voices.forEach(v => {
      const card = document.createElement('div');
      card.className = 'voice-card';

      const n = document.createElement('div');
      n.className = 'voice-card-name';
      n.textContent = v.name;
      card.appendChild(n);

      const tags = document.createElement('div');
      tags.className = 'voice-card-tags';
      [v.gender, v.age, v.accent, v.useCase].filter(Boolean).forEach(t => {
        const tag = document.createElement('span');
        tag.className = 'voice-tag';
        tag.textContent = String(t).replace(/_/g, ' ');
        tags.appendChild(tag);
      });
      card.appendChild(tags);

      const controls = document.createElement('div');
      controls.className = 'voice-card-controls';

      if (v.previewUrl) {
        const btn = document.createElement('button');
        btn.textContent = '▶ Preview';
        btn.onclick = async () => {
          try {
            btn.textContent = 'Loading...';
            const r = await fetch(v.previewUrl);
            const b = await r.arrayBuffer();
            const blob = new Blob([b], { type: r.headers.get('content-type') || 'audio/mpeg' });
            const url = URL.createObjectURL(blob);
            const aud = new Audio(url);
            aud.onended = () => { URL.revokeObjectURL(url); btn.textContent = '▶ Preview'; };
            aud.play();
          } catch (e) {
            console.error('Voice preview failed', e);
            _showToast('Voice preview failed');
            btn.textContent = '▶ Preview';
          }
        };
        controls.appendChild(btn);
      }

      const assign = document.createElement('select');
      const optNone = document.createElement('option');
      optNone.value = '';
      optNone.textContent = 'Assign to...';
      assign.appendChild(optNone);
      [...project.characters, '__STAGE_MANAGER__'].forEach(ch => {
        const o = document.createElement('option');
        o.value = ch;
        o.textContent = ch === '__STAGE_MANAGER__' ? 'Stage Mgr' : ch;
        assign.appendChild(o);
      });
      assign.onchange = () => {
        const ch = assign.value;
        if (!ch) return;
        App.elAssignLibraryVoice(ch, v);
        assign.value = '';
      };
      controls.appendChild(assign);

      card.appendChild(controls);
      grid.appendChild(card);
    });

    container.appendChild(grid);

    if (state.hasMore) {
      const more = document.createElement('button');
      more.className = 'el-lib-load-more';
      more.textContent = state.loading ? 'Loading...' : 'Load more voices';
      more.disabled = state.loading;
      more.onclick = () => App.elLoadMoreVoiceLibrary();
      container.appendChild(more);
    }
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
    setFormat, setTitle, setAuthState, setElPanelAuthNote, setSignInPrompt, clearSignInPrompt, showSplashScreen, hideSplashScreen,
    renderEpisodeSelector, renderSidebar, renderCharList, switchSideTab, toggleAddChar, toggleSidebar,
    showEditor, showEmptyState, setSceneTitle, setWordCount,
    toggleVoicePanel, buildVoicePanel,
    toggleElPanel, showElApiKeyPrompt, showElVoicePanel, renderElVoicePanel, renderElVoiceLibrary,
    setNowPlaying, hideTtsPanel,
    showGenerationProgress, hideGenerationProgress,
    setSaveIndicator,
    showPdfPreview, hidePdfPreview,
    showImportModal, closeModal,
    updateStatus,
  };
})();
