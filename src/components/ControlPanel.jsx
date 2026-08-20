import React, { useState, useEffect, useRef } from 'react';
import { useWebRTC } from '../context/useWebRTC';
import { Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff, Settings } from 'lucide-react';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { createEmptyVideoTrack } from '../lib/mediaTracks';

const QUALITY_PRESETS = {
  'lossless': { label: 'Native resolution (up to 60fps)', lossless: true, frameRate: 60, bitrate: 12000000 },
  '1080p': { label: '1080p (60fps)', width: 1920, height: 1080, frameRate: 60, bitrate: 10000000 },
  '720p':  { label: '720p (60fps)',  width: 1280, height: 720,  frameRate: 60, bitrate: 6000000 },
  '480p':  { label: '480p (30fps)',  width: 854,  height: 480,  frameRate: 30, bitrate: 2500000 }
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
  const { endCall, setCameraStream, setScreenStream, localStream, localScreenStream, getSender, isScreenSharing, setIsScreenSharing, isCameraOff, setIsCameraOff, isMuted, setIsMuted, sendControlMessage } = useWebRTC();
  
  const [showSettings, setShowSettings] = useState(false);
  const [quality, setQuality] = useState('720p');
  const [contentType, setContentType] = useState('motion'); // 'motion' (Movie) or 'detail' (Text)
  const [cameraError, setCameraError] = useState(null);
  
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState('');
  const startCameraRef = useRef(null);

  const startCamera = async () => {
    try {
      setCameraError(null);
      
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
        
        setCameraStream(new MediaStream(tracks));
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
      setCameraStream(stream);
      setIsScreenSharing(false);
      
      getDevices();
    } catch (err) {
      console.error("Failed to start media devices", err);
      setCameraError(err.name === 'NotAllowedError' ? 'Permission Denied' : err.message);
    }
  };
  startCameraRef.current = startCamera;

  useEffect(() => {
    startCameraRef.current?.();
  }, []);

  const getDevices = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      setAudioDevices(audioInputs);
      
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
          setCameraStream(combinedStream);
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
        
        const audioSender = getSender('audio');
        if (audioSender) {
          audioSender.replaceTrack(null).catch(e => console.warn(e));
        }
        
        setCameraStream(new MediaStream(localStream.getTracks()));
      }
      setIsMuted(true);
    } else {
      // Turn ON physical hardware
      try {
        setCameraError(null);
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
          setCameraStream(new MediaStream(tracks));
        } else {
          setCameraStream(newStream);
        }
        setIsMuted(false);
        
        // Refresh device labels now that we definitely have active permissions
        getDevices();
      } catch (err) {
        console.error("Failed to turn on microphone hardware", err);
        setCameraError(err.name === 'NotAllowedError' ? 'Microphone Permission Denied' : err.message);
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
        
        setCameraStream(new MediaStream(tracks));
        
        setIsCameraOff(true);
        sendControlMessage({ type: 'camera-toggle', isCameraOff: true });
      }
    } else {
      // Turn ON physical hardware
      try {
        setCameraError(null);
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
          setCameraStream(new MediaStream(tracks));
        } else {
          setCameraStream(newStream);
        }
        setIsCameraOff(false);
        sendControlMessage({ type: 'camera-toggle', isCameraOff: false });
      } catch (err) {
        console.error("Failed to turn on camera hardware", err);
        setCameraError(err.name === 'NotAllowedError' ? 'Camera Permission Denied' : err.message);
      }
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      // Stop screen share
      if (localScreenStream) {
        localScreenStream.getTracks().forEach(t => t.stop());
      }
      await setScreenStream(null);
      setIsScreenSharing(false);
      sendControlMessage({ type: 'screen-toggle', isScreenSharing: false });
      
      // Restore original mic track if mixed
      if (localStream) {
         const originalMic = localStream.getAudioTracks()[0];
         const audioSender = getSender('audio');
         if (audioSender && originalMic) audioSender.replaceTrack(originalMic);
      }
      return;
    }

    let capturedStream = null;
    let shareStarted = false;

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error("Screen sharing requires HTTPS or Localhost");
      }
      
      const preset = QUALITY_PRESETS[quality];
      
      const videoConstraints = preset.lossless
        ? { frameRate: { ideal: preset.frameRate, max: preset.frameRate } }
        : {
            width: { ideal: preset.width, max: preset.width },
            height: { ideal: preset.height, max: preset.height },
            frameRate: { ideal: preset.frameRate, max: preset.frameRate },
          };

      capturedStream = await navigator.mediaDevices.getDisplayMedia({
        video: videoConstraints,
        audio: {
          systemAudio: 'include'
        }
      });

      const videoTrack = capturedStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.contentHint = contentType;
        
        videoTrack.onended = () => {
          setIsScreenSharing(false);
          sendControlMessage({ type: 'screen-toggle', isScreenSharing: false });
          setScreenStream(null).catch(err => console.warn('Failed to detach screen track', err));
          if (localStream) {
             const originalMic = localStream.getAudioTracks()[0];
             const audioSender = getSender('audio');
             if (audioSender && originalMic) audioSender.replaceTrack(originalMic);
          }
        };
      }

      let finalAudioTrack = null;
      const screenAudioTrack = capturedStream.getAudioTracks()[0];
      const micTrack = localStream ? localStream.getAudioTracks()[0] : null;

      if (screenAudioTrack && micTrack) {
        const audioContext = new AudioContext();
        const dest = audioContext.createMediaStreamDestination();
        
        const screenSource = audioContext.createMediaStreamSource(new MediaStream([screenAudioTrack]));
        screenSource.connect(dest);
        
        const micSource = audioContext.createMediaStreamSource(new MediaStream([micTrack]));
        micSource.connect(dest);
        
        finalAudioTrack = dest.stream.getAudioTracks()[0];
      } else if (screenAudioTrack) {
        finalAudioTrack = screenAudioTrack;
      }

      if (finalAudioTrack) {
         const audioSender = getSender('audio');
         if (audioSender) audioSender.replaceTrack(finalAudioTrack);
      }

      await setScreenStream(new MediaStream([videoTrack]));
      setIsScreenSharing(true);
      sendControlMessage({ type: 'screen-toggle', isScreenSharing: true });
      shareStarted = true;
      setShowSettings(false);

      const sender = getSender('video', true); // get screen sender
      if (sender) {
        const params = sender.getParameters();
        if (!params.encodings?.length) params.encodings = [{}];
        params.encodings[0].maxBitrate = preset.bitrate;
        params.encodings[0].maxFramerate = preset.frameRate;
        params.degradationPreference = contentType === 'motion'
          ? 'maintain-framerate'
          : 'maintain-resolution';
        await sender.setParameters(params);
      }
      
    } catch (err) {
      console.error("Failed to share screen", err);
      if (!shareStarted) {
        capturedStream?.getTracks().forEach(track => track.stop());
        setIsScreenSharing(false);
        setCameraError(err.name === 'NotAllowedError' ? 'Screen sharing permission denied' : err.message);
      }
    }
  };

  const handleLeaveRoom = () => {
    endCall();
    window.location.href = '/'; // Reload to clear states and show landing page
  };

  return (
    <TooltipProvider delayDuration={250}>
    <div className={`absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-end gap-4 transition-all duration-300 hover:!translate-y-0 hover:!opacity-100 sm:bottom-8 ${isIdle ? 'translate-y-6 opacity-0' : 'translate-y-0 opacity-100'}`}>
      
      {/* Settings Menu Popup */}
      {showSettings && (
        <aside className="absolute bottom-20 left-1/2 mb-2 flex w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-5 rounded-2xl border border-white/10 bg-[#111719]/95 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.5)] backdrop-blur-2xl" aria-label="Call settings">
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
              onChange={(e) => setQuality(e.target.value)}
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
              onChange={(e) => setContentType(e.target.value)}
            >
              <option value="motion">Movie/Gaming (Motion)</option>
              <option value="detail">Text/Coding (Detail)</option>
            </select>
          </div>
        </aside>
      )}

      {/* Camera Error Banner */}
      {cameraError && (
        <div role="alert" className="absolute bottom-20 left-1/2 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-red-400/25 bg-red-950/95 px-4 py-3 text-sm text-red-100 shadow-xl backdrop-blur-md">
          Camera or microphone error: {cameraError}. Check browser permissions.
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
