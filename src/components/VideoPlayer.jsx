import React, { useEffect, useRef, useState } from 'react';
import { useWebRTC } from '../context/WebRTCContext';
import { Maximize, Minimize, Eye, EyeOff, FlipHorizontal, User, MessageSquare } from 'lucide-react';
import { motion } from 'framer-motion';

export const VideoPlayer = ({ isIdle }) => {
  const { localStream, remoteStream, remoteScreenStream, localScreenStream, isScreenSharing, isCameraOff, connected, remoteMirrored, sendControlMessage, isChatOpen, setIsChatOpen, unreadCount, remoteCameraOff, remoteScreenSharing } = useWebRTC();
  const mainVideoRef = useRef(null);
  const secondaryVideoRef = useRef(null);
  const localVideoRef = useRef(null);
  const containerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hideRemote, setHideRemote] = useState(false);
  
  const [mainView, setMainView] = useState('remote-screen');
  const [isMirrored, setIsMirrored] = useState(true);
  const [prevHasScreen, setPrevHasScreen] = useState(false);

  const [hideLocal, setHideLocal] = useState(false);

  // Auto-switch to screen share when it becomes available
  useEffect(() => {
    if (remoteScreenSharing && !prevHasScreen) {
      setMainView('remote-screen');
    }
    setPrevHasScreen(remoteScreenSharing);
  }, [remoteScreenSharing, prevHasScreen]);

  const hasRemoteScreen = remoteScreenSharing;
  const hasLocalScreen = isScreenSharing;
  
  // Determine which stream goes where
  const actualMainView = (hasRemoteScreen || hasLocalScreen) && mainView === 'remote-screen' ? 'remote-screen' : 'remote-camera';
  
  const mainStream = actualMainView === 'remote-screen' 
    ? (hasRemoteScreen ? remoteScreenStream : localScreenStream) 
    : remoteStream;
    
  const secondaryStream = actualMainView === 'remote-screen' ? remoteStream : (hasRemoteScreen ? remoteScreenStream : localScreenStream);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, isCameraOff, hideLocal]);

  useEffect(() => {
    if (mainVideoRef.current && mainStream) {
      mainVideoRef.current.srcObject = mainStream;
    }
  }, [mainStream, actualMainView, remoteCameraOff]);

  useEffect(() => {
    if (secondaryVideoRef.current && secondaryStream) {
      secondaryVideoRef.current.srcObject = secondaryStream;
    }
  }, [secondaryStream, actualMainView, remoteCameraOff, hasRemoteScreen, hasLocalScreen]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
    }
  };

  return (
    <div ref={containerRef} className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden group">
      
      {/* Fullscreen Chat Toggle */}
      {isFullscreen && (
        <div className={`absolute top-0 left-0 w-full h-20 bg-gradient-to-b from-black/80 to-transparent z-40 flex items-start justify-center pt-6 pointer-events-none transition-opacity duration-500 ${isIdle ? 'opacity-0' : 'opacity-100'}`}>
          <button 
            onClick={() => setIsChatOpen(!isChatOpen)}
            className="pointer-events-auto flex items-center gap-2 bg-blue-600/80 hover:bg-blue-500 backdrop-blur-md px-5 py-2.5 rounded-full text-white text-sm font-medium border border-blue-400/30 shadow-lg transition-transform hover:scale-105"
          >
            <MessageSquare size={16} />
            <span>Chat {unreadCount > 0 ? `(${unreadCount})` : ''}</span>
          </button>
        </div>
      )}
      {/* Main Video */}
      {mainStream ? (
        <>
          {(actualMainView === 'remote-camera' && remoteCameraOff) ? (
            <div className="w-full h-full flex items-center justify-center bg-gray-950">
              <User className="text-gray-700 w-32 h-32 animate-pulse" />
            </div>
          ) : (
            <video
              ref={mainVideoRef}
              autoPlay
              playsInline
              onDoubleClick={toggleFullscreen}
              className={`w-full h-full object-contain cursor-pointer transition-all duration-500 ${hideRemote ? 'opacity-0' : 'opacity-100'}`}
              style={{ transform: actualMainView === 'remote-camera' && remoteMirrored ? 'scaleX(-1)' : 'scaleX(1)' }}
            />
          )}
          {(!remoteCameraOff || actualMainView === 'remote-screen') && (
            <button 
              onClick={() => setHideRemote(!hideRemote)}
              className={`absolute top-8 right-24 p-3 bg-gray-900/60 backdrop-blur-md hover:bg-gray-800 text-white rounded-full transition-all duration-300 z-20 shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-700/50 ${isIdle && isFullscreen ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100'}`}
              title={hideRemote ? "Show Remote Video" : "Hide Remote Video"}
            >
              {hideRemote ? <Eye size={20} /> : <EyeOff size={20} />}
            </button>
          )}
          
          {(hasRemoteScreen || hasLocalScreen) && (
            <button 
              onClick={toggleFullscreen}
              className={`absolute top-8 right-8 p-3 bg-gray-900/60 backdrop-blur-md hover:bg-gray-800 text-white rounded-full transition-all duration-300 z-20 shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-700/50 ${isIdle && isFullscreen ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100'}`}
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
          )}
        </>
      ) : connected ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950">
          <div className="relative flex items-center justify-center">
            <div className="z-10 bg-gray-900/60 backdrop-blur-xl px-10 py-6 rounded-3xl border border-green-800/50 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] flex flex-col items-center gap-4">
              <span className="text-gray-300 font-medium tracking-wide text-sm uppercase">Peer Connected</span>
              <span className="text-gray-500 text-xs text-center max-w-xs">Waiting for video stream...</span>
            </div>
          </div>
        </div>
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

      {/* Remote PIP (Secondary Video) */}
      {((hasRemoteScreen || hasLocalScreen) && secondaryStream && !remoteCameraOff) && (
        <motion.div 
          drag
          dragConstraints={containerRef}
          dragElastic={0.1}
          dragMomentum={false}
          className={`absolute top-24 left-8 z-30 cursor-pointer group/remotepip resize overflow-hidden min-w-[150px] min-h-[100px] w-64 max-w-[80vw] max-h-[80vh] bg-gray-900/80 backdrop-blur-md rounded-2xl border border-gray-700/50 shadow-2xl transition-opacity duration-300 ${isIdle && isFullscreen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
          style={{ aspectRatio: '16/9' }}
          onClick={() => setMainView(actualMainView === 'remote-screen' ? 'remote-camera' : 'remote-screen')}
        >
          <video
            ref={secondaryVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover pointer-events-none transition-transform duration-300"
            style={{ transform: actualMainView === 'remote-screen' && remoteMirrored ? 'scaleX(-1)' : 'scaleX(1)' }}
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/remotepip:opacity-100 flex flex-col items-center justify-center transition-all duration-300 pointer-events-none">
             <span className="text-white font-medium bg-gray-900/80 px-3 py-1 rounded-full text-xs shadow-lg backdrop-blur-sm border border-gray-700">Click to Swap</span>
          </div>
        </motion.div>
      )}

      {/* Local (PiP) Video */}
      {(!hideLocal && localStream && !isCameraOff) && (
        <motion.div 
          drag
          dragConstraints={containerRef}
          dragElastic={0.1}
          dragMomentum={false}
          className={`absolute top-24 right-8 z-30 group/pip resize overflow-hidden min-w-[150px] min-h-[100px] w-64 max-w-[80vw] max-h-[80vh] bg-gray-900/80 backdrop-blur-md rounded-2xl border border-gray-700/50 shadow-2xl transition-opacity duration-300 ${isIdle && isFullscreen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
          style={{ aspectRatio: '16/9' }}
        >
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover pointer-events-none transition-transform duration-300`}
            style={{ transform: isMirrored ? 'scaleX(-1)' : 'scaleX(1)' }}
          />
          
          {/* Mirror Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              const newState = !isMirrored;
              setIsMirrored(newState);
              sendControlMessage({ type: 'mirror-toggle', isMirrored: newState });
            }}
            className="absolute top-2 left-2 p-2 bg-gray-900/80 backdrop-blur-md hover:bg-blue-500 text-white rounded-full opacity-0 group-hover/pip:opacity-100 transition-all duration-300 shadow-lg border border-gray-700/50 z-40"
            title="Mirror Camera"
          >
            <FlipHorizontal size={16} />
          </button>

          {/* Hide Local Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setHideLocal(true);
            }}
            className="absolute top-2 right-2 p-2 bg-gray-900/80 backdrop-blur-md hover:bg-red-500 text-white rounded-full opacity-0 group-hover/pip:opacity-100 transition-all duration-300 shadow-lg border border-gray-700/50 z-40"
            title="Hide My Video"
          >
            <EyeOff size={16} />
          </button>
        </motion.div>
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
