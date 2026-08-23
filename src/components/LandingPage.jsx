import React, { useState, useEffect } from 'react';
import { useWebRTC } from '../context/useWebRTC';
import { Users, KeyRound, Plus, Activity } from 'lucide-react';
import { Button } from './ui/button';

export const LandingPage = () => {
  const { roomId, roomError, joinRoom, wsStatus, reconnectAttempt } =
    useWebRTC();
  const [roomInput, setRoomInput] = useState('');

  useEffect(() => {
    // Check URL parameters for an existing room code
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');
    if (roomFromUrl && wsStatus === 'connected' && !roomId && !roomError) {
      joinRoom(roomFromUrl);
    }
  }, [wsStatus, roomId, roomError, joinRoom]);

  const handleCreateRoom = () => {
    // Generate a 5-character alphanumeric room code
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    joinRoom(code);

    // Update URL without reloading
    const newUrl =
      window.location.protocol +
      '//' +
      window.location.host +
      window.location.pathname +
      '?room=' +
      code;
    window.history.pushState({ path: newUrl }, '', newUrl);
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (roomInput.trim().length >= 3) {
      const code = roomInput.trim().toUpperCase();
      joinRoom(code);

      const newUrl =
        window.location.protocol +
        '//' +
        window.location.host +
        window.location.pathname +
        '?room=' +
        code;
      window.history.pushState({ path: newUrl }, '', newUrl);
    }
  };

  if (roomId) return null; // Fallback, App.jsx shouldn't render this if roomId exists

  return (
    <main className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#090d0f] px-4 text-white">
      {/* Abstract Background Elements */}
      <div className="pointer-events-none absolute top-0 left-0 h-full w-full overflow-hidden">
        <div className="absolute -top-[20%] -left-[10%] h-[50%] w-[50%] rounded-full bg-teal-300/[0.08] blur-[140px]" />
        <div className="absolute right-[5%] -bottom-[20%] h-[40%] w-[35%] rounded-full bg-teal-700/[0.06] blur-[120px]" />
      </div>

      {/* Connection Status */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 rounded-lg border border-white/[0.08] bg-[#111719]/80 px-3 py-2 shadow-lg backdrop-blur-sm sm:top-8 sm:left-8">
        <Activity
          className={`size-4 ${wsStatus === 'connected' ? 'text-teal-300' : 'text-red-400'}`}
        />
        <span className="text-xs font-medium text-zinc-300">
          Signaling: {wsStatus === 'connected' ? 'Online' : 'Offline'}
        </span>
      </div>

      <section className="relative z-10 flex w-full max-w-md animate-[fadeIn_0.5s_ease-out] flex-col gap-8 rounded-[1.75rem] border border-white/[0.09] bg-[#111719]/75 p-6 shadow-[0_28px_90px_rgba(0,0,0,0.5)] backdrop-blur-2xl sm:p-9">
        <div className="space-y-2 text-center">
          <div className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl border border-teal-300/20 bg-teal-300/[0.08]">
            <Users className="size-7 text-teal-300" />
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.035em] text-white">
            Start a private room
          </h1>
          <p className="mx-auto max-w-[38ch] text-sm leading-6 text-zinc-500">
            Two-person calls, screen sharing, and chat. Nothing is saved after
            the room closes.
          </p>
        </div>

        <Button
          onClick={handleCreateRoom}
          disabled={wsStatus !== 'connected'}
          size="lg"
          className="group w-full"
        >
          <Plus className="size-4" aria-hidden="true" />
          {wsStatus === 'connected' ? 'Create a room' : 'Connecting…'}
        </Button>

        <div className="flex items-center gap-4">
          <div className="h-px flex-1 bg-gray-700/50"></div>
          <span className="text-[10px] font-semibold tracking-[0.2em] text-zinc-600 uppercase">
            or join with a code
          </span>
          <div className="h-px flex-1 bg-gray-700/50"></div>
        </div>

        <form onSubmit={handleJoinRoom} className="flex flex-col gap-4">
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
              <KeyRound size={20} className="text-gray-500" />
            </div>
            <input
              type="text"
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
              placeholder="Enter Room Code (e.g. X7K9P)"
              className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.05] pr-4 pl-12 font-mono text-sm tracking-[0.16em] text-white uppercase transition-colors outline-none placeholder:text-zinc-600 focus-visible:ring-2 focus-visible:ring-teal-300"
              maxLength={8}
            />
          </div>
          <Button
            type="submit"
            disabled={roomInput.trim().length < 3 || wsStatus !== 'connected'}
            variant="secondary"
            className="w-full"
          >
            Join room
          </Button>
        </form>

        {roomError ? (
          <div
            role="alert"
            className="rounded-xl border border-red-400/20 bg-red-400/[0.08] px-4 py-3 text-sm text-red-100"
          >
            {roomError}
          </div>
        ) : null}

        {wsStatus === 'reconnecting' ? (
          <p role="status" className="text-center text-xs text-zinc-500">
            Reconnecting to signaling server
            {reconnectAttempt ? ` · attempt ${reconnectAttempt}` : ''}
          </p>
        ) : null}
      </section>
    </main>
  );
};
