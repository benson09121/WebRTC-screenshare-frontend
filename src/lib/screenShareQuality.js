export const AUTO_QUALITY_PROFILES = Object.freeze({
  motion: Object.freeze([
    Object.freeze({
      label: '1080p · 60fps',
      width: 1920,
      height: 1080,
      frameRate: 60,
      bitrate: 10000000,
    }),
    Object.freeze({
      label: '720p · 60fps',
      width: 1280,
      height: 720,
      frameRate: 60,
      bitrate: 6000000,
    }),
    Object.freeze({
      label: '720p · 30fps',
      width: 1280,
      height: 720,
      frameRate: 30,
      bitrate: 3500000,
    }),
    Object.freeze({
      label: '480p · 30fps',
      width: 854,
      height: 480,
      frameRate: 30,
      bitrate: 2200000,
    }),
  ]),
  movie: Object.freeze([
    Object.freeze({
      label: '1080p · 30fps',
      width: 1920,
      height: 1080,
      frameRate: 30,
      bitrate: 8000000,
    }),
    Object.freeze({
      label: '720p · 30fps',
      width: 1280,
      height: 720,
      frameRate: 30,
      bitrate: 4500000,
    }),
    Object.freeze({
      label: '720p · 24fps',
      width: 1280,
      height: 720,
      frameRate: 24,
      bitrate: 3000000,
    }),
    Object.freeze({
      label: '480p · 24fps',
      width: 854,
      height: 480,
      frameRate: 24,
      bitrate: 1800000,
    }),
  ]),
  detail: Object.freeze([
    Object.freeze({
      label: '1080p · 30fps',
      width: 1920,
      height: 1080,
      frameRate: 30,
      bitrate: 6000000,
    }),
    Object.freeze({
      label: '1080p · 20fps',
      width: 1920,
      height: 1080,
      frameRate: 20,
      bitrate: 4000000,
    }),
    Object.freeze({
      label: '720p · 20fps',
      width: 1280,
      height: 720,
      frameRate: 20,
      bitrate: 2500000,
    }),
    Object.freeze({
      label: '480p · 15fps',
      width: 854,
      height: 480,
      frameRate: 15,
      bitrate: 1400000,
    }),
  ]),
});

export const getTrackQualityConstraints = (preset, contentType) => {
  if (!preset) return null;

  const frameRate = {
    ideal: preset.frameRate,
    max: preset.frameRate,
  };

  // A movie's natural dimensions can include a non-16:9 display aspect ratio.
  // Keep that geometry intact and let RTCRtpSender scale it uniformly instead.
  if (preset.lossless || contentType === 'movie') return { frameRate };

  return {
    width: { ideal: preset.width, max: preset.width },
    height: { ideal: preset.height, max: preset.height },
    frameRate,
  };
};

export const AUTO_QUALITY_START_INDEX = 1;

export const getAutoQualityPreset = (contentType, index) => {
  const profiles =
    AUTO_QUALITY_PROFILES[contentType] || AUTO_QUALITY_PROFILES.motion;
  return profiles[Math.min(Math.max(index, 0), profiles.length - 1)];
};

export const createAutoQualityState = (index = AUTO_QUALITY_START_INDEX) => ({
  index,
  pressureSamples: 0,
  healthySamples: 0,
  lastChangedAt: 0,
});

export const advanceAutoQuality = (
  state,
  sample,
  now = Date.now(),
  profileCount = 4,
) => {
  const reason = sample?.qualityLimitationReason || 'none';
  const isLimited = reason !== 'none';
  const bitrateIsConstrained =
    reason === 'bandwidth' &&
    sample.sendBitrateKbps > 0 &&
    sample.targetBitrateKbps > 0 &&
    sample.sendBitrateKbps < sample.targetBitrateKbps * 0.7;
  const cooldownPassed =
    state.lastChangedAt === 0 || now - state.lastChangedAt >= 10000;

  if (isLimited) {
    const pressureSamples =
      state.pressureSamples + (bitrateIsConstrained ? 2 : 1);
    if (
      pressureSamples >= 3 &&
      state.index < profileCount - 1 &&
      cooldownPassed
    ) {
      return {
        index: state.index + 1,
        pressureSamples: 0,
        healthySamples: 0,
        lastChangedAt: now,
      };
    }

    return { ...state, pressureSamples, healthySamples: 0 };
  }

  const healthySamples = state.healthySamples + 1;
  if (healthySamples >= 8 && state.index > 0 && cooldownPassed) {
    return {
      index: state.index - 1,
      pressureSamples: 0,
      healthySamples: 0,
      lastChangedAt: now,
    };
  }

  return { ...state, pressureSamples: 0, healthySamples };
};

const chooseLargerOutboundVideo = (current, candidate) => {
  if (!current) return candidate;
  const currentPixels = (current.width || 0) * (current.height || 0);
  const candidatePixels = (candidate.width || 0) * (candidate.height || 0);
  return candidatePixels >= currentPixels ? candidate : current;
};

export const summarizeScreenSenderStats = (
  report,
  previousSamples = new Map(),
) => {
  const nextSamples = new Map();
  let outboundVideo = null;

  report.forEach((stat) => {
    if (
      stat.type !== 'outbound-rtp' ||
      stat.isRemote ||
      stat.active === false ||
      (stat.kind !== 'video' && stat.mediaType !== 'video')
    )
      return;

    const previous = previousSamples.get(stat.id);
    const elapsedSeconds = previous
      ? (stat.timestamp - previous.timestamp) / 1000
      : 0;
    const sendBitrateKbps =
      elapsedSeconds > 0 && stat.bytesSent != null && previous.bytesSent != null
        ? Math.max(
            0,
            Math.round(
              ((stat.bytesSent - previous.bytesSent) * 8) /
                elapsedSeconds /
                1000,
            ),
          )
        : 0;

    nextSamples.set(stat.id, {
      timestamp: stat.timestamp,
      bytesSent: stat.bytesSent,
    });

    outboundVideo = chooseLargerOutboundVideo(outboundVideo, {
      width: stat.frameWidth || null,
      height: stat.frameHeight || null,
      framesPerSecond: stat.framesPerSecond || null,
      sendBitrateKbps,
      targetBitrateKbps: stat.targetBitrate
        ? Math.round(stat.targetBitrate / 1000)
        : null,
      qualityLimitationReason: stat.qualityLimitationReason || 'none',
    });
  });

  return { samples: nextSamples, stats: outboundVideo };
};
