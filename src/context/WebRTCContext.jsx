import React, { useCallback, useRef, useState, useEffect } from 'react';
import { useSignaling } from '../hooks/useSignaling';
import { EMPTY_CONNECTION_STATS, summarizeWebRTCStats } from '../lib/webrtcStats';
import { createEmptyVideoTrack } from '../lib/mediaTracks';
import { WebRTCContext } from './useWebRTC';

const getIceServers = () => {
  const servers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  if (import.meta.env.VITE_TURN_URL) {
    servers.push({
      urls: import.meta.env.VITE_TURN_URL,
      username: import.meta.env.VITE_TURN_USERNAME,
      credential: import.meta.env.VITE_TURN_PASSWORD,
    });
  }

  return { iceServers: servers };
};

export const WebRTCProvider = ({ children }) => {
  // Use Vercel environment variable or fallback to local network dynamic host
  const defaultWsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = import.meta.env.VITE_WS_URL || `${defaultWsProtocol}//${window.location.hostname}:9080`;
  const { status, ws, reconnectAttempt } = useSignaling(wsUrl);

  const pcRef = useRef(null);
  const dataChannelRef = useRef(null);
  const localStreamRef = useRef(null);
  const localScreenStreamRef = useRef(null);
  const audioTransceiverRef = useRef(null);
  const outgoingAudioTrackRef = useRef(null);
  const cameraTransceiverRef = useRef(null);
  const screenTransceiverRef = useRef(null);
  const screenPlaceholderTrackRef = useRef(null);
  const previousStatsRef = useRef(new Map());
  const initPeerConnectionRef = useRef(null);
  const startCallRef = useRef(null);
  const messageSequenceRef = useRef(0);
  const notificationAudioContextRef = useRef(null);
  const lastNotificationSoundAtRef = useRef(0);
  const clientIdRef = useRef(null);
  if (!clientIdRef.current) {
    clientIdRef.current = globalThis.crypto?.randomUUID?.()
      || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  const [remoteStream, setRemoteStream] = useState(null);
  const [remoteScreenStream, setRemoteScreenStream] = useState(null);
  const [localStream, setLocalStreamState] = useState(null);
  const [localScreenStream, setLocalScreenStreamState] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [connected, setConnected] = useState(false);
  const [isScreenSharing, setIsScreenSharingState] = useState(false);
  const [roomId, setRoomId] = useState(null);
  const [roomError, setRoomError] = useState(null);
  const [peerPresence, setPeerPresence] = useState('waiting');
  const [connectionStats, setConnectionStats] = useState(EMPTY_CONNECTION_STATS);
  
  const [isCameraOff, setIsCameraOff] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [remoteMirrored, setRemoteMirrored] = useState(true);
  const [remoteCameraOff, setRemoteCameraOff] = useState(true);
  const [remoteScreenSharing, setRemoteScreenSharing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPresentationMode, setIsPresentationMode] = useState(false);

  const isCameraOffRef = useRef(isCameraOff);
  const isScreenSharingRef = useRef(false);
  useEffect(() => { isCameraOffRef.current = isCameraOff; }, [isCameraOff]);

  const setIsScreenSharing = useCallback((nextValue) => {
    const resolvedValue = typeof nextValue === 'function'
      ? nextValue(isScreenSharingRef.current)
      : nextValue;
    isScreenSharingRef.current = resolvedValue;
    setIsScreenSharingState(resolvedValue);
  }, []);

  // Chat state
  const [isChatOpen, setIsChatOpenState] = useState(false);
  const isChatOpenRef = useRef(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationSoundEnabled, setNotificationSoundEnabledState] = useState(true);
  const notificationSoundEnabledRef = useRef(true);

  const setIsChatOpen = useCallback((nextValue) => {
    const resolvedValue = typeof nextValue === 'function'
      ? nextValue(isChatOpenRef.current)
      : nextValue;
    setIsChatOpenState(resolvedValue);
    isChatOpenRef.current = resolvedValue;
    if (resolvedValue) setUnreadCount(0);
  }, []);

  const setNotificationSoundEnabled = useCallback((nextValue) => {
    const resolvedValue = typeof nextValue === 'function'
      ? nextValue(notificationSoundEnabledRef.current)
      : nextValue;
    notificationSoundEnabledRef.current = resolvedValue;
    setNotificationSoundEnabledState(resolvedValue);
  }, []);

  const playNotificationSound = () => {
    const now = Date.now();
    if (!notificationSoundEnabledRef.current || now - lastNotificationSoundAtRef.current < 1200) {
      return;
    }

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      const ctx = notificationAudioContextRef.current || new AudioContextClass();
      notificationAudioContextRef.current = ctx;
      lastNotificationSoundAtRef.current = now;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.025);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.16);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    } catch {
      // Ignore audio play errors
    }
  };

  useEffect(() => () => {
    notificationAudioContextRef.current?.close().catch(() => {});
    notificationAudioContextRef.current = null;
  }, []);

  const createChatMessage = (text, from) => ({
    id: `${clientIdRef.current}-${Date.now()}-${messageSequenceRef.current++}`,
    text,
    from,
    sentAt: Date.now(),
  });

  const pendingCandidates = useRef([]);

  const bindTransceivers = useCallback((pc) => {
    const transceivers = pc.getTransceivers();
    const videoTransceivers = transceivers.filter(
      transceiver => transceiver.receiver.track.kind === 'video',
    );

    audioTransceiverRef.current = transceivers.find(
      transceiver => transceiver.receiver.track.kind === 'audio',
    ) || null;
    cameraTransceiverRef.current = videoTransceivers[0] || null;
    screenTransceiverRef.current = videoTransceivers[1] || null;
  }, []);

  const resetRemotePeer = () => {
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    pendingCandidates.current = [];
    audioTransceiverRef.current = null;
    cameraTransceiverRef.current = null;
    screenTransceiverRef.current = null;
    screenPlaceholderTrackRef.current?.stop();
    screenPlaceholderTrackRef.current = null;
    previousStatsRef.current = new Map();
    setConnectionStats(EMPTY_CONNECTION_STATS);
    setRemoteStream(null);
    setRemoteScreenStream(null);
    setRemoteScreenSharing(false);
    setRemoteCameraOff(true);
    setConnected(false);
  };

  const handleDataMessage = event => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'mirror-toggle' && typeof data.isMirrored === 'boolean') {
        setRemoteMirrored(data.isMirrored);
        return;
      }
      if (data.type === 'camera-toggle' && typeof data.isCameraOff === 'boolean') {
        setRemoteCameraOff(data.isCameraOff);
        return;
      }
      if (data.type === 'screen-toggle' && typeof data.isScreenSharing === 'boolean') {
        setRemoteScreenSharing(data.isScreenSharing);
        return;
      }
      if (data.type === 'chat' && typeof data.text === 'string' && data.text.length <= 2000) {
        setChatMessages(previous => [...previous, createChatMessage(data.text, 'remote')]);
        if (!isChatOpenRef.current) {
          setUnreadCount(previous => previous + 1);
          playNotificationSound();
        }
      }
      return;
    } catch {
      // Ignore malformed data-channel payloads.
    }
  };

  const configureDataChannel = channel => {
    const sendInitialState = () => {
      if (channel.readyState !== 'open') return;
      channel.send(JSON.stringify({ type: 'camera-toggle', isCameraOff: isCameraOffRef.current }));
      channel.send(JSON.stringify({ type: 'screen-toggle', isScreenSharing: isScreenSharingRef.current }));
    };

    channel.onmessage = handleDataMessage;
    channel.onopen = sendInitialState;
    if (channel.readyState === 'open') sendInitialState();
    dataChannelRef.current = channel;
  };

  useEffect(() => {
    if (status !== 'connected' || !ws) return;

    ws.onmessage = async (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      console.log("[Signaling] Received message:", msg.type);

      if (msg.type === 'room-joined') {
        setRoomError(null);
        setPeerPresence(msg.participantCount > 1 ? 'joining' : 'waiting');
      } else if (msg.type === 'room-full') {
        resetRemotePeer();
        setRoomError('That room already has two participants.');
        setRoomId(null);
        setPeerPresence('waiting');
      } else if (msg.type === 'room-error') {
        resetRemotePeer();
        setRoomError(msg.message || 'Unable to join that room.');
        setRoomId(null);
      } else if (msg.type === 'peer-left') {
        resetRemotePeer();
        setChatMessages([]);
        setUnreadCount(0);
        setIsChatOpen(false);
        setPeerPresence('left');
      } else if (msg.type === 'peer-joined') {
        console.log("[Signaling] Peer joined. Initiating call...");
        resetRemotePeer();
        setPeerPresence('joining');
        startCallRef.current?.();
      } else if (msg.type === 'offer') {
        try {
          if (pcRef.current) resetRemotePeer();
          setPeerPresence('joining');
          initPeerConnectionRef.current?.(false);
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg));
          bindTransceivers(pcRef.current);

          pendingCandidates.current.forEach(async c => {
            try { await pcRef.current.addIceCandidate(c); } catch (e) { console.error('ICE error', e); }
          });
          pendingCandidates.current = [];

          // Force incoming transceivers to sendrecv and attach local tracks!
          // This guarantees the Joiner negotiates sending tracks, firing ontrack on the Creator.
          const audioTrack = outgoingAudioTrackRef.current?.readyState === 'live'
            ? outgoingAudioTrackRef.current
            : localStreamRef.current?.getAudioTracks()[0];
          const videoTrack = localStreamRef.current?.getVideoTracks()[0];
          const screenTrack = localScreenStreamRef.current?.getVideoTracks()[0];
          
          if (audioTransceiverRef.current) {
            audioTransceiverRef.current.direction = 'sendrecv';
            if (audioTrack) await audioTransceiverRef.current.sender.replaceTrack(audioTrack);
          }
          if (cameraTransceiverRef.current) {
            cameraTransceiverRef.current.direction = 'sendrecv';
            if (videoTrack) await cameraTransceiverRef.current.sender.replaceTrack(videoTrack);
          }
          if (screenTransceiverRef.current) {
            screenTransceiverRef.current.direction = 'sendrecv';
            const outgoingScreenTrack = screenTrack || createEmptyVideoTrack();
            if (outgoingScreenTrack) {
              await screenTransceiverRef.current.sender.replaceTrack(outgoingScreenTrack);
              if (!screenTrack) screenPlaceholderTrackRef.current = outgoingScreenTrack;
            }
          }

          const answer = await pcRef.current.createAnswer();
          await pcRef.current.setLocalDescription(answer);
          console.log("[Signaling] Sending answer");
          ws.send(JSON.stringify(pcRef.current.localDescription));
        } catch (err) {
          console.error("[WebRTC] Error handling offer:", err);
        }
      } else if (msg.type === 'answer') {
        if (!pcRef.current) return;
        console.log("[Signaling] Received answer");
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg));

        pendingCandidates.current.forEach(c => pcRef.current.addIceCandidate(c));
        pendingCandidates.current = [];
      } else if (msg.type === 'candidate') {
        try {
          const candidate = new RTCIceCandidate(msg.candidate);
          if (pcRef.current && pcRef.current.remoteDescription && pcRef.current.remoteDescription.type) {
            await pcRef.current.addIceCandidate(candidate);
            console.log("[WebRTC] Added ICE candidate");
          } else {
            pendingCandidates.current.push(candidate);
            console.log("[WebRTC] Queued ICE candidate");
          }
        } catch (err) {
          console.error("[WebRTC] Error handling candidate:", err);
        }
      }
    };
  }, [status, ws, bindTransceivers, setIsChatOpen]);

  useEffect(() => {
    if (!roomId || status !== 'connected' || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      type: 'join-room',
      roomId,
      clientId: clientIdRef.current,
    }));
  }, [roomId, status, ws]);

  const initPeerConnection = (isCaller = false) => {
    console.log(`[WebRTC] Initializing PeerConnection (isCaller: ${isCaller})`);
    if (pcRef.current) return;

    const pc = new RTCPeerConnection(getIceServers());
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
        console.log("[WebRTC] Sending ICE candidate");
        ws.send(JSON.stringify({ type: 'candidate', candidate: event.candidate }));
      }
    };

    pc.ontrack = (event) => {
      console.log("[WebRTC] Track received:", event.track.kind);

      if (!screenTransceiverRef.current) bindTransceivers(pc);
      const screenTransceiver = screenTransceiverRef.current;
      const isScreen = event.track.kind === 'video' && (
        event.transceiver === screenTransceiver
        || (screenTransceiver?.mid && event.transceiver.mid === screenTransceiver.mid)
      );
      
      if (!isScreen) {
        // Audio or Camera
        setRemoteStream(prev => {
          if (prev) {
            if (!prev.getTracks().find(t => t.id === event.track.id)) {
              prev.addTrack(event.track);
            }
            return new MediaStream(prev.getTracks());
          }
          return new MediaStream([event.track]);
        });
      } else {
        // Screen Share
        setRemoteScreenStream(prev => {
          if (prev) {
            if (!prev.getTracks().find(t => t.id === event.track.id)) {
              prev.addTrack(event.track);
            }
            return new MediaStream(prev.getTracks());
          }
          return new MediaStream([event.track]);
        });

        event.track.onended = () => {
          setRemoteScreenStream(current => (
            current?.getTracks().some(track => track.id === event.track.id) ? null : current
          ));
          setRemoteScreenSharing(false);
        };
      }
    };

    pc.ondatachannel = (event) => {
      configureDataChannel(event.channel);
    };

    pc.onconnectionstatechange = () => {
      console.log("[WebRTC] Connection state changed:", pc.connectionState);
      if (pc.connectionState === 'connected') {
        setConnected(true);
        setPeerPresence('connected');
      } else if (pc.connectionState === 'disconnected') {
        setConnected(false);
        setPeerPresence('reconnecting');
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        setConnected(false);
        setRemoteScreenSharing(false);
        setRemoteScreenStream(null);
      }
    };
    
    pc.oniceconnectionstatechange = () => {
      console.log("[WebRTC] ICE Connection state:", pc.iceConnectionState);
    };

    if (isCaller) {
      const audioTrack = outgoingAudioTrackRef.current?.readyState === 'live'
        ? outgoingAudioTrackRef.current
        : localStreamRef.current?.getAudioTracks()[0];
      const videoTrack = localStreamRef.current?.getVideoTracks()[0];
      const screenTrack = localScreenStreamRef.current?.getVideoTracks()[0];

      if (audioTrack) {
        audioTransceiverRef.current = pc.addTransceiver(audioTrack, { direction: 'sendrecv' });
      } else {
        audioTransceiverRef.current = pc.addTransceiver('audio', { direction: 'sendrecv' });
      }

      if (videoTrack) {
        cameraTransceiverRef.current = pc.addTransceiver(videoTrack, { direction: 'sendrecv' });
      } else {
        cameraTransceiverRef.current = pc.addTransceiver('video', { direction: 'sendrecv' });
      }

      const outgoingScreenTrack = screenTrack || createEmptyVideoTrack();
      if (!screenTrack) screenPlaceholderTrackRef.current = outgoingScreenTrack;
      screenTransceiverRef.current = outgoingScreenTrack
        ? pc.addTransceiver(outgoingScreenTrack, { direction: 'sendrecv' })
        : pc.addTransceiver('video', { direction: 'sendrecv' });
    }
  };
  initPeerConnectionRef.current = initPeerConnection;

  const joinRoom = (id) => {
    const normalizedRoomId = id.trim().toUpperCase();
    setRoomError(null);
    setPeerPresence('waiting');
    setRoomId(normalizedRoomId);
  };

  const startCall = async () => {
    console.log("[WebRTC] Starting call...");
    initPeerConnection(true);

    const dc = pcRef.current.createDataChannel('chat');
    configureDataChannel(dc);

    const offer = await pcRef.current.createOffer();
    await pcRef.current.setLocalDescription(offer);
    console.log("[Signaling] Sending offer");
    ws.send(JSON.stringify(pcRef.current.localDescription));
  };
  startCallRef.current = startCall;

  const sendMessage = (text) => {
    if (text.length <= 2000 && dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      dataChannelRef.current.send(JSON.stringify({ type: 'chat', text }));
      setChatMessages(prev => [...prev, createChatMessage(text, 'local')]);
      return true;
    } else {
      console.warn("Data channel is not open");
      return false;
    }
  };

  const sendControlMessage = (data) => {
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      dataChannelRef.current.send(JSON.stringify(data));
    }
  };

  const endCall = () => {
    resetRemotePeer();
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    localScreenStreamRef.current?.getTracks().forEach(track => track.stop());
    localStreamRef.current = null;
    localScreenStreamRef.current = null;
    outgoingAudioTrackRef.current = null;
    setLocalStreamState(null);
    setLocalScreenStreamState(null);
    setIsScreenSharing(false);
    setChatMessages([]);
    setUnreadCount(0);
    setIsChatOpen(false);
    setIsPresentationMode(false);
    setPeerPresence('waiting');
    notificationAudioContextRef.current?.close().catch(() => {});
    notificationAudioContextRef.current = null;
  };

  const getSender = (kind, isScreen = false) => {
    if (!pcRef.current) return null;
    if (!audioTransceiverRef.current || !cameraTransceiverRef.current || !screenTransceiverRef.current) {
      bindTransceivers(pcRef.current);
    }

    if (kind === 'audio') return audioTransceiverRef.current?.sender || null;
    if (kind === 'video' && !isScreen) return cameraTransceiverRef.current?.sender || null;
    if (kind === 'video' && isScreen) return screenTransceiverRef.current?.sender || null;
    return null;
  };

  const setCameraStream = (stream) => {
    localStreamRef.current = stream;
    setLocalStreamState(stream);

    const replacements = [];
    if (pcRef.current) {
      stream.getTracks().forEach(track => {
        if (track.kind === 'audio' && isScreenSharingRef.current) return;
        const sender = getSender(track.kind, false);
        if (track.kind === 'audio') outgoingAudioTrackRef.current = track;
        if (sender) replacements.push(sender.replaceTrack(track));
      });
    } else if (!isScreenSharingRef.current) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) outgoingAudioTrackRef.current = audioTrack;
    }

    return Promise.all(replacements).catch(error => {
      console.warn('Failed to update a camera or microphone sender', error);
      throw error;
    });
  };

  const setOutgoingAudioTrack = async (track) => {
    outgoingAudioTrackRef.current = track;
    const sender = getSender('audio');
    if (sender) await sender.replaceTrack(track);
  };

  const setScreenStream = async (stream) => {
    const videoTrack = stream?.getVideoTracks()[0] || null;
    if (stream && !videoTrack) throw new Error('The selected screen has no video track.');

    if (pcRef.current) {
      const sender = getSender('video', true);
      if (!sender) throw new Error('The screen-share sender is not ready.');
      const outgoingTrack = videoTrack || createEmptyVideoTrack();
      if (!outgoingTrack) throw new Error('Unable to keep the screen-share sender active.');
      await sender.replaceTrack(outgoingTrack);

      if (screenPlaceholderTrackRef.current && screenPlaceholderTrackRef.current !== outgoingTrack) {
        screenPlaceholderTrackRef.current.stop();
      }
      screenPlaceholderTrackRef.current = videoTrack ? null : outgoingTrack;
    }

    localScreenStreamRef.current = stream;
    setLocalScreenStreamState(stream);
  };

  useEffect(() => {
    if (!connected) {
      previousStatsRef.current = new Map();
      setConnectionStats(EMPTY_CONNECTION_STATS);
      return;
    }

    let cancelled = false;
    let sampling = false;

    const sample = async () => {
      const pc = pcRef.current;
      if (!pc || pc.connectionState !== 'connected' || sampling) return;

      sampling = true;
      try {
        const report = await pc.getStats();
        if (cancelled) return;
        const summary = summarizeWebRTCStats(report, previousStatsRef.current);
        previousStatsRef.current = summary.samples;
        setConnectionStats(summary.stats);
      } catch (error) {
        console.warn('[WebRTC] Failed to collect connection statistics', error);
      } finally {
        sampling = false;
      }
    };

    sample();
    const interval = window.setInterval(sample, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [connected]);

  return (
    <WebRTCContext.Provider value={{
      wsStatus: status,
      reconnectAttempt,
      localStream,
      localScreenStream,
      remoteStream,
      remoteScreenStream,
      chatMessages,
      startCall,
      endCall,
      sendMessage,
      sendControlMessage,
      setCameraStream,
      setOutgoingAudioTrack,
      setScreenStream,
      getSender,
      connected,
      isScreenSharing,
      setIsScreenSharing,
      isCameraOff,
      setIsCameraOff,
      isMuted,
      setIsMuted,
      remoteMirrored,
      remoteCameraOff,
      remoteScreenSharing,
      peerPresence,
      connectionStats,
      roomId,
      roomError,
      joinRoom,
      isFullscreen,
      setIsFullscreen,
      isPresentationMode,
      setIsPresentationMode,
      isChatOpen,
      setIsChatOpen,
      unreadCount,
      notificationSoundEnabled,
      setNotificationSoundEnabled,
    }}>
      {children}
    </WebRTCContext.Provider>
  );
};
