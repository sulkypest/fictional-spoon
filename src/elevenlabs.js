/**
 * elevenlabs.js
 * Abstraction layer for all ElevenLabs API interactions.
 *
 * Designed so the provider can be swapped (e.g. to OpenAI TTS, Google TTS)
 * by replacing this module without touching the rest of the app.
 *
 * API key is passed at call time — never stored in this module.
 * In a hosted commercial version, calls would go through your own
 * backend proxy so the API key never touches the client at all.
 */

const ElevenLabsService = (() => {

  // ── Helpers ──────────────────────────────────────────────────────────────

  async function _request(apiKey, path, method = 'GET', body = null, returnBlob = false) {
    const useProxy = !apiKey && Boolean(CONFIG.elevenlabs.proxyBaseUrl);
    const base = useProxy ? CONFIG.elevenlabs.proxyBaseUrl : CONFIG.elevenlabs.baseUrl;
    const headers = {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    };

    if (useProxy) {
      const token = window.FirebaseAuth ? await window.FirebaseAuth.getToken() : null;
      if (!token) throw new Error('Authentication required for ElevenLabs proxy');
      headers['Authorization'] = `Bearer ${token}`;
    } else if (apiKey) {
      headers['xi-api-key'] = apiKey;
    }

    const opts = {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    };

    const url = base + path;
    const res = await fetch(url, opts);

    if (!res.ok) {
      let msg = `ElevenLabs API error ${res.status}`;
      try { const e = await res.json(); msg = e.detail?.message || e.detail || msg; } catch {}
      throw new Error(msg);
    }

    if (returnBlob) {
      if (useProxy) {
        const payload = await res.json();
        if (payload && payload.binary) {
          const binary = atob(payload.binary);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          return new Blob([bytes], { type: payload.contentType || 'audio/mpeg' });
        }
        throw new Error('Proxy returned no binary audio data');
      }
      return res.blob();
    }

    return res.json();
  }

  // ── Voice library ─────────────────────────────────────────────────────────

  async function getVoices(apiKey) {
    const data = await _request(apiKey, '/voices');
    return data.voices.map(v => ({
      id: v.voice_id,
      name: v.name,
      category: v.category,
      labels: v.labels,
      previewUrl: v.preview_url,
    }));
  }

  /**
   * Search the full ElevenLabs Voice Library (thousands of community voices),
   * as opposed to getVoices() which only returns voices already saved to this account.
   * @param {string} apiKey
   * @param {{search?:string, gender?:string, age?:string, accent?:string, useCase?:string, page?:number, pageSize?:number}} filters
   * @returns {{ voices: Array, hasMore: boolean }}
   */
  async function searchVoiceLibrary(apiKey, filters = {}) {
    const { search = '', gender = '', age = '', accent = '', useCase = '', page = 0, pageSize = 24 } = filters;
    const params = new URLSearchParams();
    params.set('page_size', String(pageSize));
    params.set('page', String(page));
    if (search) params.set('search', search);
    if (gender) params.set('gender', gender);
    if (age) params.set('age', age);
    if (accent) params.set('accent', accent);
    if (useCase) params.set('use_cases', useCase);

    const data = await _request(apiKey, `/shared-voices?${params.toString()}`);
    const voices = (data.voices || []).map(v => ({
      id: v.voice_id,
      publicOwnerId: v.public_owner_id,
      name: v.name,
      category: v.category,
      gender: v.gender,
      age: v.age,
      accent: v.accent,
      useCase: v.use_case,
      descriptive: v.descriptive,
      language: v.language,
      previewUrl: v.preview_url,
    }));
    return { voices, hasMore: voices.length === pageSize };
  }

  /**
   * Add a voice from the public Voice Library to this account. Required before a
   * shared voice's id can be used in generation calls — shared voices aren't
   * usable by id until they belong to your own library.
   * @param {string} apiKey
   * @param {string} publicOwnerId
   * @param {string} voiceId
   * @param {string} name
   * @returns {string} the new voice_id usable in this account
   */
  async function addSharedVoice(apiKey, publicOwnerId, voiceId, name) {
    const data = await _request(apiKey, `/voices/add/${publicOwnerId}/${voiceId}`, 'POST', { new_name: name });
    return data.voice_id;
  }

  // ── Text to Dialogue (multi-speaker, Eleven v3) ───────────────────────────

  /**
   * Generate audio for a single dialogue chunk (one text-to-dialogue call). Callers
   * are responsible for chunking — see parseSceneForGeneration, which already splits
   * on the character limit and on sound-cue boundaries.
   * @param {string} apiKey
   * @param {Array} inputs - [{ text, voiceId }, ...], already within the char limit
   * @returns {Blob} - audio/mpeg blob
   */
  async function generateDialogueChunk(apiKey, inputs) {
    const payload = {
      model_id: CONFIG.elevenlabs.dialogueModel,
      inputs: inputs.map(item => ({
        text: item.text,
        voice_id: item.voiceId,
      })),
    };
    return _request(apiKey, '/text-to-dialogue', 'POST', payload, true);
  }

  // ── Sound Effects ─────────────────────────────────────────────────────────

  /**
   * Generate a sound effect from a text description.
   * @param {string} apiKey
   * @param {string} prompt - plain English description
   * @param {number} durationSeconds - target duration (null = auto)
   * @returns {Blob} - audio blob
   */
  async function generateSoundEffect(apiKey, prompt, durationSeconds = null) {
    const payload = {
      text: prompt,
      ...(durationSeconds ? { duration_seconds: durationSeconds } : {}),
      prompt_influence: 0.3,
    };
    return _request(apiKey, '/sound-generation', 'POST', payload, true);
  }

  // ── Script parsing ────────────────────────────────────────────────────────

  /**
   * Convert editor blocks for a scene into an ORDERED list of generation segments —
   * either a chunk of consecutive dialogue lines (one text-to-dialogue call) or a
   * single sound cue (one sound-generation call) — in script order. Chunk boundaries
   * are forced at every sound cue (so audio can be sequenced/zipped in the right
   * order) and at the existing character-limit, same as before.
   * @param {Array} blocks - scene blocks from editor
   * @param {Object} voiceMap - { CHARACTER_NAME: voiceId }
   * @param {string} stageMgrVoiceId - voice for stage directions
   * @param {{ includeDirections?: boolean }} options - includeDirections (default true):
   *   when false, action/parenthetical lines are dropped entirely instead of being
   *   narrated, for a polished cut where real sound effects stand in for them.
   * @returns {{ segments: Array, dialogueInputs: Array, soundCues: Array }}
   */
  function parseSceneForGeneration(blocks, voiceMap, stageMgrVoiceId, options = {}) {
    const { includeDirections = true } = options;
    const limit = CONFIG.elevenlabs.maxCharsPerRequest;
    const segments = [];
    const dialogueInputs = [];
    const soundCues = [];
    let currentChar = null;
    let chunk = [];
    let chunkChars = 0;

    function flushChunk() {
      if (chunk.length) segments.push({ type: 'dialogue', inputs: chunk });
      chunk = [];
      chunkChars = 0;
    }

    function pushDialogue(input) {
      if (chunkChars + input.text.length > limit && chunk.length > 0) flushChunk();
      chunk.push(input);
      chunkChars += input.text.length;
      dialogueInputs.push(input);
    }

    for (const block of blocks) {
      const text = (block.text || '').trim();
      if (!text) continue;

      if (block.type === 'character') {
        currentChar = text;
        continue;
      }

      if (block.type === 'dialogue') {
        // A sound cue, action beat, or parenthetical between two dialogue blocks
        // doesn't mean the speaker changed — only a new CHARACTER heading does.
        // If dialogue appears with no character ever set (a genuine orphan line),
        // fall back to the stage manager voice rather than blocking generation
        // entirely over one unattributable line.
        const character = currentChar || '__STAGE_MANAGER__';
        if (!currentChar) console.warn('Dialogue block with no preceding character heading, using stage manager voice:', block.id, text);
        pushDialogue({
          text,
          voiceId: currentChar ? (voiceMap[currentChar] || null) : stageMgrVoiceId,
          character,
          blockId: block.id,
        });
        continue;
      }

      if (block.type === 'parenthetical') {
        if (!includeDirections) continue;
        // Read by stage manager in between dialogue
        const clean = text.replace(/^\(|\)$/g, '');
        pushDialogue({
          text: clean,
          voiceId: stageMgrVoiceId,
          character: '__STAGE_MANAGER__',
          blockId: block.id,
        });
        continue;
      }

      if (block.type === 'sound') {
        flushChunk();
        const cue = { prompt: text, blockId: block.id, label: text.substring(0, 50) };
        soundCues.push(cue);
        segments.push({ type: 'sound', ...cue });
        continue;
      }

      if (block.type === 'action') {
        if (!includeDirections) continue;
        // Action lines narrated by stage manager
        pushDialogue({
          text,
          voiceId: stageMgrVoiceId,
          character: '__STAGE_MANAGER__',
          blockId: block.id,
        });
        continue;
      }
    }
    flushChunk();

    return { segments, dialogueInputs, soundCues };
  }

  // ── Validation ────────────────────────────────────────────────────────────

  async function validateApiKey(apiKey) {
    try {
      await _request(apiKey, '/user');
      return { valid: true };
    } catch (e) {
      return { valid: false, error: e.message };
    }
  }

  return {
    getVoices,
    searchVoiceLibrary,
    addSharedVoice,
    generateDialogueChunk,
    generateSoundEffect,
    parseSceneForGeneration,
    validateApiKey,
  };
})();
