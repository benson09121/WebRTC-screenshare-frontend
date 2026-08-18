import React from 'react';
import { WebRTCProvider } from './context/WebRTCContext';
import { VideoPlayer } from './components/VideoPlayer';
import { ControlPanel } from './components/ControlPanel';
import { Chat } from './components/Chat';
import { LandingPage } from './components/LandingPage';
import { useWebRTC } from './context/WebRTCContext';
import { Activity, Users } from 'lucide-react';

const MainApp = () => {
  const { wsStatus, roomId } = useWebRTC();

  if (!roomId) {
    return (
      <div className="h-full w-full absolute inset-0 bg-black flex flex-col overflow-hidden font-sans">
        <LandingPage />
      </div>
    );
  }

  return (
    <div className="h-full w-full absolute inset-0 bg-black flex flex-col overflow-hidden font-sans animate-[fadeIn_0.5s_ease-out]">
      {/* Top Bar for Room Info */}
      <div className="absolute top-6 left-6 z-30 flex flex-col gap-2 pointer-events-none">
        <div className="flex items-center gap-2 bg-blue-600/90 backdrop-blur-sm px-4 py-2 rounded-full border border-blue-500/50 shadow-[0_4px_20px_rgba(37,99,235,0.4)] pointer-events-auto w-fit">
          <Users size={16} className="text-white" />
          <span className="text-sm font-bold tracking-widest text-white uppercase">
            Room: {roomId}
          </span>
          <button 
            onClick={() => navigator.clipboard.writeText(window.location.href)}
            className="ml-2 text-xs bg-blue-700 hover:bg-blue-800 transition-colors text-white px-3 py-1 rounded-full shadow-sm"
          >
            Copy Link
          </button>
        </div>
      </div>

      <VideoPlayer />
      <ControlPanel />
      <Chat />
    </div>
  );
};

function App() {
  return (
    <WebRTCProvider>
      <MainApp />
    </WebRTCProvider>
  );
}

export default App;
