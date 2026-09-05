import { expect, test, vi } from 'vitest';
import { createCallSoundPlayer, getCallSound } from './callSounds';

test.each([
  [{ type: 'microphone-toggle', isMuted: true }, 'mic-off'],
  [{ type: 'microphone-toggle', isMuted: false }, 'mic-on'],
  [{ type: 'camera-toggle', isCameraOff: true }, 'camera-off'],
  [{ type: 'camera-toggle', isCameraOff: false }, 'camera-on'],
  [{ type: 'screen-toggle', isScreenSharing: true }, 'share-on'],
  [{ type: 'screen-toggle', isScreenSharing: false }, 'share-off'],
  [{ type: 'camera-toggle', isCameraOff: 'false' }, null],
  [{ type: 'movie-state', isPlaying: true }, null],
])('maps only valid call actions to sound cues: %j', (event, expected) => {
  expect(getCallSound(event)).toBe(expected);
});

test('does not queue blocked audio and disposes the audio context', () => {
  const close = vi.fn(async () => {});
  const oscillator = vi.fn();
  const resume = vi.fn(async () => {});
  vi.stubGlobal('window', {
    AudioContext: class {
      state = 'suspended';
      resume = resume;
      close = close;
      createOscillator = oscillator;
    },
  });
  try {
    const player = createCallSoundPlayer();
    player.play('mic-on');
    expect(resume).toHaveBeenCalledOnce();
    expect(oscillator).not.toHaveBeenCalled();
    player.dispose();
    player.play('camera-on');
    expect(close).toHaveBeenCalledOnce();
    expect(oscillator).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
