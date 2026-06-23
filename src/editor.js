/**
 * editor.js
 * Manages the script editing surface.
 * Handles block creation, keyboard navigation, autocomplete,
 * and teleprompter highlighting.
 */

const Editor = (() => {

  let _container = null;
  let _activeBlock = null;
  let _pickerOpen = false;
  let _suggestOpen = false;
  let _suggestIndex = 0;

  // ── Init ──────────────────────────────────────────────────────────────────

  function init(containerEl) {
    _container = containerEl;
    document.addEventListener('keydown', _globalKeyHandler);
    document.addEventListener('click', _globalClickHandler);
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  function renderScene(scene) {
    _container.innerHTML = '';
    if (!scene) return;
    scene.blocks.forEach(b => _container.appendChild(_makeBlock(b)));
    _container.querySelectorAll('.block-input').forEach(_autoResize);
    const first = _container.querySelector('.block-input');
    if (first) setTimeout(() => first.focus(), 50);
  }

  function getBlocks() {
    const blocks = [];
    _container.querySelectorAll('.script-block').forEach(el => {
      blocks.push({
        id: el.dataset.id,
        type: el.dataset.type,
        text: el.querySelector('.block-input').value,
      });
    });
    return blocks;
  }

  // ── Block creation ────────────────────────────────────────────────────────

  function _makeBlock(b) {
    const wrap = document.createElement('div');
    wrap.className = `script-block block-${b.type}`;
    wrap.dataset.id = b.id;
    wrap.dataset.type = b.type;

    const label = document.createElement('div');
    label.className = 'block-type-label';
    label.textContent = b.type.replace('-', ' ');
    wrap.appendChild(label);

    const ta = document.createElement('textarea');
    ta.className = 'block-input';
    ta.rows = 1;
    ta.value = b.text || '';
    ta.setAttribute('spellcheck', (b.type === 'dialogue' || b.type === 'action') ? 'true' : 'false');
    ta.setAttribute('autocapitalize', _isCapsType(b.type) ? 'characters' : 'none');
    ta.setAttribute('autocorrect', 'off');
    _setPlaceholder(ta, b.type);

    ta.addEventListener('input',   () => { _autoResize(ta); _onInput(ta, wrap); });
    ta.addEventListener('keydown', (e) => _handleKey(e, wrap));
    ta.addEventListener('focus',   () => { _activeBlock = wrap; _closePicker(); });

    wrap.appendChild(ta);
    return wrap;
  }

  function _makeNewBlock(type) {
    const id = 'b' + Date.now() + Math.floor(Math.random() * 1000);
    return _makeBlock({ id, type, text: '' });
  }

  // ── Block utilities ───────────────────────────────────────────────────────

  function _isCapsType(type) {
    return CONFIG.blockTypes.find(t => t.id === type)?.caps || false;
  }

  function _setPlaceholder(ta, type) {
    const map = {
      'scene-heading': 'INT. / EXT. LOCATION',
      'action':        'Action / description...',
      'character':     'CHARACTER',
      'dialogue':      'Dialogue...',
      'parenthetical': '(beat)',
      'sound':         'SOUND EFFECT / FX',
      'transition':    'CUT TO:',
    };
    ta.placeholder = map[type] || '';
  }

  function _autoResize(ta) {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }

  function setBlockType(block, type) {
    if (!block) return;
    block.className = `script-block block-${type}`;
    block.dataset.type = type;
    const ta = block.querySelector('.block-input');
    const label = block.querySelector('.block-type-label');
    _setPlaceholder(ta, type);
    label.textContent = type.replace('-', ' ');
    ta.setAttribute('autocapitalize', _isCapsType(type) ? 'characters' : 'none');
    if (_isCapsType(type)) _applyUppercase(ta);
    _autoResize(ta);
    ta.focus();
    _closePicker();
  }

  // Reassigning textarea.value always resets the caret to the end, even when the
  // new value is identical — so only write when the case actually changed, and
  // restore the caret/selection afterwards.
  function _applyUppercase(ta) {
    const upper = ta.value.toUpperCase();
    if (upper === ta.value) return;
    const { selectionStart, selectionEnd } = ta;
    ta.value = upper;
    ta.selectionStart = selectionStart;
    ta.selectionEnd = selectionEnd;
  }

  function getActiveBlock() { return _activeBlock; }

  // ── Keyboard handling ─────────────────────────────────────────────────────

  function _handleKey(e, block) {
    const ta = block.querySelector('.block-input');
    const type = block.dataset.type;

    if (_suggestOpen) {
      if (e.key === 'ArrowDown')  { e.preventDefault(); _moveSuggest(1); return; }
      if (e.key === 'ArrowUp')    { e.preventDefault(); _moveSuggest(-1); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); _acceptSuggest(ta); return; }
      if (e.key === 'Escape')     { e.preventDefault(); _closeSuggest(); return; }
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) { _showPicker(block); return; }
      const types = CONFIG.blockTypes.map(t => t.id);
      const next = types[(types.indexOf(type) + 1) % types.length];
      setBlockType(block, next);
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const followTypes = CONFIG.followType;
      const nextType = followTypes[type] || 'action';
      const nb = _makeNewBlock(nextType);
      block.after(nb);
      nb.querySelector('.block-input').focus();
      State.markDirty();
      return;
    }

    if (e.key === 'Backspace' && ta.value === '') {
      e.preventDefault();
      const prev = block.previousElementSibling;
      if (prev) {
        block.remove();
        const pta = prev.querySelector('.block-input');
        pta.focus();
        pta.selectionStart = pta.selectionEnd = pta.value.length;
        State.markDirty();
      }
      return;
    }

    if (e.key === 'ArrowUp' && ta.selectionStart === 0) {
      const prev = block.previousElementSibling;
      if (prev) { e.preventDefault(); prev.querySelector('.block-input').focus(); }
      return;
    }
    if (e.key === 'ArrowDown' && ta.selectionStart === ta.value.length) {
      const next = block.nextElementSibling;
      if (next) { e.preventDefault(); next.querySelector('.block-input').focus(); }
      return;
    }
  }

  function _onInput(ta, block) {
    const type = block.dataset.type;
    if (_isCapsType(type)) _applyUppercase(ta);
    if (type === 'character') _showCharSuggest(ta);
    State.markDirty();
  }

  // ── Element picker ────────────────────────────────────────────────────────

  function _showPicker(block) {
    const picker = document.getElementById('element-picker');
    const rect = block.getBoundingClientRect();
    picker.style.left = rect.left + 'px';
    picker.style.top  = (rect.bottom + 4) + 'px';
    picker.classList.add('visible');
    _pickerOpen = true;
  }

  function _closePicker() {
    document.getElementById('element-picker')?.classList.remove('visible');
    _pickerOpen = false;
  }

  // ── Character autocomplete ────────────────────────────────────────────────

  function _showCharSuggest(ta) {
    const val = ta.value.toUpperCase();
    if (val.length < 1) { _closeSuggest(); return; }
    const chars = State.get().project?.characters || [];
    const matches = chars.filter(c => c.startsWith(val) && c !== val);
    if (!matches.length) { _closeSuggest(); return; }

    const el = document.getElementById('char-suggest');
    el.innerHTML = '';
    matches.slice(0, 6).forEach((c, i) => {
      const item = document.createElement('div');
      item.className = 'cs-item' + (i === 0 ? ' selected' : '');
      item.textContent = c;
      item.onclick = () => { ta.value = c; _closeSuggest(); ta.focus(); };
      el.appendChild(item);
    });
    _suggestIndex = 0;
    const rect = ta.getBoundingClientRect();
    el.style.left = rect.left + 'px';
    el.style.top  = (rect.bottom + 2) + 'px';
    el.classList.add('visible');
    _suggestOpen = true;
  }

  function _moveSuggest(dir) {
    const items = document.querySelectorAll('.cs-item');
    items[_suggestIndex]?.classList.remove('selected');
    _suggestIndex = Math.max(0, Math.min(items.length - 1, _suggestIndex + dir));
    items[_suggestIndex]?.classList.add('selected');
  }

  function _acceptSuggest(ta) {
    const sel = document.querySelector('.cs-item.selected');
    if (sel) ta.value = sel.textContent;
    _closeSuggest();
    ta.focus();
  }

  function _closeSuggest() {
    document.getElementById('char-suggest')?.classList.remove('visible');
    _suggestOpen = false;
    _suggestIndex = 0;
  }

  // ── Teleprompter ──────────────────────────────────────────────────────────

  function highlightBlock(blockId) {
    _container.querySelectorAll('.tts-active').forEach(el => el.classList.remove('tts-active'));
    if (!blockId) return;
    const block = _container.querySelector(`[data-id="${blockId}"]`);
    if (!block) return;
    block.classList.add('tts-active');
    block.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ── Global handlers ───────────────────────────────────────────────────────

  function _globalKeyHandler(e) {
    if (e.key === 'Escape') { _closePicker(); _closeSuggest(); }
    if (_pickerOpen) {
      const match = CONFIG.blockTypes.find(t => t.shortcut === e.key.toLowerCase());
      if (match) { e.preventDefault(); setBlockType(_activeBlock, match.id); }
    }
  }

  function _globalClickHandler(e) {
    if (!e.target.closest('#element-picker')) _closePicker();
    if (!e.target.closest('#char-suggest') && !e.target.closest('.block-character')) _closeSuggest();
  }

  return {
    init,
    renderScene,
    getBlocks,
    setBlockType,
    getActiveBlock,
    highlightBlock,
  };
})();
