# Scriptwriter

A browser-based script editor for audio drama, designed for writers working in BBC Radio and screenplay formats.

Built as a single-page app — no server required, no install, no account. Open `index.html` in any modern browser and write.

---

## Features

- **Dual format support** — switch between Screenplay and BBC Radio style at any time
- **Smart editor** — Tab cycles through element types (Character, Dialogue, Action, Sound, Parenthetical, Scene Heading, Transition). Enter auto-advances to the logical next element
- **Character autocomplete** — type the first letter of a character name and select from the cast list
- **Scene management** — sidebar with add, rename, delete, and reorder
- **Cast panel** — manage your character list; click a name to insert a dialogue block
- **Browser TTS preview** — read scenes aloud using your system's text-to-speech voices, with teleprompter highlighting and per-character voice assignment
- **ElevenLabs integration** — connect your ElevenLabs API key to generate production-quality dialogue and sound effects directly from your script
- **Import** — paste raw `CHARACTER: Dialogue` text and it auto-detects speakers, sound cues, and action lines
- **Export** — plain text (Scrivener-compatible), PDF (via browser print), and ElevenLabs-formatted dialogue + sound cue files
- **Save / Load** — project files saved as `.json`; works entirely locally, no cloud required
- **Light / dark mode**

---

## Getting started

1. Clone or download this repo
2. Open `index.html` in Chrome, Firefox, or Safari
3. Load a project file, or start a new scene

To load the included example project (Little Hellsgate, Episode 1):
- Click **⬆ Load** in the toolbar
- Select `projects/little-hellsgate-ep1.json`

---

## Project file format

Projects are saved as `.json` files with the following structure:

```json
{
  "version": 1,
  "meta": {
    "title": "Project title",
    "subtitle": "Episode or series info",
    "author": "",
    "created": "2026",
    "format": "screenplay"
  },
  "characters": ["STAN", "ARGUS", "VANESSA"],
  "scenes": [
    {
      "id": "unique-id",
      "title": "Scene 1",
      "blocks": [
        { "id": "block-id", "type": "scene-heading", "text": "INT. LOCATION" },
        { "id": "block-id", "type": "character", "text": "STAN" },
        { "id": "block-id", "type": "dialogue", "text": "Hello." }
      ]
    }
  ]
}
```

Block types: `scene-heading`, `action`, `character`, `dialogue`, `parenthetical`, `sound`, `transition`

---

## ElevenLabs integration

To generate audio from your script:

1. Get an API key from [elevenlabs.io](https://elevenlabs.io)
2. Click **⚡ ElevenLabs** in the toolbar
3. Enter your API key and click Connect
4. Assign ElevenLabs voices to each character
5. Click **Generate current scene**

The app generates dialogue (via Text to Dialogue API) and sound effects (via Sound Generation API) as separate `.mp3` files, downloaded to your machine for assembly in your DAW.

Your API key is never stored — it exists only in memory for the current session.

---

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Tab` | Cycle to next element type |
| `Shift+Tab` | Open element type picker |
| `Enter` | New line (auto-advances to follow type) |
| `Backspace` on empty line | Delete block, return to previous |
| `↑` / `↓` | Navigate between blocks |
| `Cmd+S` / `Ctrl+S` | Save project to file |
| `Esc` | Close picker / autocomplete |

---

## File structure

```
/
├── index.html          — App shell and bootstrap
├── assets/
│   └── styles.css      — All styles
├── src/
│   ├── config.js       — Central configuration and feature flags
│   ├── state.js        — Application state management
│   ├── editor.js       — Script editing surface
│   ├── ui.js           — Sidebar, panels, and UI rendering
│   ├── app.js          — Main controller
│   ├── tts.js          — Browser TTS preview engine
│   ├── elevenlabs.js   — ElevenLabs API abstraction
│   └── storage.js      — Save, load, and export
└── projects/
    └── little-hellsgate-ep1.json   — Example project
```

---

## Roadmap

- [ ] Drag-to-reorder scenes
- [ ] Find and replace
- [ ] Version history
- [ ] Collaborative editing
- [ ] Cloud save
- [ ] Additional export formats (Final Draft .fdx, Fountain)
- [ ] Custom format rules per project

---

## Licence

TBD — private repository.
