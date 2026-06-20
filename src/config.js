/**
 * config.js
 * Central configuration for the scriptwriter app.
 * In a future hosted version, these values would come from
 * environment variables or a server-side config endpoint.
 */

const CONFIG = {
  app: {
    name: 'Scriptwriter',          // Replace when name is decided
    version: '0.1.0',
    buildType: 'local',            // 'local' | 'hosted' | 'commercial'
  },

  storage: {
    localStorageKey: 'scriptwriter_project_v1',
    autosaveIntervalMs: 30000,
  },

  formats: {
    screenplay: {
      id: 'screenplay',
      label: 'Screenplay',
      characterAlign: 'center',
      dialogueIndent: true,
    },
    bbc: {
      id: 'bbc',
      label: 'BBC Radio',
      characterAlign: 'left',
      dialogueIndent: false,
    },
  },

  /**
   * Block types available in the editor.
   * Order determines Tab-cycle sequence.
   * Each entry defines behaviour and display properties.
   */
  blockTypes: [
    { id: 'action',        label: 'Action',        caps: false, shortcut: 'a' },
    { id: 'character',     label: 'Character',     caps: true,  shortcut: 'c' },
    { id: 'dialogue',      label: 'Dialogue',      caps: false, shortcut: 'd' },
    { id: 'parenthetical', label: 'Parenthetical', caps: false, shortcut: 'p' },
    { id: 'sound',         label: 'Sound / FX',    caps: true,  shortcut: 'f' },
    { id: 'scene-heading', label: 'Scene Heading', caps: true,  shortcut: 's' },
    { id: 'transition',    label: 'Transition',    caps: true,  shortcut: 't' },
  ],

  /**
   * Auto-follow rules: what block type appears after Enter
   * on each block type.
   */
  followType: {
    'character':     'dialogue',
    'dialogue':      'dialogue',
    'parenthetical': 'dialogue',
    'action':        'action',
    'scene-heading': 'action',
    'sound':         'action',
    'transition':    'scene-heading',
  },

  /**
   * ElevenLabs integration config.
   * API key is never stored here — entered at runtime by user.
   * model and voiceSettings are defaults; user can override.
   */
  elevenlabs: {
    baseUrl: 'https://api.elevenlabs.io/v1',
    // Proxy base path: route client requests through your server-side proxy to keep
    // the ElevenLabs API key secret. Default routes to a same-origin endpoint '/el'.
    // Set to null only if you accept storing the API key in the browser (not recommended).
    proxyBaseUrl: '/el',
    defaultModel: 'eleven_multilingual_v2',
    dialogueModel: 'eleven_v3',          // For Text to Dialogue API
    sfxModel: 'eleven_sound_generation', // For Sound Effects API
    defaultVoiceSettings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.3,
      use_speaker_boost: true,
    },
    maxCharsPerRequest: 2000,            // ElevenLabs Text to Dialogue limit
    stageMgrVoiceId: null,               // Set by user
  },

  /**
   * Export formats supported.
   * Extend here when adding new export types (e.g. Final Draft .fdx).
   */
  exports: {
    txt:         { label: 'Plain Text (.txt)',    ext: 'txt' },
    json:        { label: 'Project File (.json)', ext: 'json' },
    elevenlabs:  { label: 'ElevenLabs Script',   ext: 'txt' },
    pdf:         { label: 'PDF (via print)',      ext: 'pdf' },
  },
};

// Freeze to prevent accidental mutation
Object.freeze(CONFIG);
Object.freeze(CONFIG.app);
Object.freeze(CONFIG.elevenlabs);
