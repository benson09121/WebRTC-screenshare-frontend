import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Eye,
  EyeOff,
  FlipHorizontal,
  Focus,
  Maximize,
  Minimize,
  MonitorPlay,
  MonitorUp,
  PictureInPicture2,
  User,
  Video,
  X,
} from 'lucide-react';
import { useWebRTC } from '../context/useWebRTC';
import { getNextSelectedView } from '../lib/viewSelection';
import { getNextScreenViewMode, getScreenVideoLayout } from '../lib/screenViewMode';
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
    isPresentationMode,
    setIsPresentationMode,
    remoteCameraOff,
    remoteScreenSharing,
    peerPresence,
  } = useWebRTC();

  const mainVideoRef = useRef(null);
  const remoteCameraVideoRef = useRef(null);
  const localVideoRef = useRef(null);
  const containerRef = useRef(null);
  const previousSharesRef = useRef({ local: false, remote: false });
  const pictureInPictureErrorTimerRef = useRef(null);

  const [selectedView, setSelectedView] = useState('remote-camera');
  const [hideMainVideo, setHideMainVideo] = useState(false);
  const [hideLocal, setHideLocal] = useState(false);
  const [isMirrored, setIsMirrored] = useState(true);
  const [pictureInPictureView, setPictureInPictureView] = useState(null);
  const [pictureInPictureError, setPictureInPictureError] = useState(null);
  const [screenViewMode, setScreenViewMode] = useState('fit');
  const [mainVideoSize, setMainVideoSize] = useState({ width: 0, height: 0 });
  const [stageAnnouncement, setStageAnnouncement] = useState('');

  const hasRemoteScreen = remoteScreenSharing && Boolean(
    remoteScreenStream?.getVideoTracks().some(track => track.readyState === 'live'),
  );
  const hasLocalScreen = isScreenSharing && Boolean(
    localScreenStream?.getVideoTracks().some(track => track.readyState === 'live'),
  );
  const isScreenView = selectedView !== 'remote-camera';
  const canUsePictureInPicture = Boolean(
    document.pictureInPictureEnabled
    && HTMLVideoElement.prototype.requestPictureInPicture,
  );

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

  const dismissPictureInPictureError = () => {
    window.clearTimeout(pictureInPictureErrorTimerRef.current);
    pictureInPictureErrorTimerRef.current = null;
    setPictureInPictureError(null);
  };

  const showPictureInPictureError = (message) => {
    window.clearTimeout(pictureInPictureErrorTimerRef.current);
    setPictureInPictureError(message);
    pictureInPictureErrorTimerRef.current = window.setTimeout(() => {
      setPictureInPictureError(null);
      pictureInPictureErrorTimerRef.current = null;
    }, 7000);
  };

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
    setScreenViewMode('fit');
    setMainVideoSize({ width: 0, height: 0 });
  }, [selectedView]);

  useEffect(() => {
    if (isScreenView || !isPresentationMode) return;
    setIsPresentationMode(false);
    setStageAnnouncement('Presentation mode ended because no screen is selected.');
  }, [isPresentationMode, isScreenView, setIsPresentationMode]);

  useEffect(() => {
    if (!isPresentationMode || isChatOpen) return undefined;
    const handlePresentationKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      setIsPresentationMode(false);
      setStageAnnouncement('Presentation mode off.');
    };
    window.addEventListener('keydown', handlePresentationKeyDown);
    return () => window.removeEventListener('keydown', handlePresentationKeyDown);
  }, [isChatOpen, isPresentationMode, setIsPresentationMode]);

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

  useEffect(() => {
    const videos = [
      [mainVideoRef.current, 'main'],
      [remoteCameraVideoRef.current, 'remote-camera'],
      [localVideoRef.current, 'local-camera'],
    ].filter(([video]) => video);
    const cleanups = videos.map(([video, view]) => {
      const handleEnter = () => {
        setPictureInPictureView(view);
        dismissPictureInPictureError();
      };
      const handleLeave = () => setPictureInPictureView(null);
      video.addEventListener('enterpictureinpicture', handleEnter);
      video.addEventListener('leavepictureinpicture', handleLeave);
      return () => {
        video.removeEventListener('enterpictureinpicture', handleEnter);
        video.removeEventListener('leavepictureinpicture', handleLeave);
      };
    });

    return () => cleanups.forEach(cleanup => cleanup());
  }, [mainStream, remoteStream, localStream, selectedView, hideLocal, isScreenView]);

  useEffect(() => () => {
    window.clearTimeout(pictureInPictureErrorTimerRef.current);
    pictureInPictureErrorTimerRef.current = null;
  }, []);

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else if (document.exitFullscreen) {
      await document.exitFullscreen();
    }
  };

  const togglePictureInPicture = async (video, view) => {
    if (!video || !canUsePictureInPicture) return;

    try {
      dismissPictureInPictureError();
      if (document.pictureInPictureElement === video) {
        await document.exitPictureInPicture();
        return;
      }
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      if (video.readyState === HTMLMediaElement.HAVE_NOTHING) {
        throw new Error('The video is still loading. Try again in a moment.');
      }
      await video.requestPictureInPicture();
      setPictureInPictureView(view);
    } catch (error) {
      console.error('Picture-in-Picture failed', error);
      showPictureInPictureError(error.message || 'Picture-in-Picture is unavailable in this browser.');
    }
  };

  const togglePresentationMode = () => {
    const nextValue = !isPresentationMode;
    setIsPresentationMode(nextValue);
    setStageAnnouncement(nextValue
      ? 'Presentation mode on. Camera previews and secondary controls are hidden.'
      : 'Presentation mode off.');
  };

  const handleScreenViewModeChange = (nextMode) => {
    const normalizedMode = getNextScreenViewMode(nextMode, isScreenView);
    setScreenViewMode(normalizedMode);
    const label = normalizedMode === 'pixel' ? '100% pixel view' : normalizedMode;
    setStageAnnouncement(`Screen view: ${label}.`);
  };

  const syncMainVideoSize = (event) => {
    const video = event.currentTarget;
    const nextSize = { width: video.videoWidth || 0, height: video.videoHeight || 0 };
    setMainVideoSize(current => (
      current.width === nextSize.width && current.height === nextSize.height ? current : nextSize
    ));
  };

  const showParticipantPlaceholder = selectedView === 'remote-camera' && (remoteCameraOff || !remoteStream);
  const showStreamLoading = isScreenView && !mainStream;
  const controlsHidden = isIdle && (isFullscreen || isPresentationMode);
  const screenVideoLayout = getScreenVideoLayout(screenViewMode);
  const usesPixelView = isScreenView && screenViewMode === 'pixel';
  const pixelSurfaceStyle = usesPixelView && mainVideoSize.width && mainVideoSize.height
    ? {
        width: `max(100%, ${mainVideoSize.width}px)`,
        height: `max(100%, ${mainVideoSize.height}px)`,
      }
    : undefined;
  const pixelVideoStyle = usesPixelView && mainVideoSize.width && mainVideoSize.height
    ? { width: `${mainVideoSize.width}px`, height: `${mainVideoSize.height}px` }
    : undefined;

  return (
    <TooltipProvider delayDuration={250}>
      <main
        ref={containerRef}
        className={`call-stage group relative flex h-full w-full items-center justify-center overflow-hidden bg-[#090d0f] ${(isFullscreen || isPresentationMode) && isChatOpen ? 'call-stage--chat-docked' : ''}`}
      >
        {pictureInPictureError ? (
          <div role="alert" className="absolute left-1/2 top-20 z-40 flex w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 items-start gap-3 rounded-xl border border-amber-300/20 bg-amber-950/95 py-2 pl-4 pr-2 text-sm text-amber-100 shadow-xl">
            <p className="min-w-0 flex-1 py-1.5">{pictureInPictureError}</p>
            <Button variant="ghost" size="icon" onClick={dismissPictureInPictureError} aria-label="Dismiss Picture-in-Picture error" className="text-amber-100 hover:bg-white/10">
              <X className="size-4" />
            </Button>
          </div>
        ) : null}
        {(hasRemoteScreen || hasLocalScreen) && !isPresentationMode ? (
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
          <div className={`h-full w-full ${isScreenView ? screenVideoLayout.viewportClassName : 'overflow-hidden'}`}>
            <div
              className={isScreenView ? screenVideoLayout.surfaceClassName : 'h-full w-full'}
              style={pixelSurfaceStyle}
            >
              <video
                ref={mainVideoRef}
                autoPlay
                playsInline
                muted={selectedView === 'local-screen'}
                onLoadedMetadata={syncMainVideoSize}
                onResize={syncMainVideoSize}
                onDoubleClick={toggleFullscreen}
                aria-label={`${mainLabel} video`}
                className={`cursor-pointer transition-opacity duration-300 motion-reduce:transition-none ${isScreenView ? screenVideoLayout.videoClassName : 'h-full w-full object-contain'} ${hideMainVideo ? 'opacity-0' : 'opacity-100'} ${selectedView === 'remote-camera' && remoteMirrored ? 'scale-x-[-1]' : ''}`}
                style={pixelVideoStyle}
              />
            </div>
          </div>
        ) : (
          <ParticipantPlaceholder connected={connected} peerPresence={peerPresence} />
        )}

        {!showParticipantPlaceholder && mainStream && isPresentationMode ? (
          <div className={`absolute right-3 top-3 z-40 transition-opacity duration-300 motion-reduce:transition-none sm:right-5 sm:top-5 ${controlsHidden ? 'opacity-35' : 'opacity-100'}`}>
            <Button
              variant="active"
              className="h-11 px-3"
              onClick={togglePresentationMode}
              aria-label="Exit presentation mode"
              aria-pressed="true"
            >
              <Focus className="size-4" />
              Exit focus
            </Button>
          </div>
        ) : !showParticipantPlaceholder && mainStream ? (
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

            {canUsePictureInPicture ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={pictureInPictureView === 'main' ? 'active' : 'secondary'}
                    size="icon"
                    onClick={() => togglePictureInPicture(mainVideoRef.current, 'main')}
                    aria-label={pictureInPictureView === 'main' ? `Return ${mainLabel} to the browser` : `Float ${mainLabel} on the desktop`}
                  >
                    <PictureInPicture2 className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{pictureInPictureView === 'main' ? 'Close floating video' : `Float ${mainLabel} on desktop`}</TooltipContent>
              </Tooltip>
            ) : null}

            {isScreenView ? (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={togglePresentationMode}
                      aria-label="Enter presentation mode"
                      aria-pressed="false"
                    >
                      <Focus className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Focus on shared content</TooltipContent>
                </Tooltip>
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
              </>
            ) : null}
          </div>
        ) : null}

        {isScreenView && mainStream ? (
          <div className={`absolute z-30 transition-[opacity,transform] duration-300 motion-reduce:transition-none ${isPresentationMode ? 'bottom-3 left-3 sm:bottom-5 sm:left-5' : 'bottom-20 left-3 sm:bottom-6 sm:left-6'} ${controlsHidden ? 'pointer-events-none translate-y-2 opacity-0' : 'translate-y-0 opacity-100'}`}>
            <Tabs value={screenViewMode} onValueChange={handleScreenViewModeChange}>
              <TabsList className="min-h-0 gap-0.5 p-0" aria-label="Shared screen sizing">
                <TabsTrigger value="fit" className="h-11 px-2.5" title="Show the entire shared screen">
                  Fit
                </TabsTrigger>
                <TabsTrigger value="fill" className="h-11 px-2.5" title="Fill the stage and crop the edges">
                  Fill
                </TabsTrigger>
                <TabsTrigger
                  value="pixel"
                  className="h-11 px-2.5"
                  title="Show one shared-screen pixel per CSS pixel and scroll to pan"
                  aria-label="Show shared screen at 100 percent with scrolling"
                >
                  100%
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        ) : null}

        {isScreenView && !isPresentationMode && remoteStream && !remoteCameraOff ? (
          <motion.div
            drag
            dragConstraints={containerRef}
            dragElastic={0.1}
            dragMomentum={false}
            className={`group/pip absolute left-4 top-24 z-30 aspect-video w-48 overflow-hidden rounded-xl border border-white/10 bg-[#111719] shadow-2xl transition-opacity sm:left-7 sm:w-64 ${controlsHidden ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
          >
            <video
              ref={remoteCameraVideoRef}
              autoPlay
              playsInline
              className={`h-full w-full object-cover ${remoteMirrored ? 'scale-x-[-1]' : ''}`}
            />
            <button
              type="button"
              onClick={() => setSelectedView('remote-camera')}
              className="absolute inset-0 z-10 cursor-pointer rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-300"
              aria-label="Show participant camera in the main view"
            >
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2 pt-7 text-left text-xs font-medium text-white">
                Participant · click to focus
              </span>
            </button>
            {canUsePictureInPicture ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={pictureInPictureView === 'remote-camera' ? 'active' : 'secondary'}
                    size="icon"
                    className="absolute right-2 top-2 z-20 size-9 opacity-0 group-hover/pip:opacity-100 group-focus-within/pip:opacity-100"
                    onClick={() => togglePictureInPicture(remoteCameraVideoRef.current, 'remote-camera')}
                    aria-label={pictureInPictureView === 'remote-camera' ? 'Return participant camera to the browser' : 'Float participant camera on the desktop'}
                  >
                    <PictureInPicture2 className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{pictureInPictureView === 'remote-camera' ? 'Close floating camera' : 'Float participant on desktop'}</TooltipContent>
              </Tooltip>
            ) : null}
          </motion.div>
        ) : null}

        {!isPresentationMode && !hideLocal && localStream && !isCameraOff ? (
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
              {canUsePictureInPicture ? (
                <Button
                  variant={pictureInPictureView === 'local-camera' ? 'active' : 'secondary'}
                  size="icon"
                  className="size-9"
                  onClick={() => togglePictureInPicture(localVideoRef.current, 'local-camera')}
                  aria-label={pictureInPictureView === 'local-camera' ? 'Return your camera to the browser' : 'Float your camera on the desktop'}
                >
                  <PictureInPicture2 className="size-4" />
                </Button>
              ) : null}
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

        {!isPresentationMode && hideLocal && localStream && !isCameraOff ? (
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
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {stageAnnouncement}
        </p>
      </main>
    </TooltipProvider>
  );
};
