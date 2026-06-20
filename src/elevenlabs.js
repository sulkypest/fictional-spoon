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
    const opts = {
      method,
      headers: {
        'xi-api-key': apiKey,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    };

    const base = CONFIG.elevenlabs.proxyBaseUrl || CONFIG.elevenlabs.baseUrl;
    const url = base + path;
    const res = await fetch(url, opts);

    if (!res.ok) {
      let msg = `ElevenLabs API error ${res.status}`;
      try { const e = await res.json(); msg = e.detail?.message || e.detail || msg; } catch {}
      throw new Error(msg);
    }

    return returnBlob ? res.blob() : res.json();
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

  // ── Text to Dialogue (multi-speaker, Eleven v3) ───────────────────────────

  /**
   * Generate a complete multi-speaker dialogue scene.
   * @param {string} apiKey
   * @param {Array} inputs - [{ text, voiceId }, ...]
   * @returns {Blob} - audio/mpeg blob
   */
  async function generateDialogue(apiKey, inputs) {
    // Split into chunks of CONFIG.elevenlabs.maxCharsPerRequest
    const chunks = _chunkDialogue(inputs);
    const blobs = [];

    for (const chunk of chunks) {
      const payload = {
        model_id: CONFIG.elevenlabs.dialogueModel,
        inputs: chunk.map(item => ({
          text: item.text,
          voice_id: item.voiceId,
        })),
      };
      const blob = await _request(apiKey, '/text-to-dialogue', 'POST', payload, true);
      blobs.push(blob);
    }

    // Combine blobs if multiple chunks
    return blobs.length === 1 ? blobs[0] : new Blob(blobs, { type: 'audio/mpeg' });
  }

  /**
   * Split dialogue inputs into chunks that respect the character limit.
   */
  function _chunkDialogue(inputs) {
    const limit = CONFIG.elevenlabs.maxCharsPerRequest;
    const chunks = [];
    let current = [];
    let count = 0;

    for (const item of inputs) {
      if (count + item.text.length > limit && current.length > 0) {
        chunks.push(current);
        current = [];
        count = 0;
      }
      current.push(item);
      count += item.text.length;
    }
    if (current.length) chunks.push(current);
    return chunks;
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
   * Convert editor blocks for a scene into ElevenLabs dialogue inputs.
   * Separates dialogue from sound cues.
   * @param {Array} blocks - scene blocks from editor
   * @param {Object} voiceMap - { CHARACTER_NAME: voiceId }
   * @param {string} stageMgrVoiceId - voice for stage directions
   * @returns {{ dialogueInputs: Array, soundCues: Array }}
   */
  function parseSceneForGeneration(blocks, voiceMap, stageMgrVoiceId) {
    const dialogueInputs = [];
    const soundCues = [];
    let currentChar = null;

    for (const block of blocks) {
      const text = (block.text || '').trim();
      if (!text) continue;

      if (block.type === 'character') {
        currentChar = text;
        continue;
      }

      if (block.type === 'dialogue') {
        dialogueInputs.push({
          text,
          voiceId: voiceMap[currentChar] || null,
          character: currentChar,
          blockId: block.id,
        });
        continue;
      }

      if (block.type === 'parenthetical') {
        // Read by stage manager in between dialogue
        const clean = text.replace(/^\(|\)$/g, '');
        dialogueInputs.push({
          text: clean,
          voiceId: stageMgrVoiceId,
          character: '__STAGE_MANAGER__',
          blockId: block.id,
        });
        currentChar = null;
        continue;
      }

      if (block.type === 'sound') {
        soundCues.push({
          prompt: text,
          blockId: block.id,
          label: text.substring(0, 50),
        });
        currentChar = null;
        continue;
      }

      if (block.type === 'action') {
        // Action lines narrated by stage manager
        dialogueInputs.push({
          text,
          voiceId: stageMgrVoiceId,
          character: '__STAGE_MANAGER__',
          blockId: block.id,
        });
        currentChar = null;
        continue;
      }
    }

    return { dialogueInputs, soundCues };
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
    generateDialogue,
    generateSoundEffect,
    parseSceneForGeneration,
    validateApiKey,
  };
})();
