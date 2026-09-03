import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Eye,
  EyeOff,
  Film,
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
import {
  getContainedMediaSize,
  getNextScreenViewMode,
  getScreenVideoLayout,
} from '../lib/screenViewMode';
import { getRemoteContentVolume } from '../lib/playbackVolume';
import { isExpectedPlaybackInterruption } from '../lib/movieShare';
import { Button } from './ui/button';
import { SharedMoviePlayer } from './SharedMoviePlayer';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';

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
  failed: {
    title: 'The call could not reconnect',
    description:
      'Reload the room and try again. If this repeats across networks, the deployment needs a TURN relay.',
  },
  left: {
    title: 'Participant left the room',
    description:
      'They can rejoin with the same room link. Your room remains open.',
  },
};

const ParticipantPlaceholder = ({ connected, peerPresence }) => {
  const copy = connected
    ? {
        title: 'Participant camera is off',
        description:
          'A camera feed or screen share will appear here when it becomes available.',
      }
    : PRESENCE_COPY[peerPresence] || PRESENCE_COPY.waiting;

  return (
    <section
      className="bg-bg flex h-full w-full items-center justify-center"
      aria-live="polite"
    >
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
    localShareSource,
    remoteShareSource,
    requestMovieControl,
    participantVolume,
    screenVolume,
    movieVolume,
    setMovieVolume,
    peerPresence,
    externalWatchSession,
  } = useWebRTC();

  const mainVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
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
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [stageAnnouncement, setStageAnnouncement] = useState('');
  const [directPlaybackBlocked, setDirectPlaybackBlocked] = useState(false);
  const [directPlaybackError, setDirectPlaybackError] = useState(null);

  const hasRemoteDirectMovie =
    remoteShareSource?.kind === 'movie' &&
    remoteShareSource.deliveryMode === 'direct' &&
    Boolean(remoteShareSource.url);
  const hasLocalDirectMovie =
    localShareSource?.kind === 'movie' &&
    localShareSource.deliveryMode === 'direct' &&
    Boolean(localShareSource.url);
  const hasRemoteScreen =
    remoteScreenSharing &&
    (hasRemoteDirectMovie ||
      Boolean(
        remoteScreenStream
          ?.getVideoTracks()
          .some((track) => track.readyState === 'live'),
      ));
  const hasLocalScreen =
    isScreenSharing &&
    (hasLocalDirectMovie ||
      Boolean(
        localScreenStream
          ?.getVideoTracks()
          .some((track) => track.readyState === 'live'),
      ));
  const isScreenView = selectedView !== 'remote-camera';
  const canUsePictureInPicture = Boolean(
    document.pictureInPictureEnabled &&
    HTMLVideoElement.prototype.requestPictureInPicture,
  );

  const mainStream =
    selectedView === 'remote-screen'
      ? remoteScreenStream
      : selectedView === 'local-screen'
        ? localScreenStream
        : remoteStream;

  const remoteContentLabel =
    remoteShareSource?.kind === 'movie' ? 'Their movie' : 'Their screen';
  const localContentLabel =
    localShareSource?.kind === 'movie' ? 'Your movie' : 'Your screen';
  const mainLabel =
    selectedView === 'remote-screen'
      ? remoteContentLabel
      : selectedView === 'local-screen'
        ? localContentLabel
        : 'Participant';
  const activeMovie =
    selectedView === 'remote-screen' && remoteShareSource?.kind === 'movie'
      ? { owner: 'remote', source: remoteShareSource }
      : selectedView === 'local-screen' && localShareSource?.kind === 'movie'
        ? { owner: 'local', source: localShareSource }
        : null;
  const directMovieUrl =
    activeMovie?.source.deliveryMode === 'direct'
      ? activeMovie.source.url
      : null;
  const directMovieTime = directMovieUrl
    ? activeMovie?.source.currentTime || 0
    : 0;
  const directMovieIsPlaying = Boolean(
    directMovieUrl && activeMovie?.source.isPlaying,
  );

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

    previousSharesRef.current = {
      local: hasLocalScreen,
      remote: hasRemoteScreen,
    };
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
    setStageAnnouncement(
      'Presentation mode ended because no screen is selected.',
    );
  }, [isPresentationMode, isScreenView, setIsPresentationMode]);

  useEffect(() => {
    if (!isPresentationMode || isChatOpen) return undefined;
    const handlePresentationKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      setIsPresentationMode(false);
      setStageAnnouncement('Presentation mode off.');
    };
    window.addEventListener('keydown', handlePresentationKeyDown);
    return () =>
      window.removeEventListener('keydown', handlePresentationKeyDown);
  }, [isChatOpen, isPresentationMode, setIsPresentationMode]);

  useEffect(() => {
    const video = localVideoRef.current;
    if (video && video.srcObject !== localStream)
      video.srcObject = localStream || null;
  }, [localStream, isCameraOff, hideLocal]);

  useEffect(() => {
    const video = mainVideoRef.current;
    if (!video) return;
    setDirectPlaybackBlocked(false);
    setDirectPlaybackError(null);

    if (directMovieUrl) {
      if (video.srcObject) video.srcObject = null;
      video.removeAttribute('crossorigin');
      if (video.getAttribute('src') !== directMovieUrl) {
        video.src = directMovieUrl;
        video.load();
      }
      return;
    }

    if (video.hasAttribute('src')) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    if (video.srcObject !== mainStream) video.srcObject = mainStream || null;
  }, [directMovieUrl, mainStream, selectedView, remoteCameraOff]);

  useEffect(() => {
    const video = mainVideoRef.current;
    if (!video || !directMovieUrl) return undefined;

    const synchronizeDirectPlayback = () => {
      if (
        video.readyState >= HTMLMediaElement.HAVE_METADATA &&
        Math.abs(video.currentTime - directMovieTime) > 1.25
      ) {
        video.currentTime = Math.min(
          directMovieTime,
          video.duration || directMovieTime,
        );
      }
      if (directMovieIsPlaying) {
        video
          .play()
          .then(() => setDirectPlaybackBlocked(false))
          .catch((error) => {
            if (isExpectedPlaybackInterruption(error)) return;
            if (error.name === 'NotAllowedError')
              setDirectPlaybackBlocked(true);
            else
              setDirectPlaybackError(
                error.message ||
                  'This device could not play the direct movie link.',
              );
          });
      } else {
        video.pause();
      }
    };

    synchronizeDirectPlayback();
    video.addEventListener('loadedmetadata', synchronizeDirectPlayback);
    return () =>
      video.removeEventListener('loadedmetadata', synchronizeDirectPlayback);
  }, [directMovieIsPlaying, directMovieTime, directMovieUrl]);

  useEffect(() => {
    const video = remoteCameraVideoRef.current;
    if (video && video.srcObject !== remoteStream)
      video.srcObject = remoteStream || null;
  }, [externalWatchSession, remoteStream, remoteCameraOff, selectedView]);

  useEffect(() => {
    const audio = remoteAudioRef.current;
    if (!audio) return;
    const audioTracks = remoteStream?.getAudioTracks() || [];
    const audioStream = audioTracks.length
      ? new MediaStream(audioTracks)
      : null;
    if (audio.srcObject !== audioStream) audio.srcObject = audioStream;
  }, [remoteStream]);

  useEffect(() => {
    const audio = remoteAudioRef.current;
    if (audio) audio.volume = participantVolume / 100;
  }, [participantVolume, remoteStream]);

  useEffect(() => {
    const video = mainVideoRef.current;
    if (!video || selectedView !== 'remote-screen') return;
    video.volume =
      getRemoteContentVolume(remoteShareSource?.kind, {
        screen: screenVolume,
        movie: movieVolume,
      }) / 100;
  }, [
    mainStream,
    movieVolume,
    remoteShareSource?.kind,
    screenVolume,
    selectedView,
  ]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const fullscreenRoot =
        document.getElementById('root') || document.documentElement;
      setIsFullscreen(document.fullscreenElement === fullscreenRoot);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () =>
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [setIsFullscreen]);

  useEffect(() => {
    const stage = containerRef.current;
    if (!stage) return undefined;

    const syncStageSize = () => {
      const nextSize = { width: stage.clientWidth, height: stage.clientHeight };
      setStageSize((current) =>
        current.width === nextSize.width && current.height === nextSize.height
          ? current
          : nextSize,
      );
    };
    syncStageSize();

    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(syncStageSize);
      observer.observe(stage);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', syncStageSize, { passive: true });
    return () => window.removeEventListener('resize', syncStageSize);
  }, []);

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

    return () => cleanups.forEach((cleanup) => cleanup());
  }, [
    mainStream,
    remoteStream,
    localStream,
    selectedView,
    hideLocal,
    isScreenView,
  ]);

  useEffect(
    () => () => {
      window.clearTimeout(pictureInPictureErrorTimerRef.current);
      pictureInPictureErrorTimerRef.current = null;
    },
    [],
  );

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      const fullscreenRoot =
        document.getElementById('root') || document.documentElement;
      await fullscreenRoot.requestFullscreen().catch((err) => {
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
      if (document.pictureInPictureElement)
        await document.exitPictureInPicture();
      if (video.readyState === HTMLMediaElement.HAVE_NOTHING) {
        throw new Error('The video is still loading. Try again in a moment.');
      }
      await video.requestPictureInPicture();
      setPictureInPictureView(view);
    } catch (error) {
      console.error('Picture-in-Picture failed', error);
      showPictureInPictureError(
        error.message || 'Picture-in-Picture is unavailable in this browser.',
      );
    }
  };

  const togglePresentationMode = () => {
    const nextValue = !isPresentationMode;
    setIsPresentationMode(nextValue);
    setStageAnnouncement(
      nextValue
        ? 'Presentation mode on. Camera previews and secondary controls are hidden.'
        : 'Presentation mode off.',
    );
  };

  const handleScreenViewModeChange = (nextMode) => {
    const normalizedMode = getNextScreenViewMode(nextMode, isScreenView);
    setScreenViewMode(normalizedMode);
    const label =
      normalizedMode === 'pixel' ? '100% pixel view' : normalizedMode;
    setStageAnnouncement(`Screen view: ${label}.`);
  };

  const syncMainVideoSize = (event) => {
    const video = event.currentTarget;
    const nextSize = {
      width: video.videoWidth || 0,
      height: video.videoHeight || 0,
    };
    setMainVideoSize((current) =>
      current.width === nextSize.width && current.height === nextSize.height
        ? current
        : nextSize,
    );
  };

  const handleMovieCommand = (owner, command) => {
    const video = mainVideoRef.current;
    if (directMovieUrl && video) {
      if (command.action === 'play') {
        video
          .play()
          .then(() => setDirectPlaybackBlocked(false))
          .catch((error) => {
            if (!isExpectedPlaybackInterruption(error)) {
              setDirectPlaybackError(
                error.message || 'Playback was blocked on this device.',
              );
            }
          });
      }
      if (command.action === 'pause') video.pause();
      if (command.action === 'seek' && Number.isFinite(command.currentTime)) {
        video.currentTime = Math.min(
          command.currentTime,
          video.duration || command.currentTime,
        );
      }
    }
    requestMovieControl(owner, command);
  };

  const showParticipantPlaceholder =
    selectedView === 'remote-camera' && (remoteCameraOff || !remoteStream);
  const hasMainMedia = Boolean(mainStream || directMovieUrl);
  const showStreamLoading = isScreenView && !hasMainMedia;
  const controlsHidden = isIdle && (isFullscreen || isPresentationMode);
  const screenVideoLayout = getScreenVideoLayout(screenViewMode);
  const usesBlackStage = isScreenView || isFullscreen;
  const usesPixelView = isScreenView && screenViewMode === 'pixel';
  const nativeVideoSize =
    activeMovie?.source.width && activeMovie?.source.height
      ? { width: activeMovie.source.width, height: activeMovie.source.height }
      : mainVideoSize;
  const pixelSurfaceStyle =
    usesPixelView && nativeVideoSize.width && nativeVideoSize.height
      ? {
          width: `max(100%, ${nativeVideoSize.width}px)`,
          height: `max(100%, ${nativeVideoSize.height}px)`,
        }
      : undefined;
  const pixelVideoStyle =
    usesPixelView && nativeVideoSize.width && nativeVideoSize.height
      ? {
          width: `${nativeVideoSize.width}px`,
          height: `${nativeVideoSize.height}px`,
        }
      : undefined;
  const containedMovieSize =
    activeMovie && screenViewMode === 'fit'
      ? getContainedMediaSize(
          stageSize.width,
          stageSize.height,
          activeMovie.source.aspectRatio,
        )
      : null;
  const containedMovieStyle = containedMovieSize
    ? {
        width: `${containedMovieSize.width}px`,
        height: `${containedMovieSize.height}px`,
        objectFit: 'fill',
      }
    : undefined;
  const mainVideoStyle = pixelVideoStyle || containedMovieStyle;

  return (
    <TooltipProvider delayDuration={250}>
      <main
        ref={containerRef}
        className={`call-stage group relative flex h-full w-full items-center justify-center overflow-hidden ${usesBlackStage ? 'bg-black' : 'bg-bg'} ${isChatOpen ? 'call-stage--chat-docked' : ''}`}
      >
        <audio ref={remoteAudioRef} autoPlay aria-label="Participant audio" />
        {pictureInPictureError ? (
          <div
            role="alert"
            className="absolute top-20 left-1/2 z-40 flex w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 items-start gap-3 rounded-xl border border-amber-300/20 bg-amber-950/95 py-2 pr-2 pl-4 text-sm text-amber-100 shadow-xl"
          >
            <p className="min-w-0 flex-1 py-1.5">{pictureInPictureError}</p>
            <Button
              variant="ghost"
              size="icon"
              onClick={dismissPictureInPictureError}
              aria-label="Dismiss Picture-in-Picture error"
              className="text-amber-100 hover:bg-white/10"
            >
              <X className="size-4" />
            </Button>
          </div>
        ) : null}
        {(hasRemoteScreen || hasLocalScreen) ? (
          <div
            className={`absolute top-6 left-1/2 z-30 -translate-x-1/2 transition-opacity duration-300 ${controlsHidden ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
          >
            <div className="mb-2 text-center text-[10px] font-semibold tracking-[0.2em] text-zinc-600 uppercase">
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
                    {remoteShareSource?.kind === 'movie' ? (
                      <Film className="size-3.5" />
                    ) : (
                      <MonitorPlay className="size-3.5" />
                    )}
                    {remoteContentLabel}
                  </TabsTrigger>
                ) : null}
                {hasLocalScreen ? (
                  <TabsTrigger value="local-screen">
                    {localShareSource?.kind === 'movie' ? (
                      <Film className="size-3.5" />
                    ) : (
                      <MonitorUp className="size-3.5" />
                    )}
                    {localContentLabel}
                  </TabsTrigger>
                ) : null}
              </TabsList>
            </Tabs>
          </div>
        ) : null}


        {showStreamLoading ? (
          <section
            className="flex h-full w-full items-center justify-center bg-bg"
            aria-live="polite"
          >
            <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-surface px-4 py-3 text-sm text-zinc-400">
              <span className="size-2 animate-pulse rounded-full bg-primary" />
              Connecting to {mainLabel.toLowerCase()}…
            </div>
          </section>
        ) : isScreenView ? (
          hasMainMedia ? (
            <div
              className={`h-full w-full bg-black ${screenVideoLayout.viewportClassName}`}
            >
              <div
                className={`bg-black ${screenVideoLayout.surfaceClassName}`}
                style={pixelSurfaceStyle}
              >
                <video
                  ref={mainVideoRef}
                  autoPlay
                  playsInline
                  muted={selectedView !== 'remote-screen'}
                  onLoadedMetadata={syncMainVideoSize}
                  onResize={syncMainVideoSize}
                  onDoubleClick={toggleFullscreen}
                  onError={() => {
                    if (directMovieUrl) {
                      setDirectPlaybackError(
                        'This participant could not load the direct URL.',
                      );
                    }
                  }}
                  aria-label={`${mainLabel} video`}
                  className={`cursor-pointer transition-opacity duration-300 motion-reduce:transition-none ${screenVideoLayout.videoClassName} ${hideMainVideo ? 'opacity-0' : 'opacity-100'} ${selectedView === 'remote-camera' && remoteMirrored ? 'scale-x-[-1]' : ''}`}
                  style={mainVideoStyle}
                />
              </div>
            </div>
          ) : (
            <ParticipantPlaceholder
              connected={connected}
              peerPresence={peerPresence}
            />
          )
        ) : (
          <div className={`w-full h-full p-4 ${localStream && !isCameraOff && remoteStream && !remoteCameraOff ? 'discord-grid-2' : 'discord-grid-1'}`}>
            {(!remoteStream || remoteCameraOff) && (!localStream || isCameraOff) ? (
              <ParticipantPlaceholder
                connected={connected}
                peerPresence={peerPresence}
              />
            ) : (
              <>
                {(remoteStream && !remoteCameraOff) ? (
                  <div className="relative w-full h-full rounded-[8px] overflow-hidden bg-surface shadow-lg flex items-center justify-center group/remote">
                    <video
                      ref={mainVideoRef}
                      autoPlay
                      playsInline
                      muted={selectedView !== 'remote-screen'}
                      className={`w-full h-full object-cover ${hideMainVideo ? 'opacity-0' : 'opacity-100'} ${remoteMirrored ? 'scale-x-[-1]' : ''}`}
                    />
                    <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm text-white px-2 py-1 rounded-[4px] text-xs font-semibold">Participant</div>
                  </div>
                ) : null}

                {(localStream && !isCameraOff) ? (
                  <div className="relative w-full h-full rounded-[8px] overflow-hidden bg-surface shadow-lg flex items-center justify-center group/local">
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className={`w-full h-full object-cover ${isMirrored ? 'scale-x-[-1]' : ''}`}
                    />
                    <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm text-white px-2 py-1 rounded-[4px] text-xs font-semibold">You</div>
                    
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-focus-within/local:opacity-100 group-hover/local:opacity-100">
                      <Button
                        variant="secondary"
                        size="icon"
                        className="size-8 bg-black/60 hover:bg-primary border-0"
                        onClick={() => {
                          const nextMirrored = !isMirrored;
                          setIsMirrored(nextMirrored);
                          sendControlMessage({
                            type: 'mirror-toggle',
                            isMirrored: nextMirrored,
                          });
                        }}
                      >
                        <FlipHorizontal className="size-4 text-white" />
                      </Button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        )}


        {!showParticipantPlaceholder && hasMainMedia && isPresentationMode ? (
          <div
            className={`absolute top-3 right-3 z-40 transition-opacity duration-300 motion-reduce:transition-none sm:top-5 sm:right-5 ${controlsHidden ? 'opacity-35' : 'opacity-100'}`}
          >
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
        ) : !showParticipantPlaceholder && hasMainMedia ? (
          <div
            className={`absolute top-5 right-5 z-20 flex gap-2 transition-opacity duration-300 ${controlsHidden ? 'pointer-events-none opacity-0' : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'}`}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => setHideMainVideo((value) => !value)}
                  aria-label={
                    hideMainVideo ? `Show ${mainLabel}` : `Hide ${mainLabel}`
                  }
                >
                  {hideMainVideo ? (
                    <Eye className="size-4" />
                  ) : (
                    <EyeOff className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {hideMainVideo ? `Show ${mainLabel}` : `Hide ${mainLabel}`}
              </TooltipContent>
            </Tooltip>

            {canUsePictureInPicture ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={
                      pictureInPictureView === 'main' ? 'active' : 'secondary'
                    }
                    size="icon"
                    onClick={() =>
                      togglePictureInPicture(mainVideoRef.current, 'main')
                    }
                    aria-label={
                      pictureInPictureView === 'main'
                        ? `Return ${mainLabel} to the browser`
                        : `Float ${mainLabel} on the desktop`
                    }
                  >
                    <PictureInPicture2 className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {pictureInPictureView === 'main'
                    ? 'Close floating video'
                    : `Float ${mainLabel} on desktop`}
                </TooltipContent>
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
                      aria-label={
                        isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'
                      }
                    >
                      {isFullscreen ? (
                        <Minimize className="size-4" />
                      ) : (
                        <Maximize className="size-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                  </TooltipContent>
                </Tooltip>
              </>
            ) : null}
          </div>
        ) : null}

        {isScreenView && hasMainMedia ? (
          <div
            className={`absolute z-30 transition-[opacity,transform] duration-300 motion-reduce:transition-none ${isPresentationMode ? 'bottom-3 left-3 sm:bottom-5 sm:left-5' : localShareSource?.kind === 'movie' ? 'bottom-40 left-3 sm:left-6' : 'bottom-20 left-3 sm:bottom-6 sm:left-6'} ${controlsHidden ? 'pointer-events-none translate-y-2 opacity-0' : 'translate-y-0 opacity-100'}`}
          >
            <Tabs
              value={screenViewMode}
              onValueChange={handleScreenViewModeChange}
            >
              <TabsList
                className="min-h-0 gap-0.5 p-0"
                aria-label="Shared screen sizing"
              >
                <TabsTrigger
                  value="fit"
                  className="h-11 px-2.5"
                  title="Show the entire shared screen"
                >
                  Fit
                </TabsTrigger>
                <TabsTrigger
                  value="fill"
                  className="h-11 px-2.5"
                  title="Fill the stage and crop the edges"
                >
                  Crop
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

        {activeMovie?.source.subtitleText ? (
          <div
            className="pointer-events-none absolute bottom-44 left-1/2 z-20 w-[min(54rem,calc(100vw-2rem))] -translate-x-1/2 px-4 text-center"
            aria-live="off"
          >
            <span className="rounded-lg bg-black/80 px-3 py-1.5 text-base leading-7 font-medium whitespace-pre-line text-white shadow-lg sm:text-lg">
              {activeMovie.source.subtitleText}
            </span>
          </div>
        ) : null}

        {activeMovie ? (
          <SharedMoviePlayer
            owner={activeMovie.owner}
            source={activeMovie.source}
            hidden={controlsHidden}
            onCommand={handleMovieCommand}
            onAddSubtitle={() =>
              document.getElementById('movie-subtitle-input')?.click()
            }
            volume={movieVolume}
            onVolumeChange={setMovieVolume}
          />
        ) : null}

        {directMovieUrl && (directPlaybackBlocked || directPlaybackError) ? (
          <div
            className="absolute top-24 left-1/2 z-40 flex w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-xl border border-amber-300/20 bg-amber-950/95 p-3 text-sm text-amber-100 shadow-xl"
            role="alert"
          >
            <p className="min-w-0 flex-1">
              {directPlaybackError ||
                'Your browser requires a click before playing this direct link with audio.'}
            </p>
            {!directPlaybackError ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  mainVideoRef.current
                    ?.play()
                    .then(() => setDirectPlaybackBlocked(false))
                    .catch((error) => {
                      if (!isExpectedPlaybackInterruption(error)) {
                        setDirectPlaybackError(
                          error.message ||
                            'Playback is unavailable on this device.',
                        );
                      }
                    });
                }}
              >
                Play here
              </Button>
            ) : null}
          </div>
        ) : null}

        {(isScreenView || externalWatchSession) &&
        !isPresentationMode &&
        remoteStream &&
        !remoteCameraOff ? (
          <motion.div
            drag
            dragConstraints={containerRef}
            dragElastic={0}
            dragMomentum={false}
            className={`group/pip fixed top-24 left-4 z-[80] aspect-video w-48 cursor-grab touch-none overflow-hidden rounded-xl border border-white/10 bg-[#111719] shadow-2xl transition-opacity active:cursor-grabbing sm:left-7 sm:w-64 ${controlsHidden && !externalWatchSession ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
            role="group"
            aria-label="Movable participant camera preview"
          >
            <video
              ref={remoteCameraVideoRef}
              autoPlay
              playsInline
              muted
              className={`h-full w-full object-cover ${remoteMirrored ? 'scale-x-[-1]' : ''}`}
            />
            <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pt-7 pb-2 text-left text-xs font-medium text-white">
              Participant · drag to move
            </span>
            <div
              className="absolute top-2 right-2 z-20 flex gap-1 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-focus-within/pip:opacity-100 sm:group-hover/pip:opacity-100"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="size-9"
                    onClick={() => setSelectedView('remote-camera')}
                    aria-label="Show participant camera in the main view"
                  >
                    <Focus className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Focus participant camera</TooltipContent>
              </Tooltip>
              {canUsePictureInPicture ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={
                        pictureInPictureView === 'remote-camera'
                          ? 'active'
                          : 'secondary'
                      }
                      size="icon"
                      className="size-9"
                      onClick={() =>
                        togglePictureInPicture(
                          remoteCameraVideoRef.current,
                          'remote-camera',
                        )
                      }
                      aria-label={
                        pictureInPictureView === 'remote-camera'
                          ? 'Return participant camera to the browser'
                          : 'Float participant camera on the desktop'
                      }
                    >
                      <PictureInPicture2 className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {pictureInPictureView === 'remote-camera'
                      ? 'Close floating camera'
                      : 'Float participant on desktop'}
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          </motion.div>
        ) : null}

        {isScreenView && !externalWatchSession &&
        !isPresentationMode &&
        !hideLocal &&
        localStream &&
        !isCameraOff ? (
          <motion.div
            drag
            dragConstraints={containerRef}
            dragElastic={0.1}
            dragMomentum={false}
            className={`group/local absolute top-24 right-4 z-30 aspect-video w-48 overflow-hidden rounded-xl border border-white/10 bg-[#111719] shadow-2xl transition-opacity sm:right-7 sm:w-64 ${controlsHidden ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
          >
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`h-full w-full object-cover ${isMirrored ? 'scale-x-[-1]' : ''}`}
              aria-label="Your camera preview"
            />
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-focus-within/local:opacity-100 group-hover/local:opacity-100">
              {canUsePictureInPicture ? (
                <Button
                  variant={
                    pictureInPictureView === 'local-camera'
                      ? 'active'
                      : 'secondary'
                  }
                  size="icon"
                  className="size-9"
                  onClick={() =>
                    togglePictureInPicture(
                      localVideoRef.current,
                      'local-camera',
                    )
                  }
                  aria-label={
                    pictureInPictureView === 'local-camera'
                      ? 'Return your camera to the browser'
                      : 'Float your camera on the desktop'
                  }
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
                  sendControlMessage({
                    type: 'mirror-toggle',
                    isMirrored: nextMirrored,
                  });
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
            <span className="absolute bottom-2 left-3 text-xs font-medium text-white drop-shadow">
              You
            </span>
          </motion.div>
        ) : null}

        {!isPresentationMode && hideLocal && localStream && !isCameraOff ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="absolute top-24 right-5 z-20"
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
