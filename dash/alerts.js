// Notification chime. Synthesised with WebAudio so there is no audio file to ship.
(function () {
  let ctx = null;

  function audioContext() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) {
      try {
        ctx = new Ctor();
      } catch {
        return null;
      }
    }
    return ctx;
  }

  // Browsers keep AudioContext suspended until a user gesture. Unlock on the
  // first click/key so later polls can chime without being inside a click.
  function unlock() {
    const audio = audioContext();
    if (audio && audio.state === 'suspended') audio.resume().catch(() => {});
  }
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });

  const NOTES = [
    { freq: 880, at: 0 },
    { freq: 1174.66, at: 0.1 },
  ];

  async function playChime() {
    const audio = audioContext();
    if (!audio) return false;

    try {
      if (audio.state === 'suspended') await audio.resume();
    } catch {
      return false;
    }
    if (audio.state !== 'running') return false;

    const now = audio.currentTime;
    for (const note of NOTES) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      const start = now + note.at;

      osc.type = 'sine';
      osc.frequency.value = note.freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);

      osc.connect(gain).connect(audio.destination);
      osc.start(start);
      osc.stop(start + 0.32);
    }
    return true;
  }

  window.PeekdAlerts = { playChime };
})();
