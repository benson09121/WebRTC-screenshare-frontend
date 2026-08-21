import React, { useState, useEffect, useRef } from 'react';
import { useWebRTC } from '../context/useWebRTC';
import { Film, Link2, Mic, MicOff, Pause, Play, Video, VideoOff, MonitorPlay, MonitorUp, PhoneOff, Settings, Upload, UserRound, Volume2, VolumeX, X } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { createEmptyAudioTrack, createEmptyVideoTrack } from '../lib/mediaTracks';
import {
  formatMediaTime,
  getCaptureStream,
  getDirectMediaDisplayName,
  getMovieDisplayName,
  normalizeDirectMediaUrl,
  waitForMovieMetadata,
} from '../lib/movieShare';
import {
  AUTO_QUALITY_PROFILES,
  AUTO_QUALITY_START_INDEX,
  advanceAutoQuality,
  createAutoQualityState,
  getAutoQualityPreset,
  summarizeScreenSenderStats,
} from '../lib/screenShareQuality';

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
};

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
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.05] text-zinc-400">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor={id} className="text-sm font-medium text-zinc-200">{label}</label>
            <span className="shrink-0 font-mono text-xs text-zinc-500">{value}%</span>
          </div>
          <p id={`${id}-description`} className="mt-0.5 text-[11px] leading-4 text-zinc-600">
            {description}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2.5">
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
    </div>
  );
};

