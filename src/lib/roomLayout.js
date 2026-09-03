export const getRoomLayoutState = ({
  hasSharedContent = false,
  hasExternalWatchSession = false,
  isPresentationMode = false,
}) => {
  const sharedContentAvailable = hasSharedContent || hasExternalWatchSession;

  return {
    hasSharedContent: sharedContentAvailable,
    showParticipantDock: sharedContentAvailable && !isPresentationMode,
  };
};
