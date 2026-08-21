import React, { useState, useEffect, useRef } from 'react';
import { useWebRTC } from '../context/useWebRTC';
import { Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff, Settings, X } from 'lucide-react';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { createEmptyVideoTrack } from '../lib/mediaTracks';
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
  native: 'Screen audio is included by the browser.',
  monitor: 'Desktop audio is included from the selected Linux monitor. Use headphones to reduce call-audio echo.',
  unavailable: 'No screen-audio track was provided. Video is still being shared.',
};

const isLiveTrack = track => track?.readyState === 'live';
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

const disposeAudioMix = (mix) => {
  if (!mix) return;
  mix.sources.forEach(source => source.disconnect());
  mix.destination.disconnect();
  mix.track.stop();
  mix.context.close().catch(() => {});
};

const createAudioMix = async (microphoneTrack, screenAudioTrack) => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  const context = new AudioContextClass();
  if (context.state === 'suspended') await context.resume().catch(() => {});
  const destination = context.createMediaStreamDestination();
  const sources = [microphoneTrack, screenAudioTrack].map(track => {
    const source = context.createMediaStreamSource(new MediaStream([track]));
    source.connect(destination);
    return source;
  });

  return {
    context,
    destination,
    sources,
    track: destination.stream.getAudioTracks()[0],
  };
};

const createEmptyAudioTrack = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const dst = oscillator.connect(ctx.createMediaStreamDestination());
    oscillator.start();
    const track = dst.stream.getAudioTracks()[0];
    track.enabled = false;
    return track;
  } catch {
    return null;
  }
};