export const ControlPanel = ({ isIdle }) => {
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
    isPresentationMode,
    localShareSource,
    setLocalShareSource,
    participantVolume,
    setParticipantVolume,
    screenVolume,
    setScreenVolume,
    movieVolume,
    setMovieVolume,
    connected,
  } = useWebRTC();
  
  const [showSettings, setShowSettings] = useState(false);
  const [quality, setQuality] = useState('auto');
  const [contentType, setContentType] = useState('motion'); // 'motion' (Movie) or 'detail' (Text)
  const [mediaError, setMediaError] = useState(null);
  const [autoQualityIndex, setAutoQualityIndex] = useState(AUTO_QUALITY_START_INDEX);
  const [screenMetrics, setScreenMetrics] = useState({ capture: null, outbound: null });
  
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState('');
  const [desktopAudioDevices, setDesktopAudioDevices] = useState([]);
  const [selectedDesktopAudioDevice, setSelectedDesktopAudioDevice] = useState('');
  const [screenAudioStatus, setScreenAudioStatus] = useState('idle');
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [movieProgress, setMovieProgress] = useState({ currentTime: 0, duration: 0, isPlaying: false });
  const [showMovieSourcePicker, setShowMovieSourcePicker] = useState(false);
  const [directMediaUrl, setDirectMediaUrl] = useState('');
  const [isLoadingDirectMedia, setIsLoadingDirectMedia] = useState(false);
  const startCameraRef = useRef(null);
  const activeDisplayStreamRef = useRef(null);
  const screenAudioTrackRef = useRef(null);
  const movieInputRef = useRef(null);
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
  getSenderRef.current = getSender;
  qualityRef.current = quality;
  contentTypeRef.current = contentType;

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
    setShowMovieSourcePicker(false);
    setIsLoadingDirectMedia(false);
    if (movieInputRef.current) movieInputRef.current.value = '';
  };

  const startCamera = async () => {
    try {
      dismissMediaError();
      
      const constraints = {};
      
      if (!isMuted) {
        constraints.audio = selectedAudioDevice ? { deviceId: { exact: selectedAudioDevice } } : true;
      }
      if (!isCameraOff) {
        constraints.video = { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" };
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
  }, []);

  const getDevices = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      const monitorInputs = audioInputs.filter(
        device => isMonitorSource(device) && !isVirtualAudioSource(device),
      );
      setAudioDevices(audioInputs.filter(device => !isMonitorSource(device)));
      setDesktopAudioDevices(monitorInputs);
      setSelectedDesktopAudioDevice(current => (
        current && !monitorInputs.some(device => device.deviceId === current) ? '' : current
      ));
      
      // If we already have an active audio track, set the selected device ID to match it
      if (localStream) {
        const activeTrack = localStream.getAudioTracks()[0];
        if (activeTrack) {
          const activeDevice = audioInputs.find(d => d.label === activeTrack.label);
          if (activeDevice) setSelectedAudioDevice(activeDevice.deviceId);
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
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }
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
      const constraints = preset.lossless
        ? { frameRate: { ideal: preset.frameRate, max: preset.frameRate } }
        : {
            width: { ideal: preset.width, max: preset.width },
            height: { ideal: preset.height, max: preset.height },
            frameRate: { ideal: preset.frameRate, max: preset.frameRate },
          };
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
    if (!isScreenSharing) return undefined;

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
  }, [isScreenSharing, localShareSource?.kind]);

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
      if (!preserveMovieSource && localShareSource?.kind === 'movie') clearMovieSource();
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
      setShowSettings(false);

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

      const movie = {
        name: getMovieDisplayName(file.name),
        duration: Number.isFinite(player.duration) ? player.duration : 0,
        sourceType: 'file',
      };
      setSelectedMovie(movie);
      setMovieProgress({ currentTime: 0, duration: movie.duration, isPlaying: false });
      setShowSettings(false);
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
    if (!canCaptureMovie) {
      showMediaError('This browser cannot stream linked media. Try current Chrome or Firefox, or share a browser tab with audio');
      return;
    }

    try {
      dismissMediaError();
      setIsLoadingDirectMedia(true);
      const normalizedUrl = normalizeDirectMediaUrl(directMediaUrl);
      if (movieObjectUrlRef.current) URL.revokeObjectURL(movieObjectUrlRef.current);
      movieObjectUrlRef.current = null;
      player.pause();
      player.crossOrigin = 'anonymous';
      player.src = normalizedUrl;
      player.load();
      await waitForMovieMetadata(player, {
        errorMessage: 'This URL could not be played. Make sure it is a direct video file, allows cross-origin playback, and does not require a login.',
      });

      const movie = {
        name: getDirectMediaDisplayName(normalizedUrl),
        duration: Number.isFinite(player.duration) ? player.duration : 0,
        sourceType: 'url',
      };
      setSelectedMovie(movie);
      setMovieProgress({ currentTime: 0, duration: movie.duration, isPlaying: false });
      setDirectMediaUrl('');
      setShowMovieSourcePicker(false);
      setShowSettings(false);
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

      await player.play();
      capturedStream = getCaptureStream(player);
      const videoTrack = capturedStream?.getVideoTracks()[0] || null;
      const audioTrack = capturedStream?.getAudioTracks()[0] || null;
      if (!videoTrack) throw new Error('The browser did not expose a video track for this movie');

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
        currentTime: player.currentTime,
        isPlaying: true,
      };
      setLocalShareSource(source);
      sendControlMessage({ type: 'screen-toggle', isScreenSharing: true, source: 'movie', ...source });
      setMovieProgress(current => ({ ...current, currentTime: player.currentTime, isPlaying: true }));
      setShowSettings(false);

      const moviePreset = qualityRef.current === 'auto'
        ? getAutoQualityPreset('movie', autoQualityStateRef.current.index)
        : QUALITY_PRESETS[qualityRef.current];
      await applyScreenQuality(moviePreset, 'movie');
    } catch (error) {
      console.error('Failed to share movie', error);
      capturedStream?.getTracks().forEach(track => track.stop());
      activeDisplayStreamRef.current = null;
      screenAudioTrackRef.current = null;
      await setSharedContentAudioTrack(null).catch(() => {});
      await setScreenStream(null).catch(() => {});
      player.pause();
      setIsScreenSharing(false);
      setLocalShareSource(null);
      showMediaError(error.name === 'NotAllowedError'
        ? 'The browser blocked movie playback. Press Start movie again'
        : error.message);
    }
  };

  const toggleMoviePlayback = async () => {
    const player = moviePlayerRef.current;
    if (!player || localShareSource?.kind !== 'movie') return;
    try {
      if (player.paused) await player.play();
      else player.pause();
    } catch (error) {
      showMediaError(error.message || 'The movie playback control failed');
    }
  };

  const handleMovieProgress = () => {
    const player = moviePlayerRef.current;
    if (!player || localShareSource?.kind !== 'movie') return;
    setMovieProgress({
      currentTime: player.currentTime,
      duration: Number.isFinite(player.duration) ? player.duration : selectedMovie?.duration || 0,
      isPlaying: !player.paused,
    });
  };

  const sendMovieState = () => {
    const player = moviePlayerRef.current;
    if (!player || localShareSource?.kind !== 'movie') return;
    const state = {
      isPlaying: !player.paused,
      currentTime: player.currentTime,
      duration: Number.isFinite(player.duration) ? player.duration : selectedMovie?.duration || 0,
    };
    setMovieProgress(current => ({ ...current, ...state }));
    setLocalShareSource(current => current?.kind === 'movie' ? { ...current, ...state } : current);
    sendControlMessage({ type: 'movie-state', ...state });
  };

  const handleMovieSeek = (event) => {
    const player = moviePlayerRef.current;
    if (!player) return;
    player.currentTime = Number(event.target.value);
    handleMovieProgress();
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

  return (
    <TooltipProvider delayDuration={250}>
    <div
      className={`absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-end gap-4 transition-all duration-300 motion-reduce:transition-none hover:!translate-y-0 hover:!opacity-100 sm:bottom-8 ${isIdle || isPresentationMode ? 'pointer-events-none translate-y-6 opacity-0' : 'translate-y-0 opacity-100'}`}
      aria-hidden={isPresentationMode}
      inert={isPresentationMode ? '' : undefined}
    >
      <input
        ref={movieInputRef}
        type="file"
        accept="video/*,.mkv"
        className="sr-only"
        onChange={handleMovieSelection}
        aria-label="Choose a movie from your computer"
      />
      <video
        ref={moviePlayerRef}
        className="pointer-events-none absolute size-px opacity-0"
        playsInline
        preload="metadata"
        onTimeUpdate={handleMovieProgress}
        onPlay={sendMovieState}
        onPause={sendMovieState}
        onSeeked={sendMovieState}
        onEnded={() => stopScreenShare()}
        aria-hidden="true"
      />

      {showMovieSourcePicker && localShareSource?.kind !== 'movie' && !showSettings ? (
        <aside className="absolute bottom-20 left-1/2 flex w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-3 rounded-2xl border border-white/10 bg-[#111719]/95 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-2xl" aria-label="Choose a movie source">
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
            Direct MP4/WebM-style links need media CORS access. YouTube, Netflix, login-protected pages, and ordinary webpage links are not supported; share their browser tab with audio instead.
          </p>
          <p className="sr-only" aria-live="polite">{isLoadingDirectMedia ? 'Loading direct video URL.' : ''}</p>
        </aside>
      ) : null}

      {selectedMovie && localShareSource?.kind !== 'movie' && !showSettings && !showMovieSourcePicker ? (
        <aside className="absolute bottom-20 left-1/2 flex w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-2xl border border-white/10 bg-[#111719]/95 p-3 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-2xl" aria-label="Movie ready to share">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-teal-300/10 text-teal-200">
            <Film className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-100">{selectedMovie.name}</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {formatMediaTime(selectedMovie.duration)} · {selectedMovie.sourceType === 'url' ? 'direct link, not uploaded to PairBeam' : 'stays on this device'}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={clearMovieSource}>Cancel</Button>
          <Button variant="active" size="sm" onClick={startMovieShare}>
            <Play className="size-4" />
            {isScreenSharing ? 'Replace share' : 'Start movie'}
          </Button>
        </aside>
      ) : null}

      {localShareSource?.kind === 'movie' && !showSettings ? (
        <aside className="absolute bottom-20 left-1/2 flex w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-2xl border border-white/10 bg-[#111719]/95 p-3 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-2xl" aria-label="Movie playback controls">
          <Button variant="active" size="icon" onClick={toggleMoviePlayback} aria-label={movieProgress.isPlaying ? 'Pause movie' : 'Play movie'}>
            {movieProgress.isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
              <span className="truncate font-medium text-zinc-200">{localShareSource.name}</span>
              <span className="shrink-0 font-mono text-zinc-500">
                {formatMediaTime(movieProgress.currentTime)} / {formatMediaTime(movieProgress.duration)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max={Math.max(movieProgress.duration, 0)}
              step="0.1"
              value={Math.min(movieProgress.currentTime, movieProgress.duration || 0)}
              onChange={handleMovieSeek}
              className="h-2 w-full cursor-pointer accent-teal-300"
              aria-label="Movie position"
            />
          </div>
          <Button variant="ghost" size="sm" onClick={() => stopScreenShare()}>Stop</Button>
        </aside>
      ) : null}
      
      {/* Settings Menu Popup */}
      {showSettings && (
        <aside className="absolute bottom-20 left-1/2 mb-2 flex max-h-[min(42rem,calc(100vh-7rem))] w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-5 overflow-y-auto rounded-2xl border border-white/10 bg-[#111719]/95 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.5)] backdrop-blur-2xl" aria-label="Call settings">
          <h3 className="border-b border-white/[0.08] pb-2 text-xs font-semibold tracking-wide text-zinc-400">Device settings</h3>

          {localShareSource?.kind === 'movie' ? (
            <div className="flex items-center gap-3 rounded-xl border border-teal-300/15 bg-teal-300/[0.06] p-2.5" role="status">
              <Film className="size-4 shrink-0 text-teal-200" />
              <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">
                {movieProgress.isPlaying ? 'Playing' : 'Paused'} · {localShareSource.name}
              </span>
              <Button variant="ghost" size="sm" onClick={toggleMoviePlayback}>
                {movieProgress.isPlaying ? 'Pause' : 'Play'}
              </Button>
            </div>
          ) : selectedMovie ? (
            <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.035] p-2.5" role="status">
              <Film className="size-4 shrink-0 text-zinc-400" />
              <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">
                Ready · {selectedMovie.name}
              </span>
              <Button variant="active" size="sm" onClick={startMovieShare}>
                {isScreenSharing ? 'Replace' : 'Start'}
              </Button>
            </div>
          ) : null}
          
          <div className="flex flex-col gap-2">
            <label htmlFor="microphone-device" className="text-sm text-gray-400 flex items-center gap-2"><Mic size={14}/> Microphone</label>
            <select 
              id="microphone-device"
              className="h-11 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
              value={selectedAudioDevice}
              onChange={handleAudioDeviceChange}
            >
              {audioDevices.length === 0 && <option value="">Loading...</option>}
              {audioDevices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Microphone ${device.deviceId.substring(0, 5)}...`}
                </option>
              ))}
            </select>
          </div>

          <h3 className="mt-1 border-b border-white/[0.08] pb-2 text-xs font-semibold tracking-wide text-zinc-400">Playback volume</h3>

          <div className="flex flex-col gap-2" aria-label="Incoming audio volume controls">
            <VolumeControl
              id="participant-playback-volume"
              icon={UserRound}
              label="Participant voice"
              description="The other participant's microphone on this device."
              value={participantVolume}
              onChange={setParticipantVolume}
            />
            <VolumeControl
              id="screen-playback-volume"
              icon={MonitorPlay}
              label="Shared screen"
              description="Audio captured with the other participant's screen."
              value={screenVolume}
              onChange={setScreenVolume}
            />
            <VolumeControl
              id="movie-playback-volume"
              icon={Film}
              label="Shared movie"
              description="Audio from a movie shared by the other participant."
              value={movieVolume}
              onChange={setMovieVolume}
            />
          </div>

          <h3 className="mt-1 border-b border-white/[0.08] pb-2 text-xs font-semibold tracking-wide text-zinc-400">Shared content</h3>
          
          <div className="flex flex-col gap-2">
            <label htmlFor="shared-content-quality" className="text-sm text-gray-400">Resolution & FPS</label>
            <select 
              id="shared-content-quality"
              className="h-11 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
              value={quality}
              onChange={handleQualityChange}
            >
              {Object.entries(QUALITY_PRESETS).map(([key, value]) => (
                <option key={key} value={key}>{value.label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="shared-content-type" className="text-sm text-gray-400">Content Type</label>
            <select 
              id="shared-content-type"
              className="h-11 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
              value={contentType}
              onChange={handleContentTypeChange}
              disabled={localShareSource?.kind === 'movie'}
            >
              <option value="motion">Movie/Gaming (Motion)</option>
              <option value="detail">Text/Coding (Detail)</option>
            </select>
          </div>

          <div aria-live="polite" className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2.5 text-[11px] leading-5 text-zinc-500">
            {quality === 'auto' && (
              <div className="flex items-center justify-between gap-3">
                <span>Auto target</span>
                <span className="font-medium text-zinc-300">{activeAutoPreset.label}</span>
              </div>
            )}
            {isScreenSharing ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <span>Captured</span>
                  <span className="font-medium text-zinc-300">{formatVideoMetrics(screenMetrics.capture)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Sending</span>
                  <span className="font-medium text-zinc-300">{formatVideoMetrics(screenMetrics.outbound)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>{LIMITATION_COPY[screenLimitationReason] || LIMITATION_COPY.other}</span>
                  <span className="font-medium text-zinc-300">
                    {screenMetrics.outbound?.sendBitrateKbps
                      ? `${(screenMetrics.outbound.sendBitrateKbps / 1000).toFixed(1)} Mbps`
                      : 'Measuring…'}
                  </span>
                </div>
              </>
            ) : (
              <p>The browser may return a lower resolution or frame rate than requested.</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="desktop-audio-source" className="text-sm text-gray-400">Linux desktop audio fallback</label>
            <select
              id="desktop-audio-source"
              className="h-11 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-teal-300 disabled:cursor-not-allowed disabled:opacity-50"
              value={selectedDesktopAudioDevice}
              onChange={(event) => setSelectedDesktopAudioDevice(event.target.value)}
              disabled={desktopAudioDevices.length === 0}
            >
              <option value="">Use the browser share picker</option>
              {desktopAudioDevices.map(device => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || 'Desktop audio monitor'}
                </option>
              ))}
            </select>
            <p className="text-[11px] leading-5 text-zinc-600">
              {desktopAudioDevices.length > 0
                ? 'Optional: use a PipeWire/PulseAudio monitor when the share picker returns video without audio.'
                : 'No PipeWire/PulseAudio monitor source is exposed to this browser.'}
            </p>
          </div>

          <div role="status" className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-[11px] leading-5 text-zinc-500">
            {SCREEN_AUDIO_COPY[screenAudioStatus]}
          </div>
        </aside>
      )}

      {/* Camera Error Banner */}
      {mediaError && (
        <div role="alert" className="absolute bottom-20 left-1/2 flex w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 items-start gap-3 rounded-xl border border-red-400/25 bg-red-950/95 py-2 pl-4 pr-2 text-sm text-red-100 shadow-xl backdrop-blur-md">
          <p className="min-w-0 flex-1 py-1.5">
            Media error: {mediaError}. Check browser permissions and the selected device.
          </p>
          <Button variant="ghost" size="icon" onClick={dismissMediaError} aria-label="Dismiss media error" className="text-red-100 hover:bg-white/10">
            <X className="size-4" />
          </Button>
        </div>
      )}

      {/* Control Bar */}
      <div className="flex max-w-[calc(100vw-1rem)] items-center gap-1.5 overflow-x-auto rounded-2xl border border-white/10 bg-[#111719]/90 p-2 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant={isMuted ? 'destructive' : 'secondary'} size="icon" onClick={toggleMute} aria-label={isMuted ? 'Turn microphone on' : 'Mute microphone'}>
              {isMuted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isMuted ? 'Turn microphone on' : 'Mute microphone'}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant={isCameraOff ? 'destructive' : 'secondary'} size="icon" onClick={toggleCamera} aria-label={isCameraOff ? 'Turn camera on' : 'Turn camera off'}>
              {isCameraOff ? <VideoOff className="size-5" /> : <Video className="size-5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isCameraOff ? 'Turn camera on' : 'Turn camera off'}</TooltipContent>
        </Tooltip>

        <div className="mx-1 h-7 w-px bg-white/10" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
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

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={localShareSource?.kind === 'movie' ? 'active' : 'secondary'}
              size="icon"
              onClick={() => {
                if (localShareSource?.kind === 'movie') stopScreenShare();
                else {
                  setShowSettings(false);
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

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant={showSettings ? 'active' : 'ghost'} size="icon" onClick={() => setShowSettings(value => !value)} aria-label="Open call settings" aria-expanded={showSettings}>
              <Settings className="size-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Call settings</TooltipContent>
        </Tooltip>

        <div className="mx-1 h-7 w-px bg-white/10" />

        <Button variant="destructive" onClick={handleLeaveRoom} className="px-3 sm:px-4">
          <PhoneOff className="size-5" />
          <span className="hidden sm:inline">Leave</span>
        </Button>
      </div>
    </div>
    </TooltipProvider>
  );
};
