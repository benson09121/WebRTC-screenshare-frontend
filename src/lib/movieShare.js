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

export const isExpectedPlaybackInterruption = (error) => {
  if (error?.name === 'AbortError') return true;
  const message = String(error?.message || error || '');
  return /play\(\) request was interrupted|interrupted by a call to pause|interrupted by a new load request/i.test(
    message,
  );
};

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

  if (url.username || url.password) {
    throw new Error(
      'Links containing a username or password are not supported. Use a credential-free or time-limited signed URL.',
    );
  }

  const hostname = url.hostname.toLowerCase();
  const isKnownVideoPage = UNSUPPORTED_PAGE_HOSTS.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  );
  if (isKnownVideoPage) {
    throw new Error(
      'That is a video page, not a playable media URL. Use a direct video link or share the browser tab with audio.',
    );
  }

  return url.href;
};

export const sanitizeSharedDirectMediaUrl = (value) => {
  if (typeof value !== 'string' || value.length > 4096) return null;
  try {
    return normalizeDirectMediaUrl(value);
  } catch {
    return null;
  }
};

export const getDirectMediaDisplayName = (value) => {
  try {
    const url = new URL(value);
    const pathName = decodeURIComponent(
      url.pathname.split('/').filter(Boolean).at(-1) || '',
    );
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

export const getMovieVideoGeometry = (mediaElement) => {
  const width = Number(mediaElement?.videoWidth);
  const height = Number(mediaElement?.videoHeight);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return { width: null, height: null, aspectRatio: null };
  }
  return { width, height, aspectRatio: width / height };
};

export const getCaptureStream = (mediaElement) => {
  if (typeof mediaElement?.captureStream === 'function')
    return mediaElement.captureStream();
  if (typeof mediaElement?.mozCaptureStream === 'function')
    return mediaElement.mozCaptureStream();
  return null;
};

export const waitForMovieMetadata = (
  mediaElement,
  {
    timeoutMs = 15000,
    errorMessage = 'This browser cannot play the selected movie format. Try MP4 (H.264/AAC) or WebM.',
  } = {},
) =>
  new Promise((resolve, reject) => {
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

    mediaElement.addEventListener('loadedmetadata', handleLoadedMetadata, {
      once: true,
    });
    mediaElement.addEventListener('error', handleError, { once: true });
    timeoutId = globalThis.setTimeout(handleError, timeoutMs);
  });

export const waitForMovieFrame = (
  mediaElement,
  {
    timeoutMs = 10000,
    errorMessage = 'The browser could not decode a video frame from this movie. Try MP4 (H.264/AAC) or WebM.',
  } = {},
) =>
  new Promise((resolve, reject) => {
    const hasDecodedFrame = () =>
      mediaElement.readyState >= 2 &&
      mediaElement.videoWidth > 0 &&
      mediaElement.videoHeight > 0;
    if (hasDecodedFrame()) {
      resolve();
      return;
    }

    let timeoutId;
    const cleanup = () => {
      globalThis.clearTimeout(timeoutId);
      mediaElement.removeEventListener('loadeddata', handleReady);
      mediaElement.removeEventListener('canplay', handleReady);
      mediaElement.removeEventListener('error', handleError);
    };
    const handleReady = () => {
      if (!hasDecodedFrame()) return;
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error(errorMessage));
    };

    mediaElement.addEventListener('loadeddata', handleReady);
    mediaElement.addEventListener('canplay', handleReady);
    mediaElement.addEventListener('error', handleError, { once: true });
    timeoutId = globalThis.setTimeout(handleError, timeoutMs);
  });

export const waitForCapturedTrack = (stream, kind, { timeoutMs = 4000 } = {}) =>
  new Promise((resolve, reject) => {
    const getTrack = () =>
      stream
        ?.getTracks()
        .find((track) => track.kind === kind && track.readyState !== 'ended');
    const existingTrack = getTrack();
    if (existingTrack) {
      resolve(existingTrack);
      return;
    }

    let timeoutId;
    let pollId;
    let settled = false;
    const cleanup = () => {
      globalThis.clearTimeout(timeoutId);
      globalThis.clearInterval(pollId);
      stream?.removeEventListener?.('addtrack', handleAddTrack);
    };
    const resolveTrack = (track) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(track);
    };
    const handleAddTrack = (event) => {
      if (event.track?.kind === kind && event.track.readyState !== 'ended') {
        resolveTrack(event.track);
      }
    };
    const checkForTrack = () => {
      const track = getTrack();
      if (track) resolveTrack(track);
    };

    stream?.addEventListener?.('addtrack', handleAddTrack);
    pollId = globalThis.setInterval(checkForTrack, 50);
    timeoutId = globalThis.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`The browser did not expose a captured ${kind} track.`));
    }, timeoutMs);
    // Recheck after subscribing to close the gap between the first lookup and listener.
    checkForTrack();
  });

