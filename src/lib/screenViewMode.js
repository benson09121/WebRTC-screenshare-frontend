export const SCREEN_VIEW_MODES = Object.freeze(['fit', 'fill', 'pixel']);

const SCREEN_VIEW_MODE_SET = new Set(SCREEN_VIEW_MODES);

const SCREEN_VIDEO_LAYOUTS = Object.freeze({
  fit: Object.freeze({
    viewportClassName: 'overflow-hidden',
    surfaceClassName: 'flex h-full w-full items-center justify-center',
    videoClassName: 'h-full w-full object-contain',
  }),
  fill: Object.freeze({
    viewportClassName: 'overflow-hidden',
    surfaceClassName: 'h-full w-full',
    videoClassName: 'h-full w-full object-cover',
  }),
  pixel: Object.freeze({
    viewportClassName: 'overflow-auto',
    surfaceClassName: 'flex min-h-full min-w-full items-center justify-center',
    videoClassName: 'max-h-none max-w-none shrink-0 object-contain',
  }),
});

export const normalizeScreenViewMode = (mode) =>
  SCREEN_VIEW_MODE_SET.has(mode) ? mode : 'fit';

export const getScreenVideoLayout = (mode) =>
  SCREEN_VIDEO_LAYOUTS[normalizeScreenViewMode(mode)];

export const getNextScreenViewMode = (mode, isScreenView) =>
  isScreenView ? normalizeScreenViewMode(mode) : 'fit';

export const getContainedMediaSize = (
  containerWidth,
  containerHeight,
  aspectRatio,
) => {
  if (
    !Number.isFinite(containerWidth) ||
    !Number.isFinite(containerHeight) ||
    !Number.isFinite(aspectRatio) ||
    containerWidth <= 0 ||
    containerHeight <= 0 ||
    aspectRatio <= 0
  )
    return null;

  const containerAspectRatio = containerWidth / containerHeight;
  if (containerAspectRatio > aspectRatio) {
    return { width: containerHeight * aspectRatio, height: containerHeight };
  }
  return { width: containerWidth, height: containerWidth / aspectRatio };
};
