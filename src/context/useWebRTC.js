import { createContext, useContext } from 'react';

export const WebRTCContext = createContext(null);

export const useWebRTC = () => {
  const context = useContext(WebRTCContext);
  if (!context) throw new Error('useWebRTC must be used inside WebRTCProvider');
  return context;
};
