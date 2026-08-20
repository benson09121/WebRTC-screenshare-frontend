import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Eye,
  EyeOff,
  FlipHorizontal,
  Maximize,
  Minimize,
  MonitorPlay,
  MonitorUp,
  User,
  Video,
} from 'lucide-react';
import { useWebRTC } from '../context/useWebRTC';
import { getNextSelectedView } from '../lib/viewSelection';
import { Button } from './ui/button';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

const PRESENCE_COPY = {
  waiting: {
    title: 'Waiting for the other participant',
    description: 'Keep this room open while they join with your link.',
  },
  joining: {
    title: 'Establishing the private connection',
    description: 'Media will appear as soon as peer negotiation completes.',
  },
  reconnecting: {
    title: 'Reconnecting the call',
    description: 'The room is still open while the peer connection recovers.',
  },
  left: {
    title: 'Participant left the room',
    description: 'They can rejoin with the same room link. Your room remains open.',
  },
};

const ParticipantPlaceholder = ({ connected, peerPresence }) => {
  const copy = connected
    ? {
        title: 'Participant camera is off',
        description: 'A camera feed or screen share will appear here when it becomes available.',
      }
    : PRESENCE_COPY[peerPresence] || PRESENCE_COPY.waiting;

  return (
  <section className="flex h-full w-full items-center justify-center bg-[#090d0f]" aria-live="polite">
    <div className="flex max-w-sm flex-col items-center px-6 text-center">
      <div className="mb-5 grid size-24 place-items-center rounded-[2rem] border border-white/[0.08] bg-white/[0.035] shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
        <User className="size-11 text-zinc-600" strokeWidth={1.5} />
      </div>
      <p className="text-sm font-medium text-zinc-300">{copy.title}</p>
      <p className="mt-1.5 max-w-[30ch] text-xs leading-5 text-zinc-600">
        {copy.description}
      </p>
    </div>
  </section>
  );
};

