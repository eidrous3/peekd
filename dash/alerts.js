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

  const NOTES = [
    { freq: 880, at: 0 },      // A5
    { freq: 1174.66, at: 0.1 }, // D6
  ];

  function playChime() {
    const audio = audioContext();
    if (!audio) return false;

    // Browsers keep the context suspended until the page has been interacted
    // with; resuming is a no-op once the user has clicked anything.
    if (audio.state === 'suspended') audio.resume().catch(() => {});

    const now = audio.currentTime;
    for (const note of NOTES) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      const start = now + note.at;

      osc.type = 'sine';
      osc.frequency.value = note.freq;
      // Quick attack then a decay tail, so it reads as a chime and not a beep.
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
