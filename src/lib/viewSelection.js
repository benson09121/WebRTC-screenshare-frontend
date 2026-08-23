export const getNextSelectedView = ({
  selectedView,
  hasRemoteScreen,
  hasLocalScreen,
  previousShares,
}) => {
  if (!hasRemoteScreen && !hasLocalScreen) return 'remote-camera';
  if (selectedView === 'remote-screen' && !hasRemoteScreen) {
    return hasLocalScreen ? 'local-screen' : 'remote-camera';
  }
  if (selectedView === 'local-screen' && !hasLocalScreen) {
    return hasRemoteScreen ? 'remote-screen' : 'remote-camera';
  }
  if (hasLocalScreen && !previousShares.local) return 'local-screen';
  if (
    hasRemoteScreen &&
    !previousShares.remote &&
    selectedView === 'remote-camera'
  ) {
    return 'remote-screen';
  }
  return selectedView;
};
