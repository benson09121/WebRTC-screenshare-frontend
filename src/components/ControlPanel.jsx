import React, { useState, useEffect } from 'react';
import { useWebRTC } from '../context/WebRTCContext';
import { Mic, MicOff, Video, VideoOff, MonitorUp, Phone, PhoneOff, Settings } from 'lucide-react';

const QUALITY_PRESETS = {
  '1080p': { label: '1080p (60fps)', width: 1920, height: 1080, frameRate: 60 },
  '720p':  { label: '720p (30fps)',  width: 1280, height: 720,  frameRate: 30 },
  '480p':  { label: '480p (30fps)',  width: 854,  height: 480,  frameRate: 30 }
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
  } catch (e) {
    return null;
  }
};

const createEmptyVideoTrack = ({ width, height }) => {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').fillRect(0, 0, width, height);
    const stream = canvas.captureStream();
    const track = stream.getVideoTracks()[0];
    track.enabled = false;
    return track;
  } catch (e) {
    return null;
  }
};

export const ControlPanel = ({ isIdle }) => {
  const { startCall, endCall, setCameraStream, setScreenStream, localStream, localScreenStream, getSender, connected, isScreenSharing, setIsScreenSharing, isCameraOff, setIsCameraOff, isMuted, setIsMuted, sendControlMessage } = useWebRTC();
  
  const [showSettings, setShowSettings] = useState(false);
  const [quality, setQuality] = useState('1080p');
  const [contentType, setContentType] = useState('motion'); // 'motion' (Movie) or 'detail' (Text)
  const [isConnecting, setIsConnecting] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState('');

  // Initialize camera by default
  useEffect(() => {
    startCamera();
  }, []);

  useEffect(() => {
    if (connected) {
      setIsConnecting(false);
    }
  }, [connected]);

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
          setLocalMediaStream(combinedStream);
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
      setScreenStream(null);
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

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error("Screen sharing requires HTTPS or Localhost");
      }
      
      const preset = QUALITY_PRESETS[quality];
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: preset.width,
          height: preset.height,
          frameRate: preset.frameRate,
        },
        audio: {
          systemAudio: 'include'
        }
      });

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.contentHint = contentType;
        
        videoTrack.onended = () => {
          setIsScreenSharing(false);
          sendControlMessage({ type: 'screen-toggle', isScreenSharing: false });
          setScreenStream(null);
          if (localStream) {
             const originalMic = localStream.getAudioTracks()[0];
             const audioSender = getSender('audio');
             if (audioSender && originalMic) audioSender.replaceTrack(originalMic);
          }
        };
      }

      let finalAudioTrack = null;
      const screenAudioTrack = stream.getAudioTracks()[0];
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

      setScreenStream(new MediaStream([videoTrack]));
      setIsScreenSharing(true);
      sendControlMessage({ type: 'screen-toggle', isScreenSharing: true });
      setShowSettings(false);

      const sender = getSender('video', true); // get screen sender
      if (sender) {
        const params = sender.getParameters();
        if (!params.encodings) params.encodings = [{}];
        params.encodings[0].maxBitrate = preset.bitrate || 2500000;
        await sender.setParameters(params);
      }
      
    } catch (err) {
      console.error("Failed to share screen", err);
    }
  };

  const handleLeaveRoom = () => {
    endCall();
    window.location.href = '/'; // Reload to clear states and show landing page
  };

  return (
    <div className={`absolute bottom-10 left-1/2 -translate-x-1/2 flex items-end gap-4 z-20 transition-all duration-500 hover:!opacity-100 hover:!translate-y-0 ${isIdle ? 'opacity-0 translate-y-8' : 'opacity-100 translate-y-0'}`}>
      
      {/* Settings Menu Popup */}
      {showSettings && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 bg-gray-900/90 backdrop-blur-2xl border border-gray-700/50 p-6 rounded-3xl shadow-[0_20px_60px_-12px_rgba(0,0,0,0.6)] flex flex-col gap-5 w-80 mb-2 transform transition-all">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-700 pb-2">Device Settings</h3>
          
          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-400 flex items-center gap-2"><Mic size={14}/> Microphone</label>
            <select 
              className="bg-gray-800 text-white p-2 rounded-lg border border-gray-700 focus:outline-none focus:border-blue-500 text-sm"
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

          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-700 pb-2 mt-2">Screen Share Settings</h3>
          
          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-400">Resolution & FPS</label>
            <select 
              className="bg-gray-800 text-white p-2 rounded-lg border border-gray-700 focus:outline-none focus:border-blue-500"
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
              className="bg-gray-800 text-white p-2 rounded-lg border border-gray-700 focus:outline-none focus:border-blue-500"
              value={contentType}
              onChange={(e) => setContentType(e.target.value)}
            >
              <option value="motion">Movie/Gaming (Motion)</option>
              <option value="detail">Text/Coding (Detail)</option>
            </select>
          </div>
        </div>
      )}

      {/* Camera Error Banner */}
      {cameraError && (
        <div className="absolute bottom-24 bg-red-900/90 text-white px-4 py-2 rounded-lg text-sm border border-red-500 shadow-xl backdrop-blur-md whitespace-nowrap">
          ⚠️ Camera/Mic Error: {cameraError}. Check browser permissions.
        </div>
      )}

      {/* Control Bar */}
      <div className="bg-gray-900/60 backdrop-blur-2xl px-8 py-5 rounded-[2.5rem] border border-gray-700/50 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.6)] flex items-center gap-5">
        
        <button 
          onClick={toggleMute}
          className={`p-4 rounded-full transition-all duration-300 ${isMuted ? 'bg-red-500/90 hover:bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 'bg-gray-800/80 hover:bg-gray-700 text-gray-300 hover:text-white'}`}
        >
          {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
        </button>

        <button 
          onClick={toggleCamera}
          className={`p-4 rounded-full transition-all duration-300 ${isCameraOff ? 'bg-red-500/90 hover:bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 'bg-gray-800/80 hover:bg-gray-700 text-gray-300 hover:text-white'}`}
        >
          {isCameraOff ? <VideoOff size={22} /> : <Video size={22} />}
        </button>

        <div className="w-px h-10 bg-gray-700/50 mx-2"></div>

        <div className="flex items-center">
          <button 
            onClick={toggleScreenShare}
            className={`p-4 rounded-l-full transition-all duration-300 border-r border-gray-700/50 ${isScreenSharing ? 'bg-blue-600/90 hover:bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)]' : 'bg-gray-800/80 hover:bg-gray-700 text-gray-300 hover:text-white'}`}
          >
            <MonitorUp size={22} />
          </button>
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={`p-4 rounded-r-full transition-all duration-300 flex items-center justify-center ${showSettings ? 'bg-gray-700 text-white' : 'bg-gray-800/80 hover:bg-gray-700 text-gray-300 hover:text-white'}`}
          >
            <Settings size={22} />
          </button>
        </div>

        <div className="w-px h-10 bg-gray-700/50 mx-2"></div>

        <button 
          onClick={handleLeaveRoom}
          className="px-8 py-4 rounded-full bg-red-500/90 hover:bg-red-500 transition-all duration-300 text-white flex items-center gap-3 font-semibold tracking-wide shadow-[0_0_20px_rgba(239,68,68,0.4)]"
        >
          <PhoneOff size={22} /> Leave Room
        </button>
      </div>
    </div>
  );
};
