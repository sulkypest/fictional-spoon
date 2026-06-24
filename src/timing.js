/**
 * timing.js
 * Estimates spoken duration for a scene's blocks, for display only — a pacing
 * guide, not a guarantee of actual ElevenLabs-generated audio length.
 */

const Timing = (() => {

  function estimateSeconds(blocks) {
    let words = 0;
    let sfxCount = 0;
    (blocks || []).forEach(b => {
      const text = (b.text || '').trim();
      if (!text) return;
      if (b.type === 'sound') { sfxCount++; return; }
      // Only dialogue and action lines are actually spoken — character names,
      // scene headings, transitions, and parentheticals (now delivery tags) aren't.
      if (b.type === 'dialogue' || b.type === 'action') {
        words += text.split(/\s+/).length;
      }
    });
    return (words / CONFIG.timing.wordsPerMinute) * 60 + sfxCount * CONFIG.timing.soundEffectSeconds;
  }

  function formatDuration(totalSeconds) {
    const s = Math.max(0, Math.round(totalSeconds));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  return { estimateSeconds, formatDuration };
})();