const parseSubtitleTimestamp = (value) => {
  const match = value
    .trim()
    .match(/^(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!match) return null;
  const [, hours = '0', minutes, seconds, milliseconds] = match;
  return (
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    Number(seconds) +
    Number(milliseconds) / 1000
  );
};

export const parseSrt = (value = '') => {
  const normalized = value
    .replace(/^\uFEFF/, '')
    .replace(/\r/g, '')
    .trim();
  if (!normalized) return [];

  const cues = [];
  for (const block of normalized.split(/\n{2,}/)) {
    const lines = block.split('\n');
    if (/^\d+$/.test(lines[0]?.trim())) lines.shift();
    const timingLine = lines.shift() || '';
    const timingMatch = timingLine.match(/^(.+?)\s+-->\s+(.+?)(?:\s+.*)?$/);
    if (!timingMatch) continue;
    const startTime = parseSubtitleTimestamp(timingMatch[1]);
    const endTime = parseSubtitleTimestamp(timingMatch[2]);
    const text = lines.join('\n').trim();
    if (startTime == null || endTime == null || endTime <= startTime || !text)
      continue;
    cues.push({ startTime, endTime, text });
  }

  return cues.sort((first, second) => first.startTime - second.startTime);
};

export const getActiveSubtitleText = (cues, currentTime) => {
  if (!Array.isArray(cues) || !Number.isFinite(currentTime)) return '';

  let low = 0;
  let high = cues.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const cue = cues[middle];
    if (currentTime < cue.startTime) {
      high = middle - 1;
    } else if (currentTime >= cue.endTime) {
      low = middle + 1;
    } else {
      return cue.text;
    }
  }
  return '';
};

export const getNativeAudioTrackOptions = (mediaElement) => {
  const tracks = Array.from(mediaElement?.audioTracks || []);
  return tracks.map((track, index) => ({
    index,
    label: track.label || track.language || `Audio ${index + 1}`,
    language: track.language || null,
    enabled: Boolean(track.enabled),
  }));
};

export const selectNativeAudioTrack = (mediaElement, selectedIndex) => {
  const tracks = Array.from(mediaElement?.audioTracks || []);
  if (!tracks.length || selectedIndex < 0 || selectedIndex >= tracks.length)
    return false;
  tracks.forEach((track, index) => {
    track.enabled = index === selectedIndex;
  });
  return true;
};

export const getNativeSubtitleTrackOptions = (mediaElement) =>
  Array.from(mediaElement?.textTracks || [])
    .map((track, index) => ({ track, index }))
    .filter(
      ({ track }) => track.kind === 'subtitles' || track.kind === 'captions',
    )
    .map(({ track, index }) => ({
      index,
      label: track.label || track.language || `Subtitles ${index + 1}`,
      language: track.language || null,
      active: track.mode === 'showing' || track.mode === 'hidden',
    }));

export const selectNativeSubtitleTrack = (
  mediaElement,
  selectedIndex,
  enabled = true,
) => {
  const tracks = Array.from(mediaElement?.textTracks || []);
  let selected = false;
  tracks.forEach((track, index) => {
    if (track.kind !== 'subtitles' && track.kind !== 'captions') return;
    const shouldSelect = enabled && index === selectedIndex;
    track.mode = shouldSelect ? 'hidden' : 'disabled';
    if (shouldSelect) selected = true;
  });
  return selected;
};

export const getActiveNativeSubtitleText = (mediaElement, selectedIndex) => {
  const track = Array.from(mediaElement?.textTracks || [])[selectedIndex];
  if (!track?.activeCues) return '';
  return Array.from(track.activeCues)
    .map((cue) => cue.text || '')
    .filter(Boolean)
    .join('\n');
};
