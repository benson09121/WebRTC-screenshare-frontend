import React, { useState, useEffect } from 'react';
import { useWebRTC } from '../context/WebRTCContext';
import { Mic, MicOff, Video, VideoOff, MonitorUp, Phone, PhoneOff, Settings } from 'lucide-react';

const QUALITY_PRESETS = {
  '1080p60': { label: '1080p @ 60fps', width: { ideal: 1920, max: 1920 }, height: { ideal: 1080, max: 1080 }, frameRate: { ideal: 60 }, bitrate: 20000000 },
  '1080p30': { label: '1080p @ 30fps', width: { ideal: 1920, max: 1920 }, height: { ideal: 1080, max: 1080 }, frameRate: { ideal: 30 }, bitrate: 10000000 },
  '720p60': { label: '720p @ 60fps', width: { ideal: 1280, max: 1280 }, height: { ideal: 720, max: 720 }, frameRate: { ideal: 60 }, bitrate: 8000000 },
  '480p': { label: '480p @ 30fps', width: { ideal: 854, max: 854 }, height: { ideal: 480, max: 480 }, frameRate: { ideal: 30 }, bitrate: 2500000 },
};

export const ControlPanel = () => {
  const { startCall, endCall, setLocalMediaStream, localStream, getSender, connected, isScreenSharing, setIsScreenSharing, isCameraOff, setIsCameraOff, isMuted, setIsMuted } = useWebRTC();
  
  const [showSettings, setShowSettings] = useState(false);
  const [quality, setQuality] = useState('1080p60');
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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: true
      });
      
      // Apply default state immediately
      stream.getVideoTracks().forEach(track => track.enabled = !isCameraOff);
      stream.getAudioTracks().forEach(track => track.enabled = !isMuted);

      setLocalMediaStream(stream);
      setIsScreenSharing(false);
      
      // Fetch devices after permission is granted so labels are populated
      getDevices();
    } catch (err) {
      console.error("Failed to start camera", err);
      setCameraError(err.name === 'NotAllowedError' ? 'Permission Denied' : err.message);
    }
  };

  const getDevices = async () => {
    try {
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
    
    try {
      const newAudioStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } }
      });
      const newAudioTrack = newAudioStream.getAudioTracks()[0];
      newAudioTrack.enabled = !isMuted;
      
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
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = isMuted; // if it was muted, enable it
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleCamera = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = isCameraOff;
      });
      setIsCameraOff(!isCameraOff);
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      // Stop screen share, revert to camera
      await startCamera();
      
      // Reset bitrate to default if needed (browser default)
      const sender = getSender('video');
      if (sender) {
        const params = sender.getParameters();
        if (params.encodings && params.encodings.length > 0) {
          delete params.encodings[0].maxBitrate;
          await sender.setParameters(params).catch(e => console.warn(e));
        }
      }
      return;
    }

    try {
      const preset = QUALITY_PRESETS[quality];
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: preset.width,
          height: preset.height,
          frameRate: preset.frameRate,
        },
        audio: true // capture system audio if possible
      });

      // Apply content hint for fidelity
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.contentHint = contentType;
        
        videoTrack.onended = () => {
          startCamera();
        };
      }

      // Mix Microphone and Screen Audio using Web Audio API
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
      } else if (micTrack) {
        finalAudioTrack = micTrack;
      }

      let combinedTracks = [videoTrack];
      if (finalAudioTrack) combinedTracks.push(finalAudioTrack);

      const combinedStream = new MediaStream(combinedTracks);
      setLocalMediaStream(combinedStream);
      setIsScreenSharing(true);
      setShowSettings(false);

      // Force WebRTC Max Bitrate Override
      const sender = getSender('video');
      if (sender) {
        const params = sender.getParameters();
        if (!params.encodings) {
          params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = preset.bitrate;
        await sender.setParameters(params);
        console.log(`Applied maxBitrate: ${preset.bitrate} bps`);
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
    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-end gap-4 z-20">
      
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
