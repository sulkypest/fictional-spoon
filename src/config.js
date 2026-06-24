/**
 * config.js
 * Central configuration for the scriptwriter app.
 * In a future hosted version, these values would come from
 * environment variables or a server-side config endpoint.
 */

// Backend identity: the Firebase Cloud Function that holds everyone's ElevenLabs
// key server-side. Defined once here so the frontend's own domain (GitHub Pages,
// a future custom domain, etc.) can change without touching any other file.
const ELEVENLABS_API_BASE_URL = 'https://us-central1-draft-punk-a0735.cloudfunctions.net/api';

const CONFIG = {
  app: {
    name: 'Scriptwriter',          // Replace when name is decided
    version: '0.1.0',
    buildType: 'local',            // 'local' | 'hosted' | 'commercial'
  },

  /**
   * Rough estimate of spoken duration, shown per-scene and as a project total.
   * A guide for pacing, not a guarantee of actual generated audio length.
   */
  timing: {
    wordsPerMinute: 150,    // dialogue/action speaking pace
    soundEffectSeconds: 4,  // assumed length per sound cue
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
    apiBaseUrl: ELEVENLABS_API_BASE_URL,
    // Proxy base path: route client requests through the server-side proxy above to
    // keep the ElevenLabs API key secret, instead of calling ElevenLabs directly.
    // Set to null only if you accept storing the API key in the browser (not recommended).
    proxyBaseUrl: ELEVENLABS_API_BASE_URL + '/el',
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

    // Filter options for browsing the Voice Library (/v1/shared-voices). Values match
    // ElevenLabs' filter vocabulary; labels are what's shown in the UI dropdowns.
    voiceFilters: {
      gender: [
        { value: 'male', label: 'Male' },
        { value: 'female', label: 'Female' },
      ],
      age: [
        { value: 'young', label: 'Young' },
        { value: 'middle_aged', label: 'Middle-aged' },
        { value: 'old', label: 'Old' },
      ],
      accent: [
        { value: 'american', label: 'American' },
        { value: 'british', label: 'British' },
        { value: 'australian', label: 'Australian' },
        { value: 'irish', label: 'Irish' },
        { value: 'scottish', label: 'Scottish' },
        { value: 'south african', label: 'South African' },
        { value: 'indian', label: 'Indian' },
        { value: 'african', label: 'African' },
        { value: 'canadian', label: 'Canadian' },
        { value: 'german', label: 'German' },
        { value: 'french', label: 'French' },
        { value: 'spanish', label: 'Spanish' },
        { value: 'italian', label: 'Italian' },
        { value: 'swedish', label: 'Swedish' },
        { value: 'russian', label: 'Russian' },
        { value: 'japanese', label: 'Japanese' },
        { value: 'chinese', label: 'Chinese' },
        { value: 'korean', label: 'Korean' },
        { value: 'arabic', label: 'Arabic' },
        { value: 'transatlantic', label: 'Transatlantic' },
      ],
      useCase: [
        { value: 'narration', label: 'Narration' },
        { value: 'characters_animation', label: 'Characters / Animation' },
        { value: 'conversational', label: 'Conversational' },
        { value: 'social_media', label: 'Social Media' },
        { value: 'entertainment_tv', label: 'Entertainment / TV' },
        { value: 'advertisement', label: 'Advertisement' },
        { value: 'informative_educational', label: 'Informative / Educational' },
      ],
    },
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
