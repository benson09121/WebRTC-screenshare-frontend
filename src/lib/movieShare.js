const MAX_MOVIE_NAME_LENGTH = 96;
const UNSUPPORTED_PAGE_HOSTS = [
  'youtube.com',
  'youtu.be',
  'netflix.com',
  'hulu.com',
  'disneyplus.com',
  'primevideo.com',
  'vimeo.com',
];

export const getMovieDisplayName = (fileName = '') => {
  const normalized = fileName.trim() || 'Untitled movie';
  if (normalized.length <= MAX_MOVIE_NAME_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_MOVIE_NAME_LENGTH - 1)}…`;
};

export const normalizeDirectMediaUrl = (value) => {
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Enter a valid http(s) video URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Enter a valid http(s) video URL.');
  }

  const hostname = url.hostname.toLowerCase();
  const isKnownVideoPage = UNSUPPORTED_PAGE_HOSTS.some(host => (
    hostname === host || hostname.endsWith(`.${host}`)
  ));
  if (isKnownVideoPage) {
    throw new Error('That is a video page, not a playable media URL. Use a direct video link or share the browser tab with audio.');
  }

  return url.href;
};

export const getDirectMediaDisplayName = (value) => {
  try {
    const url = new URL(value);
    const pathName = decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) || '');
    return getMovieDisplayName(pathName || `Video from ${url.hostname}`);
  } catch {
    return 'Linked video';
  }
};

export const formatMediaTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const wholeSeconds = Math.floor(seconds);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainingSeconds = wholeSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
};

export const getCaptureStream = (mediaElement) => {
  if (typeof mediaElement?.captureStream === 'function') return mediaElement.captureStream();
  if (typeof mediaElement?.mozCaptureStream === 'function') return mediaElement.mozCaptureStream();
  return null;
};

export const waitForMovieMetadata = (
  mediaElement,
  {
    timeoutMs = 15000,
    errorMessage = 'This browser cannot play the selected movie format. Try MP4 (H.264/AAC) or WebM.',
  } = {},
) => new Promise((resolve, reject) => {
  if (mediaElement.readyState >= 1) {
    resolve();
    return;
  }

  let timeoutId;
  const cleanup = () => {
    globalThis.clearTimeout(timeoutId);
    mediaElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
    mediaElement.removeEventListener('error', handleError);
  };
  const handleLoadedMetadata = () => {
    cleanup();
    resolve();
  };
  const handleError = () => {
    cleanup();
    reject(new Error(errorMessage));
  };

  mediaElement.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true });
  mediaElement.addEventListener('error', handleError, { once: true });
  timeoutId = globalThis.setTimeout(handleError, timeoutMs);
});
