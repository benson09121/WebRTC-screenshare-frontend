import React, { useState, useEffect } from 'react';
import { WebRTCProvider } from './context/WebRTCContext';
import { VideoPlayer } from './components/VideoPlayer';
import { ControlPanel } from './components/ControlPanel';
import { Chat } from './components/Chat';
import { LandingPage } from './components/LandingPage';
import { useWebRTC } from './context/useWebRTC';
import { Check, Copy, Users } from 'lucide-react';
import { Button } from './components/ui/button';
import { ConnectionHealth } from './components/ConnectionHealth';

const ExternalWatchParty = React.lazy(() => import('./components/ExternalWatchParty'));

const MainApp = () => {
  const {
    roomId,
    isPresentationMode,
    externalWatchInvite,
    outgoingExternalWatchProposal,
    externalWatchSession,
    externalWatchProposalStatus,
  } = useWebRTC();
  const [isIdle, setIsIdle] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isConnectionDetailsOpen, setIsConnectionDetailsOpen] = useState(false);
  const [isFullscreenDashboardOpen, setIsFullscreenDashboardOpen] = useState(false);
  
  useEffect(() => {
    let timeout;
    const resetIdle = () => {
      setIsIdle(false);
      clearTimeout(timeout);
      timeout = setTimeout(() => setIsIdle(true), 3000);
    };

    window.addEventListener('pointermove', resetIdle, { passive: true });
    window.addEventListener('pointerdown', resetIdle, { passive: true });
    window.addEventListener('keydown', resetIdle);
    window.addEventListener('pairbeam-user-activity', resetIdle);
    resetIdle();

    return () => {
      window.removeEventListener('pointermove', resetIdle);
      window.removeEventListener('pointerdown', resetIdle);
      window.removeEventListener('keydown', resetIdle);
      window.removeEventListener('pairbeam-user-activity', resetIdle);
      clearTimeout(timeout);
    };
  }, []);

  const actualIsIdle = isIdle && !isConnectionDetailsOpen;
  const roomHeaderHidden = actualIsIdle || isPresentationMode;

  const copyRoomLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  if (!roomId) {
    return (
      <div className="absolute inset-0 flex h-full w-full flex-col overflow-hidden bg-canvas font-sans">
        <LandingPage />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex h-full w-full flex-col overflow-hidden bg-black font-sans animate-[fadeIn_0.5s_ease-out]">
      {/* Top Bar for Room Info */}
      <header
        className={`pointer-events-none absolute left-4 top-4 z-30 transition-all duration-300 motion-reduce:transition-none sm:left-6 sm:top-6 ${roomHeaderHidden ? '-translate-y-3 opacity-0' : 'translate-y-0 opacity-100'}`}
        aria-hidden={isPresentationMode}
        inert={isPresentationMode}
      >
        <div className="pointer-events-auto flex w-fit items-center gap-2 rounded-xl border border-border bg-panel/90 p-1.5 pl-3 shadow-[0_12px_35px_rgba(0,0,0,0.3)] backdrop-blur-xl">
          <Users className="size-4 text-teal-300" />
          <span className="font-mono text-xs font-semibold tracking-[0.14em] text-zinc-200">
            {roomId}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={copyRoomLink}
            className="ml-1"
            aria-label="Copy room link"
          >
            {copied ? <Check className="size-3.5 text-teal-300" /> : <Copy className="size-3.5" />}
            <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy link'}</span>
          </Button>
        </div>
        <div className="mt-2">
          <ConnectionHealth
            isIdle={actualIsIdle}
            open={isConnectionDetailsOpen}
            onOpenChange={setIsConnectionDetailsOpen}
          />
        </div>
      </header>

      <VideoPlayer isIdle={actualIsIdle} />
      {(externalWatchInvite
        || outgoingExternalWatchProposal
        || externalWatchSession
        || ['declined', 'cancelled'].includes(externalWatchProposalStatus)) ? (
          <React.Suspense fallback={null}>
            <ExternalWatchParty isIdle={actualIsIdle} />
          </React.Suspense>
        ) : null}
      <ControlPanel
        isIdle={actualIsIdle}
        fullscreenDashboardOpen={isFullscreenDashboardOpen}
        setFullscreenDashboardOpen={setIsFullscreenDashboardOpen}
      />
      <Chat isIdle={actualIsIdle} />
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
