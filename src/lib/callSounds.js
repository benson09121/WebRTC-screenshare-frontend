// Original, short synthesized cues: ascending enables, descending disables.
const NOTES = {
  'mic-on': [520, 780],
  'mic-off': [620, 390],
  'camera-on': [660, 880, 1100],
  'camera-off': [880, 660, 440],
  'share-on': [440, 660, 880],
  'share-off': [660, 440, 330],
};

export const getCallSound = (data) => {
  if (data?.type === 'microphone-toggle' && typeof data.isMuted === 'boolean')
    return data.isMuted ? 'mic-off' : 'mic-on';
  if (data?.type === 'camera-toggle' && typeof data.isCameraOff === 'boolean')
    return data.isCameraOff ? 'camera-off' : 'camera-on';
  if (
    data?.type === 'screen-toggle' &&
    typeof data.isScreenSharing === 'boolean'
  )
    return data.isScreenSharing ? 'share-on' : 'share-off';
  return null;
};

export const createCallSoundPlayer = () => {
  let context;
  let lastPlayedAt = -Infinity;
  let disposed = false;
  const unlock = () => {
    if (disposed) return;
    try {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      context ||= new AudioContextClass();
      if (context.state === 'suspended') context.resume().catch(() => {});
    } catch {
      /* Sound availability must never block a call action. */
    }
  };
  return {
    unlock,
    play(name) {
      if (!NOTES[name] || disposed) return;
      unlock();
      // Never queue cues while autoplay is blocked or replay them on reconnect.
      if (context?.state !== 'running') return;
      const now = context.currentTime;
      if (now - lastPlayedAt < 0.12) return;
      lastPlayedAt = now;
      NOTES[name].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = now + index * 0.065;
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.045, start + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.11);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.12);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
      });
    },
    dispose() {
      disposed = true;
      context?.close().catch(() => {});
      context = undefined;
    },
  };
};
