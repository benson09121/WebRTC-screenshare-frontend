const createAction = (kind, title, description) => ({
  kind,
  title,
  description,
});

export const getConnectionHealthPresentation = ({
  connected,
  stats,
  wsStatus,
  peerPresence,
}) => {
  const quality = connected ? stats.quality : 'unknown';
  const statusLabel = connected
    ? quality === 'good'
      ? 'Connection good'
      : quality === 'fair'
        ? 'Connection limited'
        : quality === 'poor'
          ? 'Connection poor'
          : 'Measuring connection'
    : wsStatus === 'reconnecting'
      ? 'Signaling reconnecting'
      : peerPresence === 'left'
        ? 'Participant left'
        : peerPresence === 'joining' || peerPresence === 'reconnecting'
          ? 'Call reconnecting'
          : 'Waiting for participant';

  let action = null;
  if (!connected) {
    action = null;
  } else if (stats.qualityLimitationReason === 'cpu') {
    action = createAction(
      'cpu',
      'Device adapting video',
      'The browser is reducing video resolution or frame rate because this device is under load.',
    );
  } else if (stats.qualityLimitationReason === 'bandwidth') {
    action = createAction(
      'bandwidth',
      'Video adapting to upload',
      stats.quality === 'good'
        ? 'The browser is fitting video to its estimated upload capacity. The call transport is otherwise healthy.'
        : 'The browser is fitting video to its estimated upload capacity. Lower the shared-content quality if this persists.',
    );
  } else if (stats.qualityLimitationReason === 'other') {
    action = createAction(
      'other',
      'Browser adapting video',
      'The browser reduced resolution or frame rate for a non-network, non-CPU reason.',
    );
  } else if (stats.quality === 'poor') {
    action = createAction(
      'poor',
      'Unstable connection',
      'Packet loss or latency is affecting this call.',
    );
  } else if (stats.quality === 'fair') {
    action = createAction(
      'fair',
      'Connection adapting',
      'Moderate packet loss or latency may reduce call quality.',
    );
  }

  return { quality, statusLabel, action };
};
