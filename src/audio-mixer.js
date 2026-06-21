/**
 * audio-mixer.js
 * Sequences a list of generated audio blobs (dialogue chunks + sound effects, in
 * script order) into a single combined master track, using the browser's own
 * Web Audio API — no server round-trip, no third-party library.
 */

const AudioMixer = (() => {

  /**
   * Decode and concatenate audio blobs end-to-end, with a short silence gap
   * between each, and return one combined WAV file.
   * @param {Array<Blob>} blobs - in the order they should play
   * @param {number} gapMs - silence inserted between segments
   * @returns {Promise<Blob>} audio/wav blob
   */
  async function concatToWav(blobs, gapMs = 400) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    try {
      const buffers = [];
      for (const blob of blobs) {
        const arrayBuffer = await blob.arrayBuffer();
        buffers.push(await ctx.decodeAudioData(arrayBuffer));
      }

      const sampleRate = ctx.sampleRate;
      const numChannels = Math.max(1, ...buffers.map(b => b.numberOfChannels));
      const gapSamples = Math.round((gapMs / 1000) * sampleRate);
      const totalSamples = buffers.reduce((sum, b) => sum + b.length, 0) + gapSamples * Math.max(0, buffers.length - 1);

      const channelData = Array.from({ length: numChannels }, () => new Float32Array(totalSamples));
      let offset = 0;
      buffers.forEach((buffer, i) => {
        for (let ch = 0; ch < numChannels; ch++) {
          const src = buffer.getChannelData(Math.min(ch, buffer.numberOfChannels - 1));
          channelData[ch].set(src, offset);
        }
        offset += buffer.length;
        if (i < buffers.length - 1) offset += gapSamples;
      });

      return _encodeWav(channelData, sampleRate);
    } finally {
      ctx.close();
    }
  }

  function _encodeWav(channelData, sampleRate) {
    const numChannels = channelData.length;
    const numSamples = channelData[0].length;
    const bytesPerSample = 2; // 16-bit PCM
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = numSamples * blockAlign;

    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    function writeString(offset, str) {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    }

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);          // fmt chunk size
    view.setUint16(20, 1, true);           // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true); // byte rate
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);          // bits per sample
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, channelData[ch][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  return { concatToWav };
})();
