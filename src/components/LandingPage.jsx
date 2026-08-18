import React, { useState, useEffect } from 'react';
import { useWebRTC } from '../context/WebRTCContext';
import { Users, KeyRound, Sparkles, Activity } from 'lucide-react';

export const LandingPage = () => {
  const { roomId, joinRoom, wsStatus, startCall } = useWebRTC();
  const [roomInput, setRoomInput] = useState('');

  useEffect(() => {
    // Check URL parameters for an existing room code
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');
    if (roomFromUrl && wsStatus === 'connected' && !roomId) {
      joinRoom(roomFromUrl);
      // Wait for components to mount before initiating the WebRTC offer
      setTimeout(() => startCall(), 500);
    }
  }, [wsStatus, roomId, joinRoom, startCall]);

  const handleCreateRoom = () => {
    // Generate a 5-character alphanumeric room code
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    joinRoom(code);
    
    // Update URL without reloading
    const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?room=' + code;
    window.history.pushState({ path: newUrl }, '', newUrl);
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (roomInput.trim().length > 0) {
      const code = roomInput.trim().toUpperCase();
      joinRoom(code);
      // Joiner initiates the call
      setTimeout(() => startCall(), 500);
      
      const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?room=' + code;
      window.history.pushState({ path: newUrl }, '', newUrl);
    }
  };

  if (roomId) return null; // Fallback, App.jsx shouldn't render this if roomId exists

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0f172a] text-white">
      {/* Abstract Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-blue-600/20 rounded-full blur-[120px]"></div>
        <div className="absolute top-[60%] -right-[10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[100px]"></div>
      </div>

      {/* Connection Status */}
      <div className="absolute top-8 left-8 flex items-center gap-2 bg-gray-900/80 backdrop-blur-sm px-4 py-2 rounded-full border border-gray-700/50 shadow-lg z-10">
        <Activity size={16} className={wsStatus === 'connected' ? 'text-green-500' : 'text-red-500'} />
        <span className="text-sm font-medium text-gray-200">
          Signaling: {wsStatus === 'connected' ? 'Online' : 'Offline'}
        </span>
      </div>

      <div className="relative z-10 bg-gray-900/40 backdrop-blur-2xl p-10 rounded-3xl border border-gray-700/50 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.8)] w-full max-w-md flex flex-col gap-8 animate-[fadeIn_0.5s_ease-out]">
        
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-full bg-blue-600/20 flex items-center justify-center mx-auto mb-4 border border-blue-500/30">
            <Users size={32} className="text-blue-400" />
          </div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Join a Room</h2>
          <p className="text-gray-400 text-sm">Create a new secure P2P room or join an existing one to start a call.</p>
        </div>

        <button 
          onClick={handleCreateRoom}
          disabled={wsStatus !== 'connected'}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-500 text-white font-semibold py-4 rounded-xl shadow-[0_0_20px_rgba(37,99,235,0.4)] disabled:shadow-none transition-all flex items-center justify-center gap-3 group"
        >
          <Sparkles size={20} className="group-hover:animate-pulse" />
          {wsStatus === 'connected' ? 'Create New Room' : 'Connecting to Server...'}
        </button>

        <div className="flex items-center gap-4">
          <div className="h-px bg-gray-700/50 flex-1"></div>
          <span className="text-xs text-gray-500 font-semibold uppercase tracking-widest">OR</span>
          <div className="h-px bg-gray-700/50 flex-1"></div>
        </div>

        <form onSubmit={handleJoinRoom} className="flex flex-col gap-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <KeyRound size={20} className="text-gray-500" />
            </div>
            <input 
              type="text"
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
              placeholder="Enter Room Code (e.g. X7K9P)"
              className="w-full bg-gray-800/50 border border-gray-700/50 rounded-xl pl-12 pr-4 py-4 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:bg-gray-800 transition-all font-mono tracking-widest uppercase shadow-inner"
              maxLength={8}
            />
          </div>
          <button 
            type="submit"
            disabled={!roomInput.trim() || wsStatus !== 'connected'}
            className="w-full bg-gray-800 hover:bg-gray-700 disabled:bg-gray-900/50 disabled:text-gray-600 border border-gray-700 text-white font-semibold py-4 rounded-xl transition-all"
          >
            Join Existing Room
          </button>
        </form>

      </div>
    </div>
  );
};
