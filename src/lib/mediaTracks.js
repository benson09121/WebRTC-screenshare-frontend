export const createEmptyVideoTrack = ({ width = 2, height = 2 } = {}) => {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').fillRect(0, 0, width, height);
    const track = canvas.captureStream(1).getVideoTracks()[0];
    track.enabled = false;
    return track;
  } catch {
    return null;
  }
};

export const createEmptyAudioTrack = () => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    const context = new AudioContextClass();
    const destination = context.createMediaStreamDestination();
    const track = destination.stream.getAudioTracks()[0];
    if (!track) {
      context.close().catch(() => {});
      return null;
    }

    track.enabled = false;
    const stop = track.stop.bind(track);
    track.stop = () => {
      stop();
      context.close().catch(() => {});
    };
    return track;
  } catch {
    return null;
  }
};
