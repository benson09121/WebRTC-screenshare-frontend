export const DEFAULT_PLAYBACK_VOLUMES = Object.freeze({
  participant: 100,
  screen: 100,
  movie: 100,
});

export const normalizePlaybackVolume = value => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 100;
  return Math.min(100, Math.max(0, Math.round(numericValue)));
};

export const getRemoteContentVolume = (sourceKind, volumes) => (
  normalizePlaybackVolume(sourceKind === 'movie' ? volumes.movie : volumes.screen)
);
