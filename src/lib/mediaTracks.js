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