export const VideoPlayer = ({ isIdle }) => {
  const {
    localStream,
    remoteStream,
    remoteScreenStream,
    localScreenStream,
    isScreenSharing,
    isCameraOff,
    connected,
    remoteMirrored,
    sendControlMessage,
    isChatOpen,
    isFullscreen,
    setIsFullscreen,
    remoteCameraOff,
    remoteScreenSharing,
    peerPresence,
  } = useWebRTC();

  const mainVideoRef = useRef(null);
  const remoteCameraVideoRef = useRef(null);
  const localVideoRef = useRef(null);
  const containerRef = useRef(null);
  const previousSharesRef = useRef({ local: false, remote: false });

  const [selectedView, setSelectedView] = useState('remote-camera');
  const [hideMainVideo, setHideMainVideo] = useState(false);
  const [hideLocal, setHideLocal] = useState(false);
  const [isMirrored, setIsMirrored] = useState(true);

  const hasRemoteScreen = remoteScreenSharing && Boolean(
    remoteScreenStream?.getVideoTracks().some(track => track.readyState === 'live'),
  );
  const hasLocalScreen = isScreenSharing && Boolean(
    localScreenStream?.getVideoTracks().some(track => track.readyState === 'live'),
  );
  const isScreenView = selectedView !== 'remote-camera';

  const mainStream = selectedView === 'remote-screen'
    ? remoteScreenStream
    : selectedView === 'local-screen'
      ? localScreenStream
      : remoteStream;

  const mainLabel = selectedView === 'remote-screen'
    ? 'Their screen'
    : selectedView === 'local-screen'
      ? 'Your screen'
      : 'Participant';

  useEffect(() => {
    const previous = previousSharesRef.current;
    const nextView = getNextSelectedView({
      selectedView,
      hasRemoteScreen,
      hasLocalScreen,
      previousShares: previous,
    });

    previousSharesRef.current = { local: hasLocalScreen, remote: hasRemoteScreen };
    if (nextView !== selectedView) setSelectedView(nextView);
  }, [hasLocalScreen, hasRemoteScreen, selectedView]);

  useEffect(() => {
    setHideMainVideo(false);
  }, [selectedView]);

  useEffect(() => {
    const video = localVideoRef.current;
    if (video && video.srcObject !== localStream) video.srcObject = localStream || null;
  }, [localStream, isCameraOff, hideLocal]);

  useEffect(() => {
    const video = mainVideoRef.current;
    if (video && video.srcObject !== mainStream) video.srcObject = mainStream || null;
  }, [mainStream, selectedView, remoteCameraOff]);

  useEffect(() => {
    const video = remoteCameraVideoRef.current;
    if (video && video.srcObject !== remoteStream) video.srcObject = remoteStream || null;
  }, [remoteStream, remoteCameraOff, selectedView]);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [setIsFullscreen]);

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else if (document.exitFullscreen) {
      await document.exitFullscreen();
    }
  };

  const showParticipantPlaceholder = selectedView === 'remote-camera' && (remoteCameraOff || !remoteStream);
  const showStreamLoading = isScreenView && !mainStream;
  const controlsHidden = isIdle && isFullscreen;

  return (
    <TooltipProvider delayDuration={250}>
      <main
        ref={containerRef}
        className={`call-stage group relative flex h-full w-full items-center justify-center overflow-hidden bg-[#090d0f] ${isFullscreen && isChatOpen ? 'call-stage--chat-docked' : ''}`}
      >
        {(hasRemoteScreen || hasLocalScreen) ? (
          <div className={`absolute left-1/2 top-6 z-30 -translate-x-1/2 transition-opacity duration-300 ${controlsHidden ? 'pointer-events-none opacity-0' : 'opacity-100'}`}>
            <div className="mb-2 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
              Viewing
            </div>
            <Tabs value={selectedView} onValueChange={setSelectedView}>
              <TabsList aria-label="Choose the main call view">
                <TabsTrigger value="remote-camera">
                  <Video className="size-3.5" />
                  Participant
                </TabsTrigger>
                {hasRemoteScreen ? (
                  <TabsTrigger value="remote-screen">
                    <MonitorPlay className="size-3.5" />
                    Their screen
                  </TabsTrigger>
                ) : null}
                {hasLocalScreen ? (
                  <TabsTrigger value="local-screen">
                    <MonitorUp className="size-3.5" />
                    Your screen
                  </TabsTrigger>
                ) : null}
              </TabsList>
            </Tabs>
          </div>
        ) : null}

        {showParticipantPlaceholder ? (
          <ParticipantPlaceholder connected={connected} peerPresence={peerPresence} />
        ) : showStreamLoading ? (
          <section className="flex h-full w-full items-center justify-center bg-[#090d0f]" aria-live="polite">
            <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm text-zinc-400">
              <span className="size-2 animate-pulse rounded-full bg-teal-300" />
              Connecting to {mainLabel.toLowerCase()}…
            </div>
          </section>
        ) : mainStream ? (
          <video
            ref={mainVideoRef}
            autoPlay
            playsInline
            muted={selectedView === 'local-screen'}
            onDoubleClick={toggleFullscreen}
            aria-label={`${mainLabel} video`}
            className={`h-full w-full cursor-pointer object-contain transition-opacity duration-300 ${hideMainVideo ? 'opacity-0' : 'opacity-100'} ${selectedView === 'remote-camera' && remoteMirrored ? 'scale-x-[-1]' : ''}`}
          />
        ) : (
          <ParticipantPlaceholder connected={connected} peerPresence={peerPresence} />
        )}

        {!showParticipantPlaceholder && mainStream ? (
          <div className={`absolute right-5 top-5 z-20 flex gap-2 transition-opacity duration-300 ${controlsHidden ? 'pointer-events-none opacity-0' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'}`}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => setHideMainVideo(value => !value)}
                  aria-label={hideMainVideo ? `Show ${mainLabel}` : `Hide ${mainLabel}`}
                >
                  {hideMainVideo ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{hideMainVideo ? `Show ${mainLabel}` : `Hide ${mainLabel}`}</TooltipContent>
            </Tooltip>

            {isScreenView ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={toggleFullscreen}
                    aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                  >
                    {isFullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        ) : null}

        {isScreenView && remoteStream && !remoteCameraOff ? (
          <motion.button
            type="button"
            drag
            dragConstraints={containerRef}
            dragElastic={0.1}
            dragMomentum={false}
            onClick={() => setSelectedView('remote-camera')}
            className={`group/pip absolute left-4 top-24 z-30 aspect-video w-48 cursor-pointer overflow-hidden rounded-xl border border-white/10 bg-[#111719] shadow-2xl outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-teal-300 sm:left-7 sm:w-64 ${controlsHidden ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
            aria-label="Show participant camera in the main view"
          >
            <video
              ref={remoteCameraVideoRef}
              autoPlay
              playsInline
              className={`h-full w-full object-cover ${remoteMirrored ? 'scale-x-[-1]' : ''}`}
            />
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-7 text-left text-xs font-medium text-white">
              Participant · click to focus
            </span>
          </motion.button>
        ) : null}

        {!hideLocal && localStream && !isCameraOff ? (
          <motion.div
            drag
            dragConstraints={containerRef}
            dragElastic={0.1}
            dragMomentum={false}
            className={`group/local absolute right-4 top-24 z-30 aspect-video w-48 overflow-hidden rounded-xl border border-white/10 bg-[#111719] shadow-2xl transition-opacity sm:right-7 sm:w-64 ${controlsHidden ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
          >
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`h-full w-full object-cover ${isMirrored ? 'scale-x-[-1]' : ''}`}
              aria-label="Your camera preview"
            />
            <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover/local:opacity-100 group-focus-within/local:opacity-100">
              <Button
                variant="secondary"
                size="icon"
                className="size-9"
                onClick={() => {
                  const nextMirrored = !isMirrored;
                  setIsMirrored(nextMirrored);
                  sendControlMessage({ type: 'mirror-toggle', isMirrored: nextMirrored });
                }}
                aria-label="Mirror your camera"
              >
                <FlipHorizontal className="size-4" />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                className="size-9"
                onClick={() => setHideLocal(true)}
                aria-label="Hide your camera preview"
              >
                <EyeOff className="size-4" />
              </Button>
            </div>
            <span className="absolute bottom-2 left-3 text-xs font-medium text-white drop-shadow">You</span>
          </motion.div>
        ) : null}

        {hideLocal && localStream && !isCameraOff ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="absolute right-5 top-24 z-20"
                onClick={() => setHideLocal(false)}
                aria-label="Show your camera preview"
              >
                <Eye className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Show your camera preview</TooltipContent>
          </Tooltip>
        ) : null}
      </main>
    </TooltipProvider>
  );
};
