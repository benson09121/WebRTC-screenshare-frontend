import React, { useState, useEffect, useRef } from 'react';
import { useWebRTC } from '../context/useWebRTC';
import { Captions, ChevronDown, ChevronUp, Film, Link2, Mic, MicOff, Play, Video, VideoOff, MonitorPlay, MonitorUp, PhoneOff, Upload, UserRound, Volume2, VolumeX, X } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { createEmptyAudioTrack, createEmptyVideoTrack } from '../lib/mediaTracks';
import {
  formatMediaTime,
  getActiveSubtitleText,
  getActiveNativeSubtitleText,
  getCaptureStream,
  getDirectMediaDisplayName,
  getMovieDisplayName,
  getMovieVideoGeometry,
  isExpectedPlaybackInterruption,
  getNativeAudioTrackOptions,
  getNativeSubtitleTrackOptions,
  normalizeDirectMediaUrl,
  parseSrt,
  selectNativeAudioTrack,
  selectNativeSubtitleTrack,
  waitForCapturedTrack,
  waitForMovieFrame,
  waitForMovieMetadata,
} from '../lib/movieShare';
import {
  AUTO_QUALITY_PROFILES,
  AUTO_QUALITY_START_INDEX,
  advanceAutoQuality,
  createAutoQualityState,
  getAutoQualityPreset,
  getTrackQualityConstraints,
  summarizeScreenSenderStats,
} from '../lib/screenShareQuality';

const WatchCatalog = React.lazy(() => import('./WatchCatalog').then(module => ({ default: module.WatchCatalog })));

const QUALITY_PRESETS = {
  'auto': { label: 'Auto (recommended)', auto: true },
  'lossless': { label: 'Native resolution (up to 60fps)', lossless: true, frameRate: 60, bitrate: 12000000 },
  '1080p': { label: '1080p (60fps)', width: 1920, height: 1080, frameRate: 60, bitrate: 10000000 },
  '720p':  { label: '720p (60fps)',  width: 1280, height: 720,  frameRate: 60, bitrate: 6000000 },
  '480p':  { label: '480p (30fps)',  width: 854,  height: 480,  frameRate: 30, bitrate: 2500000 }
};

const SCREEN_AUDIO_COPY = {
  idle: 'Audio availability is decided in the browser share picker.',
  native: 'Shared-content audio is included directly.',
  monitor: 'Desktop audio is included from the selected Linux monitor. Use headphones to reduce call-audio echo.',
  unavailable: 'No screen-audio track was provided. Video is still being shared.',
  direct: 'Each participant is playing the direct link locally; movie audio is not relayed through WebRTC.',
};

const SEEK_SETTLE_DELAY_MS = 900;

const isMonitorSource = device => /(^|[\s._-])monitor([\s._-]|$)|monitor of/i.test(device.label);
const isVirtualAudioSource = device => /virtual.?cable|loopback|null.?sink/i.test(device.label);

const readCaptureMetrics = track => {
  const settings = track?.getSettings?.() || {};
  return {
    width: settings.width || null,
    height: settings.height || null,
    framesPerSecond: settings.frameRate || null,
  };
};

const sameVideoMetrics = (first, second) => (
  first?.width === second?.width
  && first?.height === second?.height
  && first?.framesPerSecond === second?.framesPerSecond
  && first?.sendBitrateKbps === second?.sendBitrateKbps
  && first?.targetBitrateKbps === second?.targetBitrateKbps
  && first?.qualityLimitationReason === second?.qualityLimitationReason
);

const formatVideoMetrics = metrics => {
  if (!metrics?.width || !metrics?.height) return 'Waiting for video data';
  const fps = metrics.framesPerSecond == null ? '' : ` · ${Math.round(metrics.framesPerSecond)}fps`;
  return `${metrics.width}×${metrics.height}${fps}`;
};

const LIMITATION_COPY = {
  none: 'Stable',
  cpu: 'Adapting to device load',
  bandwidth: 'Adapting to upload bandwidth',
  other: 'Browser is adapting video',
};

const VolumeControl = ({ id, icon: Icon, label, description, value, onChange }) => {
  const muted = value === 0;
  const VolumeIcon = muted ? VolumeX : Volume2;

  return (
    <div>
      <div className="flex items-center gap-2">
        <Icon className="size-3.5 shrink-0 text-zinc-500" aria-hidden="true" />
        <label htmlFor={id} className="text-xs font-medium text-zinc-300">{label}</label>
        <span className="ml-auto shrink-0 font-mono text-[11px] text-zinc-500">{value}%</span>
      </div>
      <div className="mt-2 flex items-center gap-2.5">
        <VolumeIcon className={`size-4 shrink-0 ${muted ? 'text-zinc-600' : 'text-teal-300'}`} aria-hidden="true" />
        <input
          id={id}
          type="range"
          min="0"
          max="100"
          step="5"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={`${id}-description`}
          aria-valuetext={muted ? 'Muted' : `${value} percent`}
          className="h-2 w-full cursor-pointer accent-teal-300"
        />
      </div>
      <p id={`${id}-description`} className="mt-1.5 text-[10px] leading-4 text-zinc-600">
        {description}
      </p>
    </div>
  );
};

