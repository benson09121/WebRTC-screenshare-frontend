import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Ellipsis,
  Eye,
  EyeOff,
  Film,
  Focus,
  Maximize,
  Minimize,
  MonitorPlay,
  MonitorUp,
  PictureInPicture2,
  User,
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
import { getRoomLayoutState } from '../lib/roomLayout';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { SharedMoviePlayer } from './SharedMoviePlayer';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { TooltipProvider } from './ui/tooltip';

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
    setScreenVolume,
    movieVolume,
    setMovieVolume,
    peerPresence,
    externalWatchSession,
    selectedStageView,
    setSelectedStageView,
  } = useWebRTC();

  const mainVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const remoteCameraVideoRef = useRef(null);
  const localVideoRef = useRef(null);
  const mediaViewportRef = useRef(null);
  const containerRef = useRef(null);
  const previousSharesRef = useRef({ local: false, remote: false });
  const pictureInPictureErrorTimerRef = useRef(null);

  const [selectedView, setSelectedView] = useState('remote-camera');
  const [hideMainVideo, setHideMainVideo] = useState(false);
  const [isMirrored] = useState(true);
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
  const { showParticipantDock } = getRoomLayoutState({
    hasSharedContent: hasRemoteScreen || hasLocalScreen,
    hasExternalWatchSession: Boolean(externalWatchSession),
    isPresentationMode,
  });
  const [dockMounted, setDockMounted] = useState(showParticipantDock);
  const isScreenView = ['remote-screen', 'local-screen'].includes(selectedView);
  const canUsePictureInPicture = Boolean(
    document.pictureInPictureEnabled &&
    HTMLVideoElement.prototype.requestPictureInPicture,
  );

  useEffect(() => {
    if (showParticipantDock) {
      setDockMounted(true);
      return undefined;
    }
    const timeout = window.setTimeout(() => setDockMounted(false), 180);
    return () => window.clearTimeout(timeout);
  }, [showParticipantDock]);

  const mainStream =
    selectedView === 'remote-screen'
      ? remoteScreenStream
      : selectedView === 'local-screen'
        ? localScreenStream
        : selectedView === 'local-camera'
          ? localStream
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
        : selectedView === 'local-camera'
          ? 'You'
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
    if (nextView !== selectedView) {
      setSelectedView(nextView);
      if (selectedStageView !== 'external-watch')
        setSelectedStageView(nextView);
    }
  }, [
    hasLocalScreen,
    hasRemoteScreen,
    selectedStageView,
    selectedView,
    setSelectedStageView,
  ]);

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
  }, [localStream, isCameraOff]);

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
    const stage = mediaViewportRef.current || containerRef.current;
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
  }, [mainStream, remoteStream, localStream, selectedView, isScreenView]);

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

  const selectStageView = (view) => {
    setSelectedStageView(view);
    if (view !== 'external-watch') setSelectedView(view);
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
    (selectedView === 'remote-camera' && (remoteCameraOff || !remoteStream)) ||
    (selectedView === 'local-camera' && (isCameraOff || !localStream));
  const hasMainMedia = Boolean(mainStream || directMovieUrl);
  const showStreamLoading = isScreenView && !hasMainMedia;
  const controlsHidden = isIdle && (isFullscreen || isPresentationMode);
  const screenVideoLayout = getScreenVideoLayout(screenViewMode);
  const usesBlackStage = showParticipantDock || isScreenView || isFullscreen;
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

  const renderDockTile = ({
    view,
    label,
    icon,
    videoRef,
    mirrored = false,
  }) => {
    const selected = selectedStageView === view;
    return (
      <div className="participant-dock-tile relative shrink-0">
        <button
          type="button"
          className={`group/tile focus-visible:ring-primary relative h-full w-full overflow-hidden rounded-[9px] border bg-[#111719] text-left transition-[opacity,transform] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black ${selected ? 'border-primary' : 'border-white/10 hover:border-white/25'}`}
          onClick={() => selectStageView(view)}
          aria-label={`Focus ${label}`}
          aria-pressed={selected}
        >
          {videoRef ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`size-full object-cover ${mirrored ? 'scale-x-[-1]' : ''}`}
            />
          ) : (
            <span className="grid size-full place-items-center text-zinc-500">
              {icon}
            </span>
          )}
          <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/90 to-transparent px-2 pt-5 pb-1.5 text-[11px] font-medium text-white">
            {label}
          </span>
        </button>
      </div>
    );
  };

  const renderParticipantDock = () => (
    <div
      className={`participant-dock absolute inset-x-3 bottom-3 z-[70] flex items-stretch justify-start gap-2 overflow-x-auto px-1 pb-1 sm:inset-x-4 sm:bottom-4 md:justify-center ${showParticipantDock ? 'participant-dock--enter' : 'participant-dock--exit'}`}
      role="region"
      aria-label="Call participants"
      aria-hidden={showParticipantDock ? undefined : true}
      inert={showParticipantDock ? undefined : true}
    >
      {hasRemoteScreen
        ? renderDockTile({
            view: 'remote-screen',
            label: remoteContentLabel,
            icon:
              remoteShareSource?.kind === 'movie' ? (
                <Film className="size-6" />
              ) : (
                <MonitorPlay className="size-6" />
              ),
          })
        : null}
      {hasLocalScreen
        ? renderDockTile({
            view: 'local-screen',
            label: localContentLabel,
            icon:
              localShareSource?.kind === 'movie' ? (
                <Film className="size-6" />
              ) : (
                <MonitorUp className="size-6" />
              ),
          })
        : null}
      {externalWatchSession
        ? renderDockTile({
            view: 'external-watch',
            label: externalWatchSession.media?.title || 'Watch party',
            icon: <Film className="size-6" />,
          })
        : null}
      {renderDockTile({
        view: 'remote-camera',
        label: 'Participant',
        icon: <User className="size-6" />,
        videoRef:
          remoteStream && !remoteCameraOff ? remoteCameraVideoRef : null,
        mirrored: remoteMirrored,
      })}
      {renderDockTile({
        view: 'local-camera',
        label: 'You',
        icon: <User className="size-6" />,
        videoRef: localStream && !isCameraOff ? localVideoRef : null,
        mirrored: isMirrored,
      })}
      <Button
        variant="secondary"
        size="icon"
        className="participant-dock-focus size-11 shrink-0 self-center rounded-full bg-black/70"
        onClick={togglePresentationMode}
        aria-label="Hide participant dock and focus the selected view"
      >
        <ChevronDown className="size-5" />
      </Button>
    </div>
  );
  return (
    <TooltipProvider delayDuration={250}>
      <main
        ref={containerRef}
        className={`call-stage group relative flex h-full w-full items-center justify-center overflow-hidden ${usesBlackStage ? 'bg-black' : 'bg-bg'} ${isChatOpen ? 'call-stage--chat-docked' : ''} ${showParticipantDock ? 'shared-stage-with-participants' : ''} ${activeMovie ? 'shared-stage-has-movie' : ''}`}
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
        <div
          ref={mediaViewportRef}
          className="shared-content-viewport"
          data-stage-layout={showParticipantDock ? 'inset' : 'full'}
        >
          {showStreamLoading ? (
            <section
              className="bg-bg flex h-full w-full items-center justify-center"
              aria-live="polite"
            >
              <div className="bg-surface flex items-center gap-3 rounded-xl border border-white/[0.08] px-4 py-3 text-sm text-zinc-400">
                <span className="bg-primary size-2 animate-pulse rounded-full" />
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
          ) : showParticipantPlaceholder ? (
            <ParticipantPlaceholder
              connected={connected}
              peerPresence={peerPresence}
            />
          ) : (
            <video
              ref={mainVideoRef}
              autoPlay
              playsInline
              muted={selectedView === 'local-camera'}
              onDoubleClick={toggleFullscreen}
              aria-label={`${mainLabel} video`}
              className={`size-full object-contain ${selectedView === 'remote-camera' && remoteMirrored ? 'scale-x-[-1]' : ''} ${selectedView === 'local-camera' && isMirrored ? 'scale-x-[-1]' : ''}`}
            />
          )}
        </div>

        {dockMounted ? renderParticipantDock() : null}

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
              <ChevronUp className="size-4" />
              Exit focus
            </Button>
          </div>
        ) : !showParticipantPlaceholder && hasMainMedia ? (
          <div
            className={`shared-stage-options absolute top-5 right-5 z-50 transition-opacity duration-200 ${controlsHidden ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
          >
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  className="bg-black/65"
                  aria-label={`${mainLabel} options`}
                >
                  <Ellipsis className="size-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" side="bottom" className="w-56 p-2">
                <p className="truncate px-3 py-2 text-xs font-semibold text-zinc-400">
                  {mainLabel}
                </p>
                {selectedView === 'remote-screen' ? (
                  <label className="mb-2 block px-3 py-2 text-xs text-zinc-300">
                    <span className="mb-2 flex items-center justify-between gap-3">
                      <span>Shared-screen volume</span>
                      <span className="font-mono text-zinc-500">
                        {screenVolume}%
                      </span>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={screenVolume}
                      onChange={(event) => setScreenVolume(event.target.value)}
                      className="h-2 w-full cursor-pointer accent-teal-300"
                      aria-label="Shared-screen volume"
                    />
                  </label>
                ) : null}
                <Button
                  variant="ghost"
                  className="h-10 w-full justify-start gap-2 px-3"
                  onClick={() => setHideMainVideo((value) => !value)}
                >
                  {hideMainVideo ? (
                    <Eye className="size-4" />
                  ) : (
                    <EyeOff className="size-4" />
                  )}
                  {hideMainVideo ? `Show ${mainLabel}` : `Hide ${mainLabel}`}
                </Button>
                {canUsePictureInPicture ? (
                  <Button
                    variant="ghost"
                    className="h-10 w-full justify-start gap-2 px-3"
                    onClick={() =>
                      togglePictureInPicture(mainVideoRef.current, 'main')
                    }
                  >
                    <PictureInPicture2 className="size-4" />
                    {pictureInPictureView === 'main'
                      ? 'Close floating video'
                      : 'Picture in Picture'}
                  </Button>
                ) : null}
                {isScreenView ? (
                  <Button
                    variant="ghost"
                    className="h-10 w-full justify-start gap-2 px-3"
                    onClick={togglePresentationMode}
                  >
                    <Focus className="size-4" />
                    Focus shared content
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  className="h-10 w-full justify-start gap-2 px-3"
                  onClick={toggleFullscreen}
                >
                  {isFullscreen ? (
                    <Minimize className="size-4" />
                  ) : (
                    <Maximize className="size-4" />
                  )}
                  {isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                </Button>
              </PopoverContent>
            </Popover>
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

        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {stageAnnouncement}
        </p>
      </main>
    </TooltipProvider>
  );
};
