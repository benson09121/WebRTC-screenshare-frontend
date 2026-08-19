import React, { createContext, useContext, useRef, useState, useEffect } from 'react';
import { useSignaling } from '../hooks/useSignaling';

const WebRTCContext = createContext();

export const useWebRTC = () => useContext(WebRTCContext);

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
  const { status, ws } = useSignaling(wsUrl);

  const pcRef = useRef(null);
  const dataChannelRef = useRef(null);
  const localStreamRef = useRef(null);

  const [remoteStream, setRemoteStream] = useState(null);
  const [remoteScreenStream, setRemoteScreenStream] = useState(null);
  const [localStream, setLocalStreamState] = useState(null);
  const [localScreenStream, setLocalScreenStreamState] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [connected, setConnected] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [roomId, setRoomId] = useState(null);
  
  const [isCameraOff, setIsCameraOff] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [remoteMirrored, setRemoteMirrored] = useState(true);
  const [remoteCameraOff, setRemoteCameraOff] = useState(true);
  const [remoteScreenSharing, setRemoteScreenSharing] = useState(false);

  const isCameraOffRef = useRef(isCameraOff);
  const isScreenSharingRef = useRef(isScreenSharing);
  useEffect(() => { isCameraOffRef.current = isCameraOff; }, [isCameraOff]);
  useEffect(() => { isScreenSharingRef.current = isScreenSharing; }, [isScreenSharing]);

  // Chat state
  const [isChatOpen, setIsChatOpenState] = useState(false);
  const isChatOpenRef = useRef(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const setIsChatOpen = (val) => {
    setIsChatOpenState(val);
    isChatOpenRef.current = val;
    if (val) setUnreadCount(0);
  };

  const playNotificationSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch (e) {
      // Ignore audio play errors
    }
  };

  const pendingCandidates = useRef([]);

  useEffect(() => {
    if (status !== 'connected' || !ws) return;

    ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data);
      console.log("[Signaling] Received message:", msg.type);

      if (msg.type === 'peer-joined') {
        console.log("[Signaling] Peer joined. Initiating call...");
        startCall();
      } else if (msg.type === 'offer') {
        try {
          if (!pcRef.current) initPeerConnection(false);
          // If we already have a local offer, this is glare. For simplicity, just ignore or overwrite.
          // Using setRemoteDescription might throw if we are in have-local-offer, let's catch it.
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg));

          pendingCandidates.current.forEach(async c => {
            try { await pcRef.current.addIceCandidate(c); } catch (e) { console.error('ICE error', e); }
          });
          pendingCandidates.current = [];

          // Force incoming transceivers to sendrecv and attach local tracks!
          // This guarantees the Joiner negotiates sending tracks, firing ontrack on the Creator.
          const transceivers = pcRef.current.getTransceivers();
          const audioTransceivers = transceivers.filter(t => t.receiver.track.kind === 'audio');
          const videoTransceivers = transceivers.filter(t => t.receiver.track.kind === 'video');
          
          const audioTrack = localStreamRef.current?.getAudioTracks()[0];
          const videoTrack = localStreamRef.current?.getVideoTracks()[0];
          
          if (audioTransceivers[0]) {
            audioTransceivers[0].direction = 'sendrecv';
            if (audioTrack) audioTransceivers[0].sender.replaceTrack(audioTrack).catch(e => console.warn(e));
          }
          if (videoTransceivers[0]) {
            videoTransceivers[0].direction = 'sendrecv';
            if (videoTrack) videoTransceivers[0].sender.replaceTrack(videoTrack).catch(e => console.warn(e));
          }
          if (videoTransceivers[1]) {
            videoTransceivers[1].direction = 'sendrecv';
          }

          const answer = await pcRef.current.createAnswer();
          await pcRef.current.setLocalDescription(answer);
          console.log("[Signaling] Sending answer");
          ws.send(JSON.stringify(pcRef.current.localDescription));
        } catch (err) {
          console.error("[WebRTC] Error handling offer:", err);
        }
      } else if (msg.type === 'answer') {
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
  }, [status, ws]);

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
      
      const transceivers = pc.getTransceivers();
      const videoTransceivers = transceivers.filter(t => t.receiver.track.kind === 'video');
      
      // The second video transceiver is the screen share
      const isScreen = event.track.kind === 'video' && event.transceiver === videoTransceivers[1];
      
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
      }
    };

    pc.ondatachannel = (event) => {
      const sendInitialState = () => {
        try {
          event.channel.send(JSON.stringify({ type: 'camera-toggle', isCameraOff: isCameraOffRef.current }));
          event.channel.send(JSON.stringify({ type: 'screen-toggle', isScreenSharing: isScreenSharingRef.current }));
        } catch (e) {}
      };

      if (event.channel.readyState === 'open') {
        sendInitialState();
      } else {
        event.channel.onopen = sendInitialState;
      }

      event.channel.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'mirror-toggle') {
            setRemoteMirrored(data.isMirrored);
            return;
          }
          if (data.type === 'camera-toggle') {
            setRemoteCameraOff(data.isCameraOff);
            return;
          }
          if (data.type === 'screen-toggle') {
            setRemoteScreenSharing(data.isScreenSharing);
            return;
          }
        } catch (err) {}
        setChatMessages(prev => [...prev, { text: e.data, from: 'remote' }]);
        if (!isChatOpenRef.current) {
          setUnreadCount(prev => prev + 1);
          playNotificationSound();
        }
      };
      dataChannelRef.current = event.channel;
    };

    pc.onconnectionstatechange = () => {
      console.log("[WebRTC] Connection state changed:", pc.connectionState);
      if (pc.connectionState === 'connected') {
        setConnected(true);
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        setConnected(false);
      }
    };
    
    pc.oniceconnectionstatechange = () => {
      console.log("[WebRTC] ICE Connection state:", pc.iceConnectionState);
    };

    if (isCaller) {
      const audioTrack = localStreamRef.current?.getAudioTracks()[0];
      const videoTrack = localStreamRef.current?.getVideoTracks()[0];

      if (audioTrack) {
        pc.addTransceiver(audioTrack, { direction: 'sendrecv' });
      } else {
        pc.addTransceiver('audio', { direction: 'sendrecv' });
      }

      if (videoTrack) {
        pc.addTransceiver(videoTrack, { direction: 'sendrecv' });
      } else {
        pc.addTransceiver('video', { direction: 'sendrecv' });
      }

      pc.addTransceiver('video', { direction: 'sendrecv' }); // Screen Share
    }
  };

  const joinRoom = (id) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'join-room', roomId: id }));
      setRoomId(id);
    }
  };

  const startCall = async () => {
    console.log("[WebRTC] Starting call...");
    initPeerConnection(true);

    const dc = pcRef.current.createDataChannel('chat');
    dc.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'mirror-toggle') {
          setRemoteMirrored(data.isMirrored);
          return;
        }
        if (data.type === 'camera-toggle') {
          setRemoteCameraOff(data.isCameraOff);
          return;
        }
        if (data.type === 'screen-toggle') {
          setRemoteScreenSharing(data.isScreenSharing);
          return;
        }
      } catch (err) {}
      setChatMessages(prev => [...prev, { text: e.data, from: 'remote' }]);
      if (!isChatOpenRef.current) {
        setUnreadCount(prev => prev + 1);
        playNotificationSound();
      }
    };
    dc.onopen = () => {
      try {
        dc.send(JSON.stringify({ type: 'camera-toggle', isCameraOff: isCameraOffRef.current }));
        dc.send(JSON.stringify({ type: 'screen-toggle', isScreenSharing: isScreenSharingRef.current }));
      } catch (e) {}
    };
    dataChannelRef.current = dc;

    const offer = await pcRef.current.createOffer();
    await pcRef.current.setLocalDescription(offer);
    console.log("[Signaling] Sending offer");
    ws.send(JSON.stringify(pcRef.current.localDescription));
  };

  const sendMessage = (text) => {
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      dataChannelRef.current.send(text);
      setChatMessages(prev => [...prev, { text, from: 'local' }]);
    } else {
      console.warn("Data channel is not open");
    }
  };

  const sendControlMessage = (data) => {
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      dataChannelRef.current.send(JSON.stringify(data));
    }
  };

  const endCall = () => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setRemoteStream(null);
    setRemoteScreenStream(null);
    setChatMessages([]);
    setConnected(false);
  };

  const getSender = (kind, isScreen = false) => {
    if (!pcRef.current) return null;
    const transceivers = pcRef.current.getTransceivers();
    const audioTransceivers = transceivers.filter(t => t.receiver.track.kind === 'audio');
    const videoTransceivers = transceivers.filter(t => t.receiver.track.kind === 'video');
    
    if (kind === 'audio') return audioTransceivers[0]?.sender || null;
    if (kind === 'video' && !isScreen) return videoTransceivers[0]?.sender || null;
    if (kind === 'video' && isScreen) return videoTransceivers[1]?.sender || null;
    return null;
  };

  const setCameraStream = (stream) => {
    localStreamRef.current = stream;
    setLocalStreamState(stream);

    if (pcRef.current) {
      stream.getTracks().forEach(track => {
        const sender = getSender(track.kind, false);
        if (sender) sender.replaceTrack(track).catch(e => console.warn(e));
      });
    }
  };

  const setScreenStream = (stream) => {
    setLocalScreenStreamState(stream);

    if (pcRef.current) {
      if (stream) {
        stream.getTracks().forEach(track => {
          if (track.kind === 'video') {
            const sender = getSender('video', true);
            if (sender) sender.replaceTrack(track).catch(e => console.warn(e));
          }
        });
      } else {
        const sender = getSender('video', true);
        if (sender) sender.replaceTrack(null).catch(e => console.warn(e));
      }
    }
  };

  return (
    <WebRTCContext.Provider value={{
      wsStatus: status,
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
      roomId,
      joinRoom,
      isChatOpen,
      setIsChatOpen,
      unreadCount
    }}>
      {children}
    </WebRTCContext.Provider>
  );
};