export const ControlPanel = ({
  isIdle,
  fullscreenDashboardOpen,
  setFullscreenDashboardOpen,
}) => {
  const {
    endCall,
    setCameraStream,
    setSharedContentAudioTrack,
    setScreenStream,
    localStream,
    localScreenStream,
    getSender,
    isScreenSharing,
    setIsScreenSharing,
    isCameraOff,
    setIsCameraOff,
    isMuted,
    setIsMuted,
    sendControlMessage,
    isFullscreen,
    isPresentationMode,
    localShareSource,
    setLocalShareSource,
    participantVolume,
    setParticipantVolume,
    screenVolume,
    setScreenVolume,
    movieVolume,
    movieControlRequest,
    connected,
    proposeExternalWatch,
  } = useWebRTC();
  
  const [quality, setQuality] = useState('auto');
  const [contentType, setContentType] = useState('motion'); // 'motion' (Movie) or 'detail' (Text)
  const [mediaError, setMediaError] = useState(null);
  const [autoQualityIndex, setAutoQualityIndex] = useState(AUTO_QUALITY_START_INDEX);
  const [screenMetrics, setScreenMetrics] = useState({ capture: null, outbound: null });
  
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState('');
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedVideoDevice, setSelectedVideoDevice] = useState('');
  const [desktopAudioDevices, setDesktopAudioDevices] = useState([]);
  const [selectedDesktopAudioDevice, setSelectedDesktopAudioDevice] = useState('');
  const [screenAudioStatus, setScreenAudioStatus] = useState('idle');
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [, setMovieProgress] = useState({ currentTime: 0, duration: 0, isPlaying: false });
  const [showMovieSourcePicker, setShowMovieSourcePicker] = useState(false);
  const [showWatchCatalog, setShowWatchCatalog] = useState(false);
  const [hasOpenedWatchCatalog, setHasOpenedWatchCatalog] = useState(false);
  const [directMediaUrl, setDirectMediaUrl] = useState('');
  const [isLoadingDirectMedia, setIsLoadingDirectMedia] = useState(false);
  const [selectedSubtitle, setSelectedSubtitle] = useState(null);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  const [movieAudioTracks, setMovieAudioTracks] = useState([]);
  const [selectedMovieAudioTrack, setSelectedMovieAudioTrack] = useState(0);
  const [nativeSubtitleTracks, setNativeSubtitleTracks] = useState([]);
  const [selectedNativeSubtitleTrack, setSelectedNativeSubtitleTrack] = useState(null);
  const [activeSettingsMenu, setActiveSettingsMenu] = useState(null);
  const startCameraRef = useRef(null);
  const activeDisplayStreamRef = useRef(null);
  const screenAudioTrackRef = useRef(null);
  const movieInputRef = useRef(null);
  const subtitleInputRef = useRef(null);
  const moviePlayerRef = useRef(null);
  const movieObjectUrlRef = useRef(null);
  const stoppingShareRef = useRef(false);
  const getSenderRef = useRef(getSender);
  const qualityRef = useRef(quality);
  const contentTypeRef = useRef(contentType);
  const autoQualityStateRef = useRef(createAutoQualityState());
  const screenStatsSamplesRef = useRef(new Map());
  const screenQualitySenderRef = useRef(null);
  const applyScreenQualityRef = useRef(null);
  const mediaErrorTimerRef = useRef(null);
  const selectedSubtitleRef = useRef(null);
  const subtitlesEnabledRef = useRef(true);
  const movieAudioTracksRef = useRef([]);
  const selectedMovieAudioTrackRef = useRef(0);
  const selectedNativeSubtitleTrackRef = useRef(null);
  const nativeSubtitleTracksRef = useRef([]);
  const lastMovieBroadcastAtRef = useRef(0);
  const lastBroadcastSubtitleRef = useRef('');
  const sendMovieStateRef = useRef(null);
  const processedMovieControlRequestRef = useRef(null);
  const localShareSourceRef = useRef(localShareSource);
  const movieSeekResumeTimerRef = useRef(null);
  getSenderRef.current = getSender;
  qualityRef.current = quality;
  contentTypeRef.current = contentType;
  selectedSubtitleRef.current = selectedSubtitle;
  subtitlesEnabledRef.current = subtitlesEnabled;
  movieAudioTracksRef.current = movieAudioTracks;
  selectedMovieAudioTrackRef.current = selectedMovieAudioTrack;
  nativeSubtitleTracksRef.current = nativeSubtitleTracks;
  selectedNativeSubtitleTrackRef.current = selectedNativeSubtitleTrack;
  localShareSourceRef.current = localShareSource;

  const dismissMediaError = () => {
    window.clearTimeout(mediaErrorTimerRef.current);
    mediaErrorTimerRef.current = null;
    setMediaError(null);
  };

  const showMediaError = (message) => {
    window.clearTimeout(mediaErrorTimerRef.current);
    setMediaError(message);
    mediaErrorTimerRef.current = window.setTimeout(() => {
      setMediaError(null);
      mediaErrorTimerRef.current = null;
    }, 7000);
  };

  const updateCameraStream = async (stream) => {
    await setCameraStream(stream);
  };

  const clearMovieSource = () => {
    window.clearTimeout(movieSeekResumeTimerRef.current);
    movieSeekResumeTimerRef.current = null;
    const player = moviePlayerRef.current;
    if (player) {
      player.pause();
      player.removeAttribute('src');
      player.removeAttribute('crossorigin');
      player.load();
    }
    if (movieObjectUrlRef.current) URL.revokeObjectURL(movieObjectUrlRef.current);
    movieObjectUrlRef.current = null;
    setSelectedMovie(null);
    setMovieProgress({ currentTime: 0, duration: 0, isPlaying: false });
    setDirectMediaUrl('');
    setSelectedSubtitle(null);
    setSubtitlesEnabled(true);
    setMovieAudioTracks([]);
    setSelectedMovieAudioTrack(0);
    setNativeSubtitleTracks([]);
    setSelectedNativeSubtitleTrack(null);
    selectedSubtitleRef.current = null;
    subtitlesEnabledRef.current = true;
    movieAudioTracksRef.current = [];
    selectedMovieAudioTrackRef.current = 0;
    selectedNativeSubtitleTrackRef.current = null;
    nativeSubtitleTracksRef.current = [];
    lastMovieBroadcastAtRef.current = 0;
    lastBroadcastSubtitleRef.current = '';
    setShowMovieSourcePicker(false);
    setIsLoadingDirectMedia(false);
    if (movieInputRef.current) movieInputRef.current.value = '';
    if (subtitleInputRef.current) subtitleInputRef.current.value = '';
  };

  const startCamera = async () => {
    try {
      dismissMediaError();
      
      const constraints = {};
      
      if (!isMuted) {
        constraints.audio = selectedAudioDevice ? { deviceId: { exact: selectedAudioDevice } } : true;
      }
      if (!isCameraOff) {
        constraints.video = {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          ...(selectedVideoDevice
            ? { deviceId: { exact: selectedVideoDevice } }
            : { facingMode: 'user' }),
        };
      }

      // If both are off, generate dummy tracks to force WebRTC sendrecv negotiation!
      // This prevents the connection from being stuck on "Waiting for connection"
      if (!constraints.audio && !constraints.video) {
        const tracks = [];
        const dummyAudio = createEmptyAudioTrack();
        const dummyVideo = createEmptyVideoTrack({ width: 640, height: 480 });
        if (dummyAudio) tracks.push(dummyAudio);
        if (dummyVideo) tracks.push(dummyVideo);
        
        await updateCameraStream(new MediaStream(tracks));
        setIsScreenSharing(false);
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
          getDevices();
        }
        return;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Media API requires HTTPS or Localhost");
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      await updateCameraStream(stream);
      setIsScreenSharing(false);
      
      getDevices();
    } catch (err) {
      console.error("Failed to start media devices", err);
      showMediaError(err.name === 'NotAllowedError' ? 'Permission Denied' : err.message);
    }
  };
  startCameraRef.current = startCamera;

  useEffect(() => {
    startCameraRef.current?.();
  }, []);

  useEffect(() => () => {
    activeDisplayStreamRef.current?.getTracks().forEach(track => track.stop());
    activeDisplayStreamRef.current = null;
    screenAudioTrackRef.current = null;
    const moviePlayer = moviePlayerRef.current;
    if (moviePlayer) {
      moviePlayer.pause();
      moviePlayer.removeAttribute('src');
      moviePlayer.removeAttribute('crossorigin');
      moviePlayer.load();
    }
    if (movieObjectUrlRef.current) URL.revokeObjectURL(movieObjectUrlRef.current);
    movieObjectUrlRef.current = null;
    window.clearTimeout(mediaErrorTimerRef.current);
    mediaErrorTimerRef.current = null;
    window.clearTimeout(movieSeekResumeTimerRef.current);
    movieSeekResumeTimerRef.current = null;
  }, []);

  useEffect(() => {
    const player = moviePlayerRef.current;
    if (player) player.volume = movieVolume / 100;
  }, [movieVolume]);

  const getDevices = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      const videoInputs = devices.filter(device => device.kind === 'videoinput');
      const monitorInputs = audioInputs.filter(
        device => isMonitorSource(device) && !isVirtualAudioSource(device),
      );
      setAudioDevices(audioInputs.filter(device => !isMonitorSource(device)));
      setVideoDevices(videoInputs);
      setDesktopAudioDevices(monitorInputs);
      setSelectedDesktopAudioDevice(current => (
        current && !monitorInputs.some(device => device.deviceId === current) ? '' : current
      ));
      
      // If we already have an active audio track, set the selected device ID to match it
      if (localStream) {
        const activeAudioTrack = localStream.getAudioTracks()[0];
        if (activeAudioTrack) {
          const activeDevice = audioInputs.find(d => d.label === activeAudioTrack.label);
          if (activeDevice) setSelectedAudioDevice(activeDevice.deviceId);
        }
        const activeVideoTrack = localStream.getVideoTracks()[0];
        if (activeVideoTrack) {
          const activeDevice = videoInputs.find(d => d.label === activeVideoTrack.label);
          if (activeDevice) setSelectedVideoDevice(activeDevice.deviceId);
        }
      }
    } catch (err) {
      console.error("Error enumerating devices", err);
    }
  };

  const handleAudioDeviceChange = async (e) => {
    const deviceId = e.target.value;
    setSelectedAudioDevice(deviceId);
    
    // Only acquire the hardware track immediately if the microphone is currently ON
    if (!isMuted) {
      try {
        const newAudioStream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceId } }
        });
        const newAudioTrack = newAudioStream.getAudioTracks()[0];
        
        if (localStream) {
          const oldAudioTrack = localStream.getAudioTracks()[0];
          if (oldAudioTrack) oldAudioTrack.stop();
          
          const videoTrack = localStream.getVideoTracks()[0];
          const tracks = [];
          if (videoTrack) tracks.push(videoTrack);
          tracks.push(newAudioTrack);
          
          const combinedStream = new MediaStream(tracks);
          await updateCameraStream(combinedStream);
        }
      } catch (err) {
        console.error("Failed to change audio device", err);
      }
    }
  };

  const handleVideoDeviceChange = async (event) => {
    const deviceId = event.target.value;
    setSelectedVideoDevice(deviceId);
    if (isCameraOff) return;

    try {
      dismissMediaError();
      const newVideoStream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      const newVideoTrack = newVideoStream.getVideoTracks()[0];
      if (!newVideoTrack) throw new Error('The selected camera did not provide a video track');

      const oldVideoTracks = localStream?.getVideoTracks() || [];
      const audioTracks = localStream?.getAudioTracks() || [];
      await updateCameraStream(new MediaStream([...audioTracks, newVideoTrack]));
      oldVideoTracks.forEach(track => track.stop());
      getDevices();
    } catch (error) {
      console.error('Failed to change camera device', error);
      showMediaError(error.name === 'NotAllowedError' ? 'Camera Permission Denied' : error.message);
    }
  };

  const toggleMute = async () => {
    if (!isMuted) {
      // Turn OFF physical hardware completely
      if (localStream) {
        localStream.getAudioTracks().forEach(track => {
          track.stop(); // Kills the physical microphone stream
          localStream.removeTrack(track);
        });

        const nextStream = new MediaStream(localStream.getTracks());
        await updateCameraStream(nextStream);
      }
      setIsMuted(true);
    } else {
      // Turn ON physical hardware
      try {
        dismissMediaError();
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Media API requires HTTPS or Localhost");
        }
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: selectedAudioDevice ? { deviceId: { exact: selectedAudioDevice } } : true
        });
        const newAudioTrack = newStream.getAudioTracks()[0];
        
        if (localStream) {
          const tracks = localStream.getTracks();
          const oldAudio = tracks.find(t => t.kind === 'audio');
          if (oldAudio) {
            oldAudio.stop();
            tracks.splice(tracks.indexOf(oldAudio), 1);
          }
          tracks.push(newAudioTrack);
          await updateCameraStream(new MediaStream(tracks));
        } else {
          await updateCameraStream(newStream);
        }
        setIsMuted(false);
        
        // Refresh device labels now that we definitely have active permissions
        getDevices();
      } catch (err) {
        console.error("Failed to turn on microphone hardware", err);
        showMediaError(err.name === 'NotAllowedError' ? 'Microphone Permission Denied' : err.message);
      }
    }
  };

  const toggleCamera = async () => {
    if (!isCameraOff) {
      // Turn OFF physical hardware completely
      if (localStream) {
        const tracks = localStream.getTracks();
        const oldVideo = tracks.find(t => t.kind === 'video');
        if (oldVideo) {
          oldVideo.stop();
          tracks.splice(tracks.indexOf(oldVideo), 1);
        }
        
        // Add dummy track to keep the WebRTC pipeline alive (replaceTrack(null) breaks Safari/Chrome)
        const dummyVideo = createEmptyVideoTrack({ width: 640, height: 480 });
        if (dummyVideo) tracks.push(dummyVideo);
        
        await updateCameraStream(new MediaStream(tracks));
        
        setIsCameraOff(true);
        sendControlMessage({ type: 'camera-toggle', isCameraOff: true });
      }
    } else {
      // Turn ON physical hardware
      try {
        dismissMediaError();
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Media API requires HTTPS or Localhost");
        }
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            ...(selectedVideoDevice
              ? { deviceId: { exact: selectedVideoDevice } }
              : { facingMode: 'user' }),
          },
        });
        const newVideoTrack = newStream.getVideoTracks()[0];
        
        if (localStream) {
          const tracks = localStream.getTracks();
          const oldVideo = tracks.find(t => t.kind === 'video');
          if (oldVideo) {
            oldVideo.stop();
            tracks.splice(tracks.indexOf(oldVideo), 1);
          }
          tracks.push(newVideoTrack);
          await updateCameraStream(new MediaStream(tracks));
        } else {
          await updateCameraStream(newStream);
        }
        setIsCameraOff(false);
        sendControlMessage({ type: 'camera-toggle', isCameraOff: false });
        getDevices();
      } catch (err) {
        console.error("Failed to turn on camera hardware", err);
        showMediaError(err.name === 'NotAllowedError' ? 'Camera Permission Denied' : err.message);
      }
    }
  };

  const applyScreenQuality = async (preset, nextContentType = contentTypeRef.current) => {
    const displayStream = activeDisplayStreamRef.current || localScreenStream;
    const videoTrack = displayStream?.getVideoTracks()[0];
    if (!videoTrack || !preset) return;

    const contentHint = nextContentType === 'movie' ? 'motion' : nextContentType;
    videoTrack.contentHint = contentHint;

    if (videoTrack.applyConstraints) {
      const constraints = getTrackQualityConstraints(preset, nextContentType);
      try {
        await videoTrack.applyConstraints(constraints);
      } catch (error) {
        console.warn('The browser could not apply the requested capture constraints', error);
      }
    }

    const capture = readCaptureMetrics(videoTrack);
    setScreenMetrics(current => (
      sameVideoMetrics(current.capture, capture) ? current : { ...current, capture }
    ));

    const sender = getSenderRef.current('video', true);
    if (!sender) return;

    try {
      const params = sender.getParameters();
      if (!params.encodings?.length) params.encodings = [{}];
      const encoding = params.encodings[0];
      const scaleByWidth = !preset.lossless && capture.width && preset.width
        ? capture.width / preset.width
        : 1;
      const scaleByHeight = !preset.lossless && capture.height && preset.height
        ? capture.height / preset.height
        : 1;

      encoding.maxBitrate = preset.bitrate;
      encoding.maxFramerate = preset.frameRate;
      encoding.scaleResolutionDownBy = Math.max(1, scaleByWidth, scaleByHeight);
      params.degradationPreference = contentHint === 'motion'
        ? 'maintain-framerate'
        : 'maintain-resolution';
      await sender.setParameters(params);
    } catch (error) {
      console.warn('The browser could not apply all screen sender parameters', error);
    } finally {
      screenQualitySenderRef.current = sender;
    }
  };
  applyScreenQualityRef.current = applyScreenQuality;

  useEffect(() => {
    if (!isScreenSharing || localShareSource?.deliveryMode === 'direct') return undefined;

    let disposed = false;
    let sampling = false;

    const sampleScreenSender = async () => {
      if (sampling) return;
      sampling = true;

      try {
        const sender = getSenderRef.current('video', true);
        if (!sender?.getStats) return;
        if (screenQualitySenderRef.current !== sender) {
          const adaptiveContentType = localShareSource?.kind === 'movie' ? 'movie' : contentTypeRef.current;
          const currentPreset = qualityRef.current === 'auto'
            ? getAutoQualityPreset(adaptiveContentType, autoQualityStateRef.current.index)
            : QUALITY_PRESETS[qualityRef.current];
          await applyScreenQualityRef.current(currentPreset, adaptiveContentType);
        }
        const report = await sender.getStats();
        if (disposed) return;

        const summary = summarizeScreenSenderStats(report, screenStatsSamplesRef.current);
        screenStatsSamplesRef.current = summary.samples;
        if (!summary.stats) return;

        setScreenMetrics(current => (
          sameVideoMetrics(current.outbound, summary.stats)
            ? current
            : { ...current, outbound: summary.stats }
        ));

        if (qualityRef.current !== 'auto') return;
        const adaptiveContentType = localShareSource?.kind === 'movie' ? 'movie' : contentTypeRef.current;
        const profiles = AUTO_QUALITY_PROFILES[adaptiveContentType] || AUTO_QUALITY_PROFILES.motion;
        const previousAutoState = autoQualityStateRef.current;
        const nextAutoState = advanceAutoQuality(
          previousAutoState,
          summary.stats,
          Date.now(),
          profiles.length,
        );
        autoQualityStateRef.current = nextAutoState;

        if (nextAutoState.index !== previousAutoState.index) {
          setAutoQualityIndex(nextAutoState.index);
          await applyScreenQualityRef.current(
            getAutoQualityPreset(adaptiveContentType, nextAutoState.index),
            adaptiveContentType,
          );
        }
      } catch (error) {
        console.warn('Could not sample screen sender statistics', error);
      } finally {
        sampling = false;
      }
    };

    sampleScreenSender();
    const intervalId = window.setInterval(sampleScreenSender, 2000);
    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [isScreenSharing, localShareSource?.deliveryMode, localShareSource?.kind]);

  const handleQualityChange = async (event) => {
    const nextQuality = event.target.value;
    qualityRef.current = nextQuality;
    setQuality(nextQuality);

    let preset = QUALITY_PRESETS[nextQuality];
    if (nextQuality === 'auto') {
      const nextAutoState = createAutoQualityState();
      autoQualityStateRef.current = nextAutoState;
      setAutoQualityIndex(nextAutoState.index);
      const adaptiveContentType = localShareSource?.kind === 'movie' ? 'movie' : contentTypeRef.current;
      preset = getAutoQualityPreset(adaptiveContentType, nextAutoState.index);
    }

    if (isScreenSharing) {
      const adaptiveContentType = localShareSource?.kind === 'movie' ? 'movie' : contentTypeRef.current;
      await applyScreenQuality(preset, adaptiveContentType);
    }
  };

  const handleContentTypeChange = async (event) => {
    const nextContentType = event.target.value;
    contentTypeRef.current = nextContentType;
    setContentType(nextContentType);

    let preset = QUALITY_PRESETS[qualityRef.current];
    if (qualityRef.current === 'auto') {
      const nextAutoState = createAutoQualityState();
      autoQualityStateRef.current = nextAutoState;
      setAutoQualityIndex(nextAutoState.index);
      preset = getAutoQualityPreset(nextContentType, nextAutoState.index);
    }

    if (isScreenSharing) await applyScreenQuality(preset, nextContentType);
  };

  const stopScreenShare = async ({ preserveMovieSource = false } = {}) => {
    if (stoppingShareRef.current) return;
    stoppingShareRef.current = true;

    const wasMovieShare = localShareSourceRef.current?.kind === 'movie';
    if (wasMovieShare) {
      // Stop source playback before awaiting sender replacement. Otherwise the
      // hidden source can keep playing while WebRTC cleanup is in progress.
      moviePlayerRef.current?.pause();
      window.clearTimeout(movieSeekResumeTimerRef.current);
      movieSeekResumeTimerRef.current = null;
    }
    const displayStream = activeDisplayStreamRef.current || localScreenStream;
    const screenVideoTrack = displayStream?.getVideoTracks()[0];
    if (screenVideoTrack) screenVideoTrack.onended = null;
    if (screenAudioTrackRef.current) screenAudioTrackRef.current.onended = null;
    screenAudioTrackRef.current = null;

    try {
      await Promise.all([
        setSharedContentAudioTrack(null),
        setScreenStream(null),
      ]);
    } catch (error) {
      console.warn('Failed to clear a shared-content sender', error);
      showMediaError('The share stopped, but one outgoing media sender could not be reset');
    } finally {
      displayStream?.getTracks().forEach(track => track.stop());
      activeDisplayStreamRef.current = null;
      screenStatsSamplesRef.current = new Map();
      screenQualitySenderRef.current = null;
      autoQualityStateRef.current = createAutoQualityState();
      setAutoQualityIndex(AUTO_QUALITY_START_INDEX);
      setScreenMetrics({ capture: null, outbound: null });
      setScreenAudioStatus('idle');
      setIsScreenSharing(false);
      sendControlMessage({ type: 'screen-toggle', isScreenSharing: false });
      setLocalShareSource(null);
      if (!preserveMovieSource && wasMovieShare) clearMovieSource();
      stoppingShareRef.current = false;
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      await stopScreenShare();
      return;
    }

    let capturedStream = null;
    let shareStarted = false;

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error("Screen sharing requires HTTPS or Localhost");
      }
      
      const nextAutoState = createAutoQualityState();
      if (quality === 'auto') {
        autoQualityStateRef.current = nextAutoState;
        setAutoQualityIndex(nextAutoState.index);
      }
      screenQualitySenderRef.current = null;
      const preset = quality === 'auto'
        ? getAutoQualityPreset(contentType, nextAutoState.index)
        : QUALITY_PRESETS[quality];
      
      const videoConstraints = preset.lossless
        ? { frameRate: { ideal: preset.frameRate, max: preset.frameRate } }
        : {
            width: { ideal: preset.width, max: preset.width },
            height: { ideal: preset.height, max: preset.height },
            frameRate: { ideal: preset.frameRate, max: preset.frameRate },
          };

      dismissMediaError();
      capturedStream = await navigator.mediaDevices.getDisplayMedia({
        video: videoConstraints,
        audio: {
          suppressLocalAudioPlayback: false,
          restrictOwnAudio: true,
        },
        systemAudio: 'include',
        windowAudio: 'system',
        surfaceSwitching: 'include',
        selfBrowserSurface: 'exclude',
      });

      const videoTrack = capturedStream.getVideoTracks()[0];
      if (!videoTrack) throw new Error('The selected source did not provide a video track');
      videoTrack.contentHint = contentType;
      setScreenMetrics({ capture: readCaptureMetrics(videoTrack), outbound: null });
      screenStatsSamplesRef.current = new Map();

      let screenAudioTrack = capturedStream.getAudioTracks()[0] || null;
      let audioSource = screenAudioTrack ? 'native' : 'unavailable';

      if (!screenAudioTrack && selectedDesktopAudioDevice) {
        try {
          const monitorStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: { exact: selectedDesktopAudioDevice },
              channelCount: { ideal: 2 },
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
          });
          screenAudioTrack = monitorStream.getAudioTracks()[0] || null;
          if (screenAudioTrack) {
            screenAudioTrack.contentHint = 'music';
            capturedStream.addTrack(screenAudioTrack);
            audioSource = 'monitor';
          }
        } catch (error) {
          console.warn('The selected desktop-audio monitor could not be captured', error);
        }
      }

      activeDisplayStreamRef.current = capturedStream;
      screenAudioTrackRef.current = screenAudioTrack;
      setScreenAudioStatus(audioSource);

      if (screenAudioTrack) {
        screenAudioTrack.onended = () => {
          if (screenAudioTrackRef.current !== screenAudioTrack) return;
          screenAudioTrackRef.current = null;
          setScreenAudioStatus('unavailable');
          setSharedContentAudioTrack(null).catch(error => {
            console.warn('Failed to clear shared audio after it ended', error);
          });
        };
      }

      await setSharedContentAudioTrack(screenAudioTrack);
      await setScreenStream(capturedStream);
      setIsScreenSharing(true);
      setLocalShareSource({ kind: 'screen', name: null, duration: null, isPlaying: true });
      sendControlMessage({ type: 'screen-toggle', isScreenSharing: true, source: 'screen' });
      shareStarted = true;
      setActiveSettingsMenu(null);

      videoTrack.onended = () => {
        stopScreenShare().catch(error => console.warn('Failed to stop screen sharing', error));
      };

      await applyScreenQuality(preset, contentType);
      
    } catch (err) {
      console.error("Failed to share screen", err);
      if (!shareStarted) {
        activeDisplayStreamRef.current = null;
        screenAudioTrackRef.current = null;
        screenStatsSamplesRef.current = new Map();
        screenQualitySenderRef.current = null;
        setScreenMetrics({ capture: null, outbound: null });
        setScreenAudioStatus('idle');
        setSharedContentAudioTrack(null).catch(audioError => {
          console.warn('Failed to clear shared audio after screen-share error', audioError);
        });
        capturedStream?.getTracks().forEach(track => track.stop());
        setIsScreenSharing(false);
        showMediaError(err.name === 'NotAllowedError' ? 'Screen sharing permission denied' : err.message);
      }
    }
  };

  const handleMovieSelection = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!connected) {
      showMediaError('Wait for the participant to connect before sharing a movie');
      event.target.value = '';
      return;
    }

    const player = moviePlayerRef.current;
    const canCaptureMovie = typeof player?.captureStream === 'function'
      || typeof player?.mozCaptureStream === 'function';
    if (!canCaptureMovie) {
      showMediaError('This browser cannot stream a local movie. Try current Chrome or Firefox, or share a browser tab with audio');
      event.target.value = '';
      return;
    }

    try {
      dismissMediaError();
      if (movieObjectUrlRef.current) URL.revokeObjectURL(movieObjectUrlRef.current);
      const objectUrl = URL.createObjectURL(file);
      movieObjectUrlRef.current = objectUrl;
      player.removeAttribute('crossorigin');
      player.src = objectUrl;
      player.load();
      await waitForMovieMetadata(player);

      const audioTracks = getNativeAudioTrackOptions(player);
      const activeAudioTrack = audioTracks.find(track => track.enabled)?.index ?? 0;
      setMovieAudioTracks(audioTracks);
      setSelectedMovieAudioTrack(activeAudioTrack);
      const subtitleTracks = getNativeSubtitleTrackOptions(player);
      const activeSubtitleTrack = subtitleTracks.find(track => track.active)?.index
        ?? subtitleTracks[0]?.index
        ?? null;
      selectedNativeSubtitleTrackRef.current = activeSubtitleTrack;
      setSelectedNativeSubtitleTrack(activeSubtitleTrack);
      nativeSubtitleTracksRef.current = subtitleTracks;
      setNativeSubtitleTracks(subtitleTracks);
      if (activeSubtitleTrack != null) selectNativeSubtitleTrack(player, activeSubtitleTrack, true);

      const movie = {
        name: getMovieDisplayName(file.name),
        duration: Number.isFinite(player.duration) ? player.duration : 0,
        sourceType: 'file',
        container: file.name.split('.').at(-1)?.toLowerCase() || '',
        ...getMovieVideoGeometry(player),
      };
      setSelectedMovie(movie);
      setMovieProgress({ currentTime: 0, duration: movie.duration, isPlaying: false });
      setActiveSettingsMenu(null);
      setShowMovieSourcePicker(false);
    } catch (error) {
      clearMovieSource();
      showMediaError(error.message || 'The selected movie could not be opened');
    }
  };

  const handleDirectMediaSubmit = async (event) => {
    event.preventDefault();
    if (!connected) {
      showMediaError('Wait for the participant to connect before sharing a movie');
      return;
    }

    const player = moviePlayerRef.current;
    const canCaptureMovie = typeof player?.captureStream === 'function'
      || typeof player?.mozCaptureStream === 'function';

    try {
      dismissMediaError();
      setIsLoadingDirectMedia(true);
      const normalizedUrl = normalizeDirectMediaUrl(directMediaUrl);
      if (movieObjectUrlRef.current) URL.revokeObjectURL(movieObjectUrlRef.current);
      movieObjectUrlRef.current = null;
      player.pause();
      let deliveryMode = canCaptureMovie ? 'relay' : 'direct';
      if (canCaptureMovie) {
        player.crossOrigin = 'anonymous';
        player.src = normalizedUrl;
        player.load();
      }
      try {
        if (!canCaptureMovie) throw new Error('Media-element capture is unavailable.');
        await waitForMovieMetadata(player, {
          errorMessage: 'The media server did not permit CORS playback for WebRTC relay.',
        });
      } catch {
        // VLC is not subject to browser CORS. Retry without CORS so both peers
        // can fetch and synchronize the URL instead of relaying captured frames.
        player.pause();
        player.removeAttribute('crossorigin');
        player.src = normalizedUrl;
        player.load();
        await waitForMovieMetadata(player, {
          errorMessage: 'This direct URL could not be played by the browser. It may use an unsupported codec, block browser requests, require cookies, redirect to a webpage, or be blocked as mixed content.',
        });
        deliveryMode = 'direct';
      }

      const audioTracks = getNativeAudioTrackOptions(player);
      const activeAudioTrack = audioTracks.find(track => track.enabled)?.index ?? 0;
      setMovieAudioTracks(audioTracks);
      setSelectedMovieAudioTrack(activeAudioTrack);
      const subtitleTracks = getNativeSubtitleTrackOptions(player);
      const activeSubtitleTrack = subtitleTracks.find(track => track.active)?.index
        ?? subtitleTracks[0]?.index
        ?? null;
      selectedNativeSubtitleTrackRef.current = activeSubtitleTrack;
      setSelectedNativeSubtitleTrack(activeSubtitleTrack);
      nativeSubtitleTracksRef.current = subtitleTracks;
      setNativeSubtitleTracks(subtitleTracks);
      if (activeSubtitleTrack != null) selectNativeSubtitleTrack(player, activeSubtitleTrack, true);

      const movie = {
        name: getDirectMediaDisplayName(normalizedUrl),
        duration: Number.isFinite(player.duration) ? player.duration : 0,
        sourceType: 'url',
        url: normalizedUrl,
        deliveryMode,
        ...getMovieVideoGeometry(player),
      };
      setSelectedMovie(movie);
      setMovieProgress({ currentTime: 0, duration: movie.duration, isPlaying: false });
      setDirectMediaUrl('');
      setShowMovieSourcePicker(false);
      setActiveSettingsMenu(null);
    } catch (error) {
      player?.removeAttribute('src');
      player?.removeAttribute('crossorigin');
      player?.load();
      setSelectedMovie(null);
      showMediaError(error.message || 'The direct video URL could not be loaded');
    } finally {
      setIsLoadingDirectMedia(false);
    }
  };

  const startMovieShare = async () => {
    const player = moviePlayerRef.current;
    if (!player || !selectedMovie) return;

    let capturedStream = null;
    try {
      dismissMediaError();
      if (isScreenSharing) await stopScreenShare({ preserveMovieSource: true });

      if (selectedMovie.deliveryMode === 'direct') {
        await player.play();
        await waitForMovieFrame(player);
        const source = {
          kind: 'movie',
          name: selectedMovie.name,
          duration: selectedMovie.duration,
          deliveryMode: 'direct',
          url: selectedMovie.url,
          ...getMovieVideoGeometry(player),
          currentTime: player.currentTime,
          isPlaying: true,
          subtitleText: getCurrentMovieSubtitleText(player),
          subtitlesAvailable: Boolean(selectedSubtitleRef.current?.cues.length || nativeSubtitleTracksRef.current.length),
          subtitlesEnabled: subtitlesEnabledRef.current,
          subtitleTracks: selectedSubtitleRef.current ? [] : nativeSubtitleTracksRef.current,
          selectedSubtitleTrack: selectedNativeSubtitleTrackRef.current,
          audioTracks: [],
          selectedAudioTrack: 0,
        };
        activeDisplayStreamRef.current = null;
        screenAudioTrackRef.current = null;
        setScreenAudioStatus('direct');
        await setSharedContentAudioTrack(null);
        await setScreenStream(null);
        setIsScreenSharing(true);
        setLocalShareSource(source);
        sendControlMessage({ type: 'screen-toggle', isScreenSharing: true, source: 'movie', ...source });
        setMovieProgress({
          currentTime: player.currentTime,
          duration: selectedMovie.duration,
          isPlaying: true,
        });
        setActiveSettingsMenu(null);
        return;
      }

      capturedStream = getCaptureStream(player);
      if (!capturedStream) {
        throw new Error('This browser does not support capturing movie playback. Try current Chrome or Firefox, or share the browser tab with audio.');
      }

      // Capture before playback, as recommended by the media-element capture API.
      // Some browsers return an initially empty stream and add its tracks later.
      await player.play();
      await waitForMovieFrame(player);
      const detectedAudioTracks = getNativeAudioTrackOptions(player);
      if (detectedAudioTracks.length) {
        const activeAudioTrack = detectedAudioTracks.find(track => track.enabled)?.index ?? 0;
        movieAudioTracksRef.current = detectedAudioTracks;
        selectedMovieAudioTrackRef.current = activeAudioTrack;
        setMovieAudioTracks(detectedAudioTracks);
        setSelectedMovieAudioTrack(activeAudioTrack);
      }
      const detectedSubtitleTracks = getNativeSubtitleTrackOptions(player);
      if (detectedSubtitleTracks.length) {
        const activeSubtitleTrack = detectedSubtitleTracks.find(track => track.active)?.index
          ?? detectedSubtitleTracks[0].index;
        selectedNativeSubtitleTrackRef.current = activeSubtitleTrack;
        setSelectedNativeSubtitleTrack(activeSubtitleTrack);
        nativeSubtitleTracksRef.current = detectedSubtitleTracks;
        setNativeSubtitleTracks(detectedSubtitleTracks);
        if (!selectedSubtitleRef.current) {
          selectNativeSubtitleTrack(player, activeSubtitleTrack, subtitlesEnabledRef.current);
        }
      }
      const videoTrack = await waitForCapturedTrack(capturedStream, 'video');
      const audioTrack = capturedStream.getAudioTracks()[0]
        || await waitForCapturedTrack(capturedStream, 'audio', { timeoutMs: 750 }).catch(() => null);

      videoTrack.contentHint = 'motion';
      if (audioTrack) audioTrack.contentHint = 'music';
      activeDisplayStreamRef.current = capturedStream;
      screenAudioTrackRef.current = audioTrack;
      setScreenAudioStatus(audioTrack ? 'native' : 'unavailable');
      setContentType('motion');
      contentTypeRef.current = 'motion';

      await setSharedContentAudioTrack(audioTrack);
      await setScreenStream(capturedStream);
      setIsScreenSharing(true);
      const source = {
        kind: 'movie',
        name: selectedMovie.name,
        duration: selectedMovie.duration,
        ...getMovieVideoGeometry(player),
        currentTime: player.currentTime,
        isPlaying: true,
        subtitleText: getCurrentMovieSubtitleText(player),
        subtitlesAvailable: Boolean(selectedSubtitleRef.current?.cues.length || nativeSubtitleTracksRef.current.length),
        subtitlesEnabled: subtitlesEnabledRef.current,
        subtitleTracks: selectedSubtitleRef.current ? [] : nativeSubtitleTracksRef.current,
        selectedSubtitleTrack: selectedNativeSubtitleTrackRef.current,
        audioTracks: movieAudioTracksRef.current,
        selectedAudioTrack: selectedMovieAudioTrackRef.current,
      };
      setLocalShareSource(source);
      sendControlMessage({ type: 'screen-toggle', isScreenSharing: true, source: 'movie', ...source });
      setMovieProgress(current => ({ ...current, currentTime: player.currentTime, isPlaying: true }));
      setActiveSettingsMenu(null);

      const moviePreset = qualityRef.current === 'auto'
        ? getAutoQualityPreset('movie', autoQualityStateRef.current.index)
        : QUALITY_PRESETS[qualityRef.current];
      await applyScreenQuality(moviePreset, 'movie');
    } catch (error) {
      const playbackWasSuperseded = isExpectedPlaybackInterruption(error);
      if (!playbackWasSuperseded) console.error('Failed to share movie', error);
      capturedStream?.getTracks().forEach(track => track.stop());
      activeDisplayStreamRef.current = null;
      screenAudioTrackRef.current = null;
      await setSharedContentAudioTrack(null).catch(() => {});
      await setScreenStream(null).catch(() => {});
      player.pause();
      setIsScreenSharing(false);
      setLocalShareSource(null);
      if (playbackWasSuperseded) return;
      const isMatroskaFile = selectedMovie.sourceType === 'file'
        && selectedMovie.container === 'mkv';
      const isDecodeFailure = error.message?.includes('could not decode a video frame');
      showMediaError(error.name === 'NotAllowedError'
        ? 'The browser blocked movie playback. Press Start movie again'
        : isMatroskaFile && isDecodeFailure
          ? 'This browser cannot decode the video codec inside this MKV. PairBeam can only stream frames the browser can play; use MP4 (H.264/AAC), WebM, or remux/transcode this file while the WebCodecs fallback is developed.'
          : error.message);
    }
  };

  const getCurrentMovieSubtitleText = (player) => {
    if (!subtitlesEnabledRef.current) return '';
    if (selectedSubtitleRef.current?.cues.length) {
      return getActiveSubtitleText(selectedSubtitleRef.current.cues, player.currentTime);
    }
    return selectedNativeSubtitleTrackRef.current == null
      ? ''
      : getActiveNativeSubtitleText(player, selectedNativeSubtitleTrackRef.current);
  };

  const handleMovieProgress = () => {
    const player = moviePlayerRef.current;
    if (!player || localShareSource?.kind !== 'movie') return;
    const subtitleText = getCurrentMovieSubtitleText(player);
    const state = {
      currentTime: player.currentTime,
      duration: Number.isFinite(player.duration) ? player.duration : selectedMovie?.duration || 0,
      isPlaying: !player.paused,
      subtitleText,
      subtitlesAvailable: Boolean(selectedSubtitleRef.current?.cues.length || nativeSubtitleTracksRef.current.length),
      subtitlesEnabled: subtitlesEnabledRef.current,
      subtitleTracks: selectedSubtitleRef.current ? [] : nativeSubtitleTracksRef.current,
      selectedSubtitleTrack: selectedNativeSubtitleTrackRef.current,
      audioTracks: movieAudioTracksRef.current,
      selectedAudioTrack: selectedMovieAudioTrackRef.current,
    };
    setMovieProgress(state);
    setLocalShareSource(current => current?.kind === 'movie' ? { ...current, ...state } : current);

    const now = performance.now();
    if (
      now - lastMovieBroadcastAtRef.current >= 1000
      || subtitleText !== lastBroadcastSubtitleRef.current
    ) {
      lastMovieBroadcastAtRef.current = now;
      lastBroadcastSubtitleRef.current = subtitleText;
      sendControlMessage({ type: 'movie-state', ...state });
    }
  };

  const sendMovieState = () => {
    const player = moviePlayerRef.current;
    if (!player || localShareSource?.kind !== 'movie') return;
    const state = {
      isPlaying: !player.paused,
      currentTime: player.currentTime,
      duration: Number.isFinite(player.duration) ? player.duration : selectedMovie?.duration || 0,
      subtitleText: getCurrentMovieSubtitleText(player),
      subtitlesAvailable: Boolean(selectedSubtitleRef.current?.cues.length || nativeSubtitleTracksRef.current.length),
      subtitlesEnabled: subtitlesEnabledRef.current,
      subtitleTracks: selectedSubtitleRef.current ? [] : nativeSubtitleTracksRef.current,
      selectedSubtitleTrack: selectedNativeSubtitleTrackRef.current,
      audioTracks: movieAudioTracksRef.current,
      selectedAudioTrack: selectedMovieAudioTrackRef.current,
    };
    setMovieProgress(current => ({ ...current, ...state }));
    setLocalShareSource(current => current?.kind === 'movie' ? { ...current, ...state } : current);
    sendControlMessage({ type: 'movie-state', ...state });
    lastMovieBroadcastAtRef.current = performance.now();
    lastBroadcastSubtitleRef.current = state.subtitleText;
  };
  sendMovieStateRef.current = sendMovieState;

  useEffect(() => {
    if (
      !movieControlRequest
      || processedMovieControlRequestRef.current === movieControlRequest.id
      || localShareSource?.kind !== 'movie'
    ) return;
    const player = moviePlayerRef.current;
    if (!player) return;
    processedMovieControlRequestRef.current = movieControlRequest.id;

    const applyRequest = async () => {
      try {
        if (['play', 'pause', 'seek'].includes(movieControlRequest.action)) {
          window.clearTimeout(movieSeekResumeTimerRef.current);
          movieSeekResumeTimerRef.current = null;
        }
        if (movieControlRequest.action === 'play') await player.play();
        if (movieControlRequest.action === 'pause') player.pause();
        if (movieControlRequest.action === 'seek' && movieControlRequest.currentTime != null) {
          player.pause();
          player.currentTime = Math.min(movieControlRequest.currentTime, player.duration || movieControlRequest.currentTime);
          if (movieControlRequest.resumeAfterSeek) {
            movieSeekResumeTimerRef.current = window.setTimeout(() => {
              movieSeekResumeTimerRef.current = null;
              if (localShareSourceRef.current?.kind !== 'movie') return;
              player.play().catch(error => {
                if (isExpectedPlaybackInterruption(error)) return;
                showMediaError(error.name === 'NotAllowedError'
                  ? 'Press play once on the source device so synchronized seeking can resume playback'
                  : error.message || 'Playback could not resume after seeking');
              });
            }, SEEK_SETTLE_DELAY_MS);
          }
        }
        if (movieControlRequest.action === 'audio-track' && movieControlRequest.trackIndex != null) {
          if (selectNativeAudioTrack(player, movieControlRequest.trackIndex)) {
            selectedMovieAudioTrackRef.current = movieControlRequest.trackIndex;
            setSelectedMovieAudioTrack(movieControlRequest.trackIndex);
          }
        }
        if (movieControlRequest.action === 'subtitles' && movieControlRequest.enabled != null) {
          subtitlesEnabledRef.current = movieControlRequest.enabled;
          setSubtitlesEnabled(movieControlRequest.enabled);
          if (!selectedSubtitleRef.current && selectedNativeSubtitleTrackRef.current != null) {
            selectNativeSubtitleTrack(
              player,
              selectedNativeSubtitleTrackRef.current,
              movieControlRequest.enabled,
            );
          }
        }
        if (movieControlRequest.action === 'subtitle-track' && movieControlRequest.trackIndex != null) {
          if (selectNativeSubtitleTrack(player, movieControlRequest.trackIndex, subtitlesEnabledRef.current)) {
            selectedNativeSubtitleTrackRef.current = movieControlRequest.trackIndex;
            setSelectedNativeSubtitleTrack(movieControlRequest.trackIndex);
          }
        }
        sendMovieStateRef.current?.();
      } catch (error) {
        if (isExpectedPlaybackInterruption(error)) return;
        showMediaError(error.name === 'NotAllowedError'
          ? 'The browser blocked remote playback. Press play on the host once, then try again'
          : error.message || 'The shared movie control failed');
      }
    };
    applyRequest();
  }, [movieControlRequest, localShareSource?.kind]);

  const handleSubtitleSelection = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const cues = parseSrt(await file.text());
      if (!cues.length) throw new Error('No valid subtitle cues were found in that SRT file');
      const subtitle = { name: getMovieDisplayName(file.name), cues };
      selectedSubtitleRef.current = subtitle;
      subtitlesEnabledRef.current = true;
      selectNativeSubtitleTrack(moviePlayerRef.current, -1, false);
      setSelectedSubtitle(subtitle);
      setSubtitlesEnabled(true);
      if (localShareSource?.kind === 'movie') sendMovieState();
    } catch (error) {
      showMediaError(error.message || 'The subtitle file could not be read');
      event.target.value = '';
    }
  };

  const handleLeaveRoom = () => {
    endCall();
    window.location.href = '/'; // Reload to clear states and show landing page
  };

  const activeAutoPreset = getAutoQualityPreset(
    localShareSource?.kind === 'movie' ? 'movie' : contentType,
    autoQualityIndex,
  );
  const screenLimitationReason = screenMetrics.outbound?.qualityLimitationReason || 'none';
  const handleSettingsMenuOpenChange = (menu, open) => {
    setActiveSettingsMenu(open ? menu : null);
    if (open) setShowMovieSourcePicker(false);
  };

  useEffect(() => {
    setFullscreenDashboardOpen(false);
    setActiveSettingsMenu(null);
    setShowMovieSourcePicker(false);
  }, [isFullscreen, setFullscreenDashboardOpen]);

  const dashboardHidden = isPresentationMode || (isFullscreen ? isIdle || !fullscreenDashboardOpen : isIdle);
  const fullscreenHandleHidden = isFullscreen && isIdle;
  const movieSourcePickerVisible = showMovieSourcePicker && localShareSource?.kind !== 'movie' && !activeSettingsMenu;

  const toggleFullscreenDashboard = () => {
    setFullscreenDashboardOpen(current => {
      if (current) {
        setActiveSettingsMenu(null);
        setShowMovieSourcePicker(false);
      }
      return !current;
    });
  };

  return (
    <TooltipProvider delayDuration={250}>
    <>
    <div
      id="call-dashboard"
      className={`absolute left-1/2 z-20 flex -translate-x-1/2 items-end gap-4 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none ${isFullscreen ? 'bottom-16' : 'bottom-4 hover:!translate-y-0 hover:!opacity-100 sm:bottom-8'} ${dashboardHidden ? 'pointer-events-none translate-y-4 opacity-0' : 'translate-y-0 opacity-100'}`}
      aria-hidden={dashboardHidden}
      inert={dashboardHidden}
    >
      <input
        ref={movieInputRef}
        type="file"
        accept="video/*,.mkv"
        className="sr-only"
        onChange={handleMovieSelection}
        aria-label="Choose a movie from your computer"
      />
      <input
        id="movie-subtitle-input"
        ref={subtitleInputRef}
        type="file"
        accept=".srt,application/x-subrip,text/plain"
        className="sr-only"
        onChange={handleSubtitleSelection}
        aria-label="Choose an SRT subtitle file"
      />
      <video
        ref={moviePlayerRef}
        className="pointer-events-none absolute size-px opacity-0"
        playsInline
        preload="auto"
        onTimeUpdate={handleMovieProgress}
        onPlay={sendMovieState}
        onPause={sendMovieState}
        onSeeked={sendMovieState}
        onEnded={() => stopScreenShare()}
        aria-hidden="true"
      />

      {localShareSource?.kind !== 'movie' ? (
        <aside
          className={`absolute bottom-20 left-1/2 flex w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-3 rounded-2xl border border-white/10 bg-[#111719]/95 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-2xl transition-[opacity,transform] will-change-transform motion-reduce:transition-none ${movieSourcePickerVisible ? 'translate-y-0 scale-100 opacity-100 duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)]' : 'pointer-events-none translate-y-3 scale-[0.975] opacity-0 duration-[170ms] ease-out'}`}
          aria-label="Choose a movie source"
          aria-hidden={!movieSourcePickerVisible}
          inert={!movieSourcePickerVisible}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-medium text-zinc-100">Share a movie</h3>
              <p className="mt-1 text-xs leading-5 text-zinc-500">Choose a local file or load a direct browser-playable video URL.</p>
            </div>
            <Button variant="ghost" size="icon" className="size-9" onClick={() => setShowMovieSourcePicker(false)} aria-label="Close movie source picker">
              <X className="size-4" />
            </Button>
          </div>

          <Button variant="secondary" className="w-full" onClick={() => movieInputRef.current?.click()}>
            <Upload className="size-4" />
            Choose a video file
          </Button>

          <Button variant="secondary" className="w-full" onClick={() => { setHasOpenedWatchCatalog(true); setShowWatchCatalog(true); setShowMovieSourcePicker(false); }}>
            <Film className="size-4" />
            Browse catalog
          </Button>

          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-white/[0.08]" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">or direct link</span>
            <span className="h-px flex-1 bg-white/[0.08]" />
          </div>

          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleDirectMediaSubmit}>
            <div className="min-w-0 flex-1">
              <label htmlFor="direct-media-url" className="sr-only">Direct video URL</label>
              <Input
                id="direct-media-url"
                type="url"
                inputMode="url"
                autoComplete="url"
                value={directMediaUrl}
                onChange={(event) => setDirectMediaUrl(event.target.value)}
                placeholder="https://example.com/movie.mp4"
                aria-describedby="direct-media-url-help"
                disabled={isLoadingDirectMedia}
              />
            </div>
            <Button type="submit" variant="active" disabled={isLoadingDirectMedia || !directMediaUrl.trim()}>
              <Link2 className="size-4" />
              {isLoadingDirectMedia ? 'Loading…' : 'Load URL'}
            </Button>
          </form>
          <p id="direct-media-url-help" className="text-[11px] leading-5 text-zinc-600">
            PairBeam first tries a one-download WebRTC relay. If CORS prevents relay, the other participant&apos;s browser loads the exact URL and PairBeam synchronizes playback. Do not use a link containing a token or secret you do not want that participant to see. YouTube, Netflix, login-protected pages, and ordinary webpage links are not supported.
          </p>
          <p className="sr-only" aria-live="polite">{isLoadingDirectMedia ? 'Loading direct video URL.' : ''}</p>
        </aside>
      ) : null}

      {hasOpenedWatchCatalog ? (
        <React.Suspense fallback={(
          showWatchCatalog ? <div className="motion-dialog-overlay fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm" role="status" aria-live="polite">
            <div className="rounded-2xl border border-border bg-panel px-5 py-4 text-sm text-muted-foreground shadow-2xl">
              Opening catalog…
            </div>
          </div> : null
        )}>
          <WatchCatalog
            open={showWatchCatalog}
            onClose={() => setShowWatchCatalog(false)}
            onProposal={item => proposeExternalWatch({
              providerId: 'vidking-extension',
              mediaType: item.mediaType,
              tmdbId: item.id,
              title: item.title,
              posterPath: item.posterPath,
              season: item.season,
              episode: item.episode,
              episodeTitle: item.episodeTitle,
            })}
          />
        </React.Suspense>
      ) : null}

      {selectedMovie && localShareSource?.kind !== 'movie' && !activeSettingsMenu && !showMovieSourcePicker ? (
        <aside className="absolute bottom-20 left-1/2 flex w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-2xl border border-white/10 bg-[#111719]/95 p-3 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-2xl" aria-label="Movie ready to share">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-teal-300/10 text-teal-200">
            <Film className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-100">{selectedMovie.name}</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {formatMediaTime(selectedMovie.duration)} · {selectedMovie.sourceType === 'url'
                ? selectedMovie.deliveryMode === 'direct'
                  ? 'both participants load this link directly'
                  : 'host relays this link over WebRTC'
                : 'stays on this device'}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => subtitleInputRef.current?.click()} aria-label="Add SRT subtitles">
            <Captions className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={clearMovieSource}>Cancel</Button>
          <Button variant="active" size="sm" onClick={startMovieShare}>
            <Play className="size-4" />
            {isScreenSharing ? 'Replace share' : 'Start movie'}
          </Button>
        </aside>
      ) : null}

      {/* Camera Error Banner */}
      {mediaError && (
        <div role="alert" className="absolute bottom-20 left-1/2 flex w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 items-start gap-3 rounded-xl border border-red-400/25 bg-red-950/95 py-2 pl-4 pr-2 text-sm text-red-100 shadow-xl backdrop-blur-md">
          <p className="min-w-0 flex-1 py-1.5">
            Media error: {mediaError}
          </p>
          <Button variant="ghost" size="icon" onClick={dismissMediaError} aria-label="Dismiss media error" className="text-red-100 hover:bg-white/10">
            <X className="size-4" />
          </Button>
        </div>
      )}

      {/* Control Bar */}
      <div className="flex max-w-[calc(100vw-1rem)] items-center gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-[#111719]/90 p-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:gap-2 sm:p-2">
        <div className="flex items-center gap-px" role="group" aria-label="Microphone controls">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button className="size-10 rounded-r-md sm:size-11" variant={isMuted ? 'destructive' : 'secondary'} size="icon" onClick={toggleMute} aria-label={isMuted ? 'Turn microphone on' : 'Mute microphone'}>
                {isMuted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isMuted ? 'Turn microphone on' : 'Mute microphone'}</TooltipContent>
          </Tooltip>
          <Popover
            open={activeSettingsMenu === 'microphone'}
            onOpenChange={open => handleSettingsMenuOpenChange('microphone', open)}
          >
            <PopoverTrigger asChild>
              <Button
                className="h-10 w-6 rounded-l-md px-0 sm:h-11 sm:w-7"
                variant={activeSettingsMenu === 'microphone' ? 'active' : 'secondary'}
                size="icon"
                aria-label="Open microphone settings"
              >
                <ChevronDown className="size-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" side="top" aria-labelledby="microphone-settings-title">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 id="microphone-settings-title" className="text-sm font-semibold text-zinc-100">Microphone</h3>
                  <p className="mt-0.5 text-[11px] text-zinc-500">Input and participant voice</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${isMuted ? 'bg-red-400/10 text-red-200' : 'bg-teal-300/10 text-teal-200'}`}>
                  {isMuted ? 'Muted' : 'On'}
                </span>
              </div>
              <label htmlFor="microphone-device" className="block text-xs font-medium text-zinc-400">
                Microphone input
                <select
                  id="microphone-device"
                  className="mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 text-xs text-white outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
                  value={selectedAudioDevice}
                  onChange={handleAudioDeviceChange}
                >
                  {audioDevices.length === 0 ? <option value="">No microphone found</option> : null}
                  {audioDevices.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Microphone ${device.deviceId.substring(0, 5)}…`}
                    </option>
                  ))}
                </select>
              </label>
              <div className="my-3 h-px bg-white/[0.08]" />
              <VolumeControl
                id="participant-playback-volume"
                icon={UserRound}
                label="Participant voice"
                description="The other participant's microphone on this device."
                value={participantVolume}
                onChange={setParticipantVolume}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex items-center gap-px" role="group" aria-label="Camera controls">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button className="size-10 rounded-r-md sm:size-11" variant={isCameraOff ? 'destructive' : 'secondary'} size="icon" onClick={toggleCamera} aria-label={isCameraOff ? 'Turn camera on' : 'Turn camera off'}>
                {isCameraOff ? <VideoOff className="size-5" /> : <Video className="size-5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isCameraOff ? 'Turn camera on' : 'Turn camera off'}</TooltipContent>
          </Tooltip>
          <Popover
            open={activeSettingsMenu === 'camera'}
            onOpenChange={open => handleSettingsMenuOpenChange('camera', open)}
          >
            <PopoverTrigger asChild>
              <Button
                className="h-10 w-6 rounded-l-md px-0 sm:h-11 sm:w-7"
                variant={activeSettingsMenu === 'camera' ? 'active' : 'secondary'}
                size="icon"
                aria-label="Open camera settings"
              >
                <ChevronDown className="size-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" side="top" aria-labelledby="camera-settings-title">
              <div className="mb-3">
                <h3 id="camera-settings-title" className="text-sm font-semibold text-zinc-100">Camera</h3>
                <p className="mt-0.5 text-[11px] text-zinc-500">Choose the camera used in this call</p>
              </div>
              <label htmlFor="camera-device" className="block text-xs font-medium text-zinc-400">
                Camera input
                <select
                  id="camera-device"
                  className="mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 text-xs text-white outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
                  value={selectedVideoDevice}
                  onChange={handleVideoDeviceChange}
                >
                  {videoDevices.length === 0 ? <option value="">No camera found</option> : null}
                  {videoDevices.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Camera ${device.deviceId.substring(0, 5)}…`}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-2 text-[11px] leading-5 text-zinc-600">
                Changing this while the camera is on switches immediately. When off, it is used next time you enable video.
              </p>
            </PopoverContent>
          </Popover>
        </div>

        <div className="mx-0.5 h-7 w-px bg-white/10 sm:mx-1" />

        <div className="flex items-center gap-px" role="group" aria-label="Screen sharing controls">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className="size-10 rounded-r-md sm:size-11"
                variant={localShareSource?.kind === 'screen' ? 'active' : 'secondary'}
                size="icon"
                onClick={toggleScreenShare}
                disabled={localShareSource?.kind === 'movie'}
                aria-label={localShareSource?.kind === 'movie'
                  ? 'Stop the movie before sharing your screen'
                  : localShareSource?.kind === 'screen'
                    ? 'Stop sharing your screen'
                    : 'Share your screen'}
              >
                <MonitorUp className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{localShareSource?.kind === 'movie' ? 'Stop the movie first' : localShareSource?.kind === 'screen' ? 'Stop sharing your screen' : 'Share your screen'}</TooltipContent>
          </Tooltip>
          <Popover
            open={activeSettingsMenu === 'screen'}
            onOpenChange={open => handleSettingsMenuOpenChange('screen', open)}
          >
            <PopoverTrigger asChild>
              <Button
                className="h-10 w-6 rounded-l-md px-0 sm:h-11 sm:w-7"
                variant={activeSettingsMenu === 'screen' ? 'active' : 'secondary'}
                size="icon"
                disabled={localShareSource?.kind === 'movie'}
                aria-label="Open screen sharing settings"
              >
                <ChevronDown className="size-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="center" side="top" aria-labelledby="screen-settings-title">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h3 id="screen-settings-title" className="text-sm font-semibold text-zinc-100">Screen sharing</h3>
                  <p className="mt-0.5 text-[11px] text-zinc-500">Quality, content, and audio</p>
                </div>
                {localShareSource?.kind === 'screen' ? (
                  <span className="rounded-full bg-teal-300/10 px-2 py-1 text-[10px] font-medium text-teal-200">Live</span>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label htmlFor="shared-content-quality" className="text-xs font-medium text-zinc-400">
                  Quality
                  <select
                    id="shared-content-quality"
                    className="mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-white/[0.06] px-2.5 text-xs text-white outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
                    value={quality}
                    onChange={handleQualityChange}
                  >
                    {Object.entries(QUALITY_PRESETS).map(([key, value]) => (
                      <option key={key} value={key}>{value.label}</option>
                    ))}
                  </select>
                </label>
                <label htmlFor="shared-content-type" className="text-xs font-medium text-zinc-400">
                  Content
                  <select
                    id="shared-content-type"
                    className="mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-white/[0.06] px-2.5 text-xs text-white outline-none focus-visible:ring-2 focus-visible:ring-teal-300 disabled:opacity-50"
                    value={contentType}
                    onChange={handleContentTypeChange}
                    disabled={localShareSource?.kind === 'movie'}
                  >
                    <option value="motion">Motion</option>
                    <option value="detail">Text / detail</option>
                  </select>
                </label>
              </div>

              <div className="my-3 h-px bg-white/[0.08]" />
              <VolumeControl
                id="screen-playback-volume"
                icon={MonitorPlay}
                label="Shared screen volume"
                description="Incoming audio from the participant's screen on this device."
                value={screenVolume}
                onChange={setScreenVolume}
              />

              <div className="my-3 h-px bg-white/[0.08]" />
              <label htmlFor="desktop-audio-source" className="block text-xs font-medium text-zinc-400">
                Screen audio source
                <select
                  id="desktop-audio-source"
                  className="mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 text-xs text-white outline-none focus-visible:ring-2 focus-visible:ring-teal-300 disabled:opacity-50"
                  value={selectedDesktopAudioDevice}
                  onChange={event => setSelectedDesktopAudioDevice(event.target.value)}
                  disabled={desktopAudioDevices.length === 0}
                >
                  <option value="">Browser share picker</option>
                  {desktopAudioDevices.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || 'Desktop audio monitor'}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mt-1.5 text-[11px] leading-5 text-zinc-600">
                {desktopAudioDevices.length > 0
                  ? 'A Linux monitor captures all desktop output and can cause call echo.'
                  : 'No PipeWire/PulseAudio monitor is exposed; use the browser picker audio option.'}
              </p>
              <p role="status" className="mt-2 rounded-lg bg-white/[0.035] px-2.5 py-2 text-[11px] leading-5 text-zinc-500">
                {SCREEN_AUDIO_COPY[screenAudioStatus]}
              </p>

              <details className="mt-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-2.5 py-2 text-[11px] text-zinc-500">
                <summary className="cursor-pointer select-none font-medium text-zinc-400">Quality details</summary>
                <div className="mt-2 space-y-1.5" aria-live="polite">
                  {quality === 'auto' ? (
                    <div className="flex justify-between gap-3"><span>Auto target</span><span className="text-zinc-300">{activeAutoPreset.label}</span></div>
                  ) : null}
                  <div className="flex justify-between gap-3"><span>Captured</span><span className="text-right text-zinc-300">{formatVideoMetrics(screenMetrics.capture)}</span></div>
                  <div className="flex justify-between gap-3"><span>Sending</span><span className="text-right text-zinc-300">{formatVideoMetrics(screenMetrics.outbound)}</span></div>
                  <div className="flex justify-between gap-3"><span>{LIMITATION_COPY[screenLimitationReason] || LIMITATION_COPY.other}</span><span className="text-zinc-300">{screenMetrics.outbound?.sendBitrateKbps ? `${(screenMetrics.outbound.sendBitrateKbps / 1000).toFixed(1)} Mbps` : 'Measuring…'}</span></div>
                </div>
              </details>
            </PopoverContent>
          </Popover>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="size-10 sm:size-11"
              variant={localShareSource?.kind === 'movie' ? 'active' : 'secondary'}
              size="icon"
              onClick={() => {
                if (localShareSource?.kind === 'movie') stopScreenShare();
                else {
                  setActiveSettingsMenu(null);
                  setShowMovieSourcePicker(value => !value);
                }
              }}
              aria-label={localShareSource?.kind === 'movie' ? 'Stop sharing movie' : showMovieSourcePicker ? 'Close movie source picker' : 'Share a movie from a file or direct link'}
              aria-expanded={localShareSource?.kind === 'movie' ? undefined : showMovieSourcePicker}
            >
              <Film className="size-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{localShareSource?.kind === 'movie' ? 'Stop movie' : 'Share a movie'}</TooltipContent>
        </Tooltip>

        <div className="mx-0.5 h-7 w-px bg-white/10 sm:mx-1" />

        <Button variant="destructive" onClick={handleLeaveRoom} className="size-10 px-0 sm:h-11 sm:w-auto sm:px-4">
          <PhoneOff className="size-5" />
          <span className="hidden sm:inline">Leave</span>
        </Button>
      </div>
    </div>
    {isFullscreen && !isPresentationMode ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="secondary"
            size="icon"
            className={`absolute bottom-3 left-1/2 z-[70] size-10 -translate-x-1/2 rounded-full border-white/15 bg-[#111719]/92 shadow-[0_12px_32px_rgba(0,0,0,0.42)] backdrop-blur-xl transition-opacity duration-200 ease-out motion-reduce:transition-none ${fullscreenHandleHidden ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
            onClick={toggleFullscreenDashboard}
            aria-label={fullscreenDashboardOpen ? 'Hide call dashboard' : 'Show call dashboard'}
            aria-controls="call-dashboard"
            aria-expanded={fullscreenDashboardOpen}
            aria-hidden={fullscreenHandleHidden}
            inert={fullscreenHandleHidden}
          >
            {fullscreenDashboardOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {fullscreenDashboardOpen ? 'Hide call controls' : 'Show call controls'}
        </TooltipContent>
      </Tooltip>
    ) : null}
    </>
    </TooltipProvider>
  );
};
