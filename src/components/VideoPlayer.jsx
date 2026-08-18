import React, { useEffect, useRef, useState } from 'react';
import { useWebRTC } from '../context/WebRTCContext';
import { Maximize, Minimize, Eye, EyeOff } from 'lucide-react';

export const VideoPlayer = () => {
  const { localStream, remoteStream, isScreenSharing, isCameraOff } = useWebRTC();
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const containerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hideRemote, setHideRemote] = useState(false);

  const [pipPos, setPipPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [hideLocal, setHideLocal] = useState(false);
  const dragRef = useRef(null);

  const handlePointerDown = (e) => {
    setIsDragging(true);
    dragRef.current = { startX: e.clientX - pipPos.x, startY: e.clientY - pipPos.y };
    e.target.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isDragging || !dragRef.current) return;
    setPipPos({ x: e.clientX - dragRef.current.startX, y: e.clientY - dragRef.current.startY });
  };

  const handlePointerUp = (e) => {
    setIsDragging(false);
    e.target.releasePointerCapture(e.pointerId);
  };

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, isCameraOff, hideLocal]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      if (containerRef.current && containerRef.current.requestFullscreen) {
        await containerRef.current.requestFullscreen().catch(err => {
          console.error(`Error attempting to enable fullscreen: ${err.message}`);
        });
      }
    } else {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
    }
  };

  return (
    <div ref={containerRef} className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden group">
      {/* Remote (Main) Video */}
      {remoteStream ? (
        <>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            onDoubleClick={toggleFullscreen}
            className={`w-full h-full object-contain cursor-pointer transition-opacity duration-500 ${hideRemote ? 'opacity-0' : 'opacity-100'}`}
          />
          <button 
            onClick={() => setHideRemote(!hideRemote)}
            className="absolute top-8 right-24 p-3 bg-gray-900/60 backdrop-blur-md hover:bg-gray-800 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300 z-20 shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-700/50"
            title={hideRemote ? "Show Remote Video" : "Hide Remote Video"}
          >
            {hideRemote ? <Eye size={20} /> : <EyeOff size={20} />}
          </button>
          <button 
            onClick={toggleFullscreen}
            className="absolute top-8 right-8 p-3 bg-gray-900/60 backdrop-blur-md hover:bg-gray-800 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300 z-20 shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-700/50"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950">
          <div className="relative flex items-center justify-center">
            <div className="absolute w-32 h-32 border border-blue-500/20 rounded-full animate-[ping_3s_ease-in-out_infinite]"></div>
            <div className="absolute w-48 h-48 border border-purple-500/10 rounded-full animate-[ping_4s_ease-in-out_infinite] delay-300"></div>
            <div className="absolute w-64 h-64 border border-blue-400/5 rounded-full animate-[ping_5s_ease-in-out_infinite] delay-700"></div>
            <div className="z-10 bg-gray-900/60 backdrop-blur-xl px-10 py-6 rounded-3xl border border-gray-800/50 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-blue-900/30 flex items-center justify-center border border-blue-800/50">
                <div className="w-6 h-6 rounded-full bg-blue-500 animate-pulse shadow-[0_0_15px_rgba(59,130,246,0.6)]"></div>
              </div>
              <span className="text-gray-300 font-medium tracking-wide text-sm uppercase">Waiting for connection</span>
            </div>
          </div>
        </div>
      )}

      {/* Local (PiP) Video */}
      {(!hideLocal && localStream && !isCameraOff) && (
        <div 
          style={{ transform: `translate(${pipPos.x}px, ${pipPos.y}px)` }}
          className="absolute top-24 right-8 z-30 touch-none group/pip"
        >
          <div 
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className={`w-64 aspect-video bg-gray-900/80 backdrop-blur-md rounded-2xl overflow-hidden border border-gray-700/50 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] transition-all duration-300 ${isDragging ? 'scale-105 shadow-[0_20px_50px_-12px_rgba(59,130,246,0.3)] cursor-grabbing' : 'hover:scale-105 hover:shadow-[0_20px_50px_-12px_rgba(59,130,246,0.2)] cursor-grab'}`}
          >
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover pointer-events-none ${!isScreenSharing ? 'mirror-horizontally' : ''}`}
              style={!isScreenSharing ? { transform: 'scaleX(-1)' } : {}}
            />
            
            {/* Hide Local Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setHideLocal(true);
              }}
              className="absolute top-2 right-2 p-2 bg-gray-900/80 backdrop-blur-md hover:bg-red-500 text-white rounded-full opacity-0 group-hover/pip:opacity-100 transition-all duration-300 shadow-lg border border-gray-700/50"
              title="Hide My Video"
            >
              <EyeOff size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Show Local Video Button (if manually hidden) */}
      {(hideLocal && localStream && !isCameraOff) && (
        <button
          onClick={() => setHideLocal(false)}
          className="absolute top-24 right-8 p-3 bg-gray-900/60 backdrop-blur-md hover:bg-gray-800 text-white rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-700/50 z-20 animate-pulse"
          title="Show My Video"
        >
          <Eye size={20} />
        </button>
      )}
    </div>
  );
};