export const ControlPanel = ({ isIdle }) => {
  const { endCall, setCameraStream, setOutgoingAudioTrack, setScreenStream, localStream, localScreenStream, getSender, isScreenSharing, setIsScreenSharing, isCameraOff, setIsCameraOff, isMuted, setIsMuted, sendControlMessage, isPresentationMode } = useWebRTC();
  
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
  const startCameraRef = useRef(null);
  const localStreamLatestRef = useRef(localStream);
  const activeDisplayStreamRef = useRef(null);
  const screenAudioTrackRef = useRef(null);
  const audioMixRef = useRef(null);
  const stoppingShareRef = useRef(false);
  const getSenderRef = useRef(getSender);
  const qualityRef = useRef(quality);
  const contentTypeRef = useRef(contentType);
  const autoQualityStateRef = useRef(createAutoQualityState());
  const screenStatsSamplesRef = useRef(new Map());
  const screenQualitySenderRef = useRef(null);
  const applyScreenQualityRef = useRef(null);
  const mediaErrorTimerRef = useRef(null);
  localStreamLatestRef.current = localStream;
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

  const getLiveMicrophoneTrack = (stream = localStreamLatestRef.current) => (
    stream?.getAudioTracks().find(track => isLiveTrack(track) && track.enabled) || null
  );

  const updateOutgoingAudio = async (
    microphoneTrack = getLiveMicrophoneTrack(),
    screenAudioTrack = screenAudioTrackRef.current,
  ) => {
    const liveMicrophone = isLiveTrack(microphoneTrack) && microphoneTrack.enabled
      ? microphoneTrack
      : null;
    const liveScreenAudio = isLiveTrack(screenAudioTrack) ? screenAudioTrack : null;
    let nextMix = null;
    let nextTrack = liveScreenAudio || liveMicrophone;

    if (liveMicrophone && liveScreenAudio) {
      nextMix = await createAudioMix(liveMicrophone, liveScreenAudio);
      nextTrack = nextMix?.track || liveScreenAudio;
    }

    try {
      await setOutgoingAudioTrack(nextTrack || null);
    } catch (error) {
      disposeAudioMix(nextMix);
      throw error;
    }

    const previousMix = audioMixRef.current;
    audioMixRef.current = nextMix;
    disposeAudioMix(previousMix);
  };

  const updateCameraStream = async (stream) => {
    localStreamLatestRef.current = stream;
    await setCameraStream(stream);
    const microphoneTrack = getLiveMicrophoneTrack(stream);
    if (isLiveTrack(screenAudioTrackRef.current) || !microphoneTrack) {
      await updateOutgoingAudio(microphoneTrack, screenAudioTrackRef.current);
    }
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
    disposeAudioMix(audioMixRef.current);
    audioMixRef.current = null;
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

    videoTrack.contentHint = nextContentType;

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
      params.degradationPreference = nextContentType === 'motion'
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
          const currentPreset = qualityRef.current === 'auto'
            ? getAutoQualityPreset(contentTypeRef.current, autoQualityStateRef.current.index)
            : QUALITY_PRESETS[qualityRef.current];
          await applyScreenQualityRef.current(currentPreset, contentTypeRef.current);
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
        const profiles = AUTO_QUALITY_PROFILES[contentTypeRef.current] || AUTO_QUALITY_PROFILES.motion;
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
            getAutoQualityPreset(contentTypeRef.current, nextAutoState.index),
            contentTypeRef.current,
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
  }, [isScreenSharing]);

  const handleQualityChange = async (event) => {
    const nextQuality = event.target.value;
    qualityRef.current = nextQuality;
    setQuality(nextQuality);

    let preset = QUALITY_PRESETS[nextQuality];
    if (nextQuality === 'auto') {
      const nextAutoState = createAutoQualityState();
      autoQualityStateRef.current = nextAutoState;
      setAutoQualityIndex(nextAutoState.index);
      preset = getAutoQualityPreset(contentTypeRef.current, nextAutoState.index);
    }

    if (isScreenSharing) await applyScreenQuality(preset, contentTypeRef.current);
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

  const stopScreenShare = async () => {
    if (stoppingShareRef.current) return;
    stoppingShareRef.current = true;

    const displayStream = activeDisplayStreamRef.current || localScreenStream;
    const screenVideoTrack = displayStream?.getVideoTracks()[0];
    if (screenVideoTrack) screenVideoTrack.onended = null;
    screenAudioTrackRef.current = null;

    try {
      await updateOutgoingAudio(getLiveMicrophoneTrack(), null);
      await setScreenStream(null);
    } catch (error) {
      console.warn('Failed to restore audio after screen sharing', error);
      showMediaError('The screen share stopped, but the outgoing audio sender could not be restored');
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
          updateOutgoingAudio(getLiveMicrophoneTrack(), null).catch(error => {
            console.warn('Failed to restore microphone after screen audio ended', error);
          });
        };
      }

      await updateOutgoingAudio(getLiveMicrophoneTrack(), screenAudioTrack);
      await setScreenStream(capturedStream);
      setIsScreenSharing(true);
      sendControlMessage({ type: 'screen-toggle', isScreenSharing: true });
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
        updateOutgoingAudio(getLiveMicrophoneTrack(), null).catch(audioError => {
          console.warn('Failed to restore microphone after screen-share error', audioError);
        });
        capturedStream?.getTracks().forEach(track => track.stop());
        setIsScreenSharing(false);
        showMediaError(err.name === 'NotAllowedError' ? 'Screen sharing permission denied' : err.message);
      }
    }
  };

  const handleLeaveRoom = () => {
    endCall();
    window.location.href = '/'; // Reload to clear states and show landing page
  };

  const activeAutoPreset = getAutoQualityPreset(contentType, autoQualityIndex);
  const screenLimitationReason = screenMetrics.outbound?.qualityLimitationReason || 'none';

  return (
    <TooltipProvider delayDuration={250}>
    <div
      className={`absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-end gap-4 transition-all duration-300 motion-reduce:transition-none hover:!translate-y-0 hover:!opacity-100 sm:bottom-8 ${isIdle || isPresentationMode ? 'pointer-events-none translate-y-6 opacity-0' : 'translate-y-0 opacity-100'}`}
      aria-hidden={isPresentationMode}
      inert={isPresentationMode ? '' : undefined}
    >
      
      {/* Settings Menu Popup */}
      {showSettings && (
        <aside className="absolute bottom-20 left-1/2 mb-2 flex max-h-[min(42rem,calc(100vh-7rem))] w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-5 overflow-y-auto rounded-2xl border border-white/10 bg-[#111719]/95 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.5)] backdrop-blur-2xl" aria-label="Call settings">
          <h3 className="border-b border-white/[0.08] pb-2 text-xs font-semibold tracking-wide text-zinc-400">Device settings</h3>
          
          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-400 flex items-center gap-2"><Mic size={14}/> Microphone</label>
            <select 
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

          <h3 className="mt-1 border-b border-white/[0.08] pb-2 text-xs font-semibold tracking-wide text-zinc-400">Screen share</h3>
          
          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-400">Resolution & FPS</label>
            <select 
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
            <label className="text-sm text-gray-400">Content Type</label>
            <select 
              className="h-11 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-sm text-white outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
              value={contentType}
              onChange={handleContentTypeChange}
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
            <label className="text-sm text-gray-400">Linux desktop audio fallback</label>
            <select
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
      <div className="flex items-center gap-1.5 rounded-2xl border border-white/10 bg-[#111719]/90 p-2 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:gap-2">
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
            <Button variant={isScreenSharing ? 'active' : 'secondary'} size="icon" onClick={toggleScreenShare} aria-label={isScreenSharing ? 'Stop sharing your screen' : 'Share your screen'}>
              <MonitorUp className="size-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isScreenSharing ? 'Stop sharing your screen' : 'Share your screen'}</TooltipContent>
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
