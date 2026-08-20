export const EMPTY_CONNECTION_STATS = Object.freeze({
  status: 'idle',
  quality: 'unknown',
  qualityLimitationReason: 'none',
  roundTripTimeMs: null,
  packetLossPercent: null,
  droppedFrames: 0,
  sendBitrateKbps: 0,
  receiveBitrateKbps: 0,
  availableOutgoingBitrateKbps: null,
  outboundVideo: null,
  inboundVideo: null,
  connectionPath: 'unknown',
  protocol: null,
  measuredAt: null,
});

const QUALITY_REASON_PRIORITY = {
  none: 0,
  other: 1,
  cpu: 2,
  bandwidth: 3,
};

const rateFromCounter = (current, previous, counterName) => {
  if (!previous || current[counterName] == null || previous[counterName] == null) return 0;
  const elapsedSeconds = (current.timestamp - previous.timestamp) / 1000;
  if (elapsedSeconds <= 0) return 0;
  return Math.max(0, ((current[counterName] - previous[counterName]) * 8) / elapsedSeconds / 1000);
};

const chooseLargerVideo = (current, candidate) => {
  if (!current) return candidate;
  const currentPixels = (current.width || 0) * (current.height || 0);
  const candidatePixels = (candidate.width || 0) * (candidate.height || 0);
  return candidatePixels >= currentPixels ? candidate : current;
};

export const summarizeWebRTCStats = (report, previousSamples = new Map()) => {
  const nextSamples = new Map();
  const statsById = new Map();
  const selectedPairIds = new Set();

  let sendBitrateKbps = 0;
  let receiveBitrateKbps = 0;
  let packetsReceived = 0;
  let packetsLost = 0;
  let droppedFrames = 0;
  let qualityLimitationReason = 'none';
  let outboundVideo = null;
  let inboundVideo = null;
  let selectedPair = null;

  report.forEach(stat => {
    statsById.set(stat.id, stat);
    if (stat.type === 'transport' && stat.selectedCandidatePairId) {
      selectedPairIds.add(stat.selectedCandidatePairId);
    }
  });

  report.forEach(stat => {
    const previous = previousSamples.get(stat.id);
    nextSamples.set(stat.id, {
      timestamp: stat.timestamp,
      bytesSent: stat.bytesSent,
      bytesReceived: stat.bytesReceived,
      packetsReceived: stat.packetsReceived,
      packetsLost: stat.packetsLost,
      framesDropped: stat.framesDropped,
    });

    if (stat.type === 'outbound-rtp' && !stat.isRemote) {
      sendBitrateKbps += rateFromCounter(stat, previous, 'bytesSent');

      if (stat.kind === 'video' || stat.mediaType === 'video') {
        const candidate = {
          width: stat.frameWidth || null,
          height: stat.frameHeight || null,
          framesPerSecond: stat.framesPerSecond || null,
          targetBitrateKbps: stat.targetBitrate ? Math.round(stat.targetBitrate / 1000) : null,
        };
        outboundVideo = chooseLargerVideo(outboundVideo, candidate);

        const reason = stat.qualityLimitationReason || 'none';
        if (QUALITY_REASON_PRIORITY[reason] > QUALITY_REASON_PRIORITY[qualityLimitationReason]) {
          qualityLimitationReason = reason;
        }
      }
    }

    if (stat.type === 'inbound-rtp' && !stat.isRemote) {
      receiveBitrateKbps += rateFromCounter(stat, previous, 'bytesReceived');

      const receivedDelta = previous
        ? Math.max(0, (stat.packetsReceived || 0) - (previous.packetsReceived || 0))
        : 0;
      const lostDelta = previous
        ? Math.max(0, (stat.packetsLost || 0) - (previous.packetsLost || 0))
        : 0;
      packetsReceived += receivedDelta;
      packetsLost += lostDelta;

      if (stat.kind === 'video' || stat.mediaType === 'video') {
        droppedFrames += previous
          ? Math.max(0, (stat.framesDropped || 0) - (previous.framesDropped || 0))
          : 0;
        inboundVideo = chooseLargerVideo(inboundVideo, {
          width: stat.frameWidth || null,
          height: stat.frameHeight || null,
          framesPerSecond: stat.framesPerSecond || null,
        });
      }
    }

    if (
      stat.type === 'candidate-pair'
      && stat.state === 'succeeded'
      && (stat.nominated || selectedPairIds.has(stat.id))
    ) {
      selectedPair = stat;
    }
  });

  const packetTotal = packetsReceived + packetsLost;
  const packetLossPercent = packetTotal > 0 ? (packetsLost / packetTotal) * 100 : 0;
  const roundTripTimeMs = selectedPair?.currentRoundTripTime != null
    ? selectedPair.currentRoundTripTime * 1000
    : null;

  const localCandidate = selectedPair?.localCandidateId
    ? statsById.get(selectedPair.localCandidateId)
    : null;
  const remoteCandidate = selectedPair?.remoteCandidateId
    ? statsById.get(selectedPair.remoteCandidateId)
    : null;
  const usesRelay = localCandidate?.candidateType === 'relay' || remoteCandidate?.candidateType === 'relay';

  let quality = 'good';
  if (packetLossPercent >= 5 || (roundTripTimeMs != null && roundTripTimeMs >= 400)) {
    quality = 'poor';
  } else if (
    qualityLimitationReason !== 'none'
    || packetLossPercent >= 2
    || (roundTripTimeMs != null && roundTripTimeMs >= 200)
  ) {
    quality = 'fair';
  }

  return {
    samples: nextSamples,
    stats: {
      status: 'ready',
      quality,
      qualityLimitationReason,
      roundTripTimeMs: roundTripTimeMs == null ? null : Math.round(roundTripTimeMs),
      packetLossPercent: Math.round(packetLossPercent * 10) / 10,
      droppedFrames,
      sendBitrateKbps: Math.round(sendBitrateKbps),
      receiveBitrateKbps: Math.round(receiveBitrateKbps),
      availableOutgoingBitrateKbps: selectedPair?.availableOutgoingBitrate
        ? Math.round(selectedPair.availableOutgoingBitrate / 1000)
        : null,
      outboundVideo,
      inboundVideo,
      connectionPath: selectedPair ? (usesRelay ? 'relay' : 'direct') : 'unknown',
      protocol: localCandidate?.protocol || null,
      measuredAt: Date.now(),
    },
  };
};
