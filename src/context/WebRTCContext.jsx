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
  const [localStream, setLocalStreamState] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [connected, setConnected] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [roomId, setRoomId] = useState(null);
  
  const [isCameraOff, setIsCameraOff] = useState(true);
  const [isMuted, setIsMuted] = useState(true);

  const pendingCandidates = useRef([]);

  useEffect(() => {
    if (status !== 'connected' || !ws) return;

    ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === 'offer') {
        try {
          if (!pcRef.current) initPeerConnection(false);
          // If we already have a local offer, this is glare. For simplicity, just ignore or overwrite.
          // Using setRemoteDescription might throw if we are in have-local-offer, let's catch it.
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg));

          pendingCandidates.current.forEach(async c => {
            try { await pcRef.current.addIceCandidate(c); } catch (e) { console.error('ICE error', e); }
          });
          pendingCandidates.current = [];

          const answer = await pcRef.current.createAnswer();
          await pcRef.current.setLocalDescription(answer);
          ws.send(JSON.stringify(pcRef.current.localDescription));
        } catch (err) {
          console.error("Error handling offer:", err);
        }
      } else if (msg.type === 'answer') {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg));

        pendingCandidates.current.forEach(c => pcRef.current.addIceCandidate(c));
        pendingCandidates.current = [];
      } else if (msg.type === 'candidate') {
        try {
          const candidate = new RTCIceCandidate(msg.candidate);
          if (pcRef.current && pcRef.current.remoteDescription && pcRef.current.remoteDescription.type) {
            await pcRef.current.addIceCandidate(candidate);
          } else {
            pendingCandidates.current.push(candidate);
          }
        } catch (err) {
          console.error("Error handling candidate:", err);
        }
      }
    };
  }, [status, ws]);

  const initPeerConnection = (isCaller = false) => {
    if (pcRef.current) return;

    const pc = new RTCPeerConnection(getIceServers());
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'candidate', candidate: event.candidate }));
      }
    };

    pc.ontrack = (event) => {
      if (event.streams && event.streams.length > 0) {
        setRemoteStream(event.streams[0]);
      } else {
        setRemoteStream(prev => {
          if (prev) {
            // Check if track is already added to prevent duplicates
            if (!prev.getTracks().find(t => t.id === event.track.id)) {
              prev.addTrack(event.track);
            }
            return prev;
          }
          return new MediaStream([event.track]);
        });
      }
    };

    pc.ondatachannel = (event) => {
      dataChannelRef.current = event.channel;
      event.channel.onmessage = (e) => {
        setChatMessages(prev => [...prev, { text: e.data, from: 'remote' }]);
      };
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setConnected(true);
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        setConnected(false);
      }
    };

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    } else {
      // Pre-allocate transceivers for both Caller and Answerer!
      // If we are answering, setRemoteDescription will recycle these and keep them as sendrecv.
      // If we don't do this, the answerer's transceivers default to recvonly, and replaceTrack will silently fail to send video later!
      pc.addTransceiver('audio', { direction: 'sendrecv' });
      pc.addTransceiver('video', { direction: 'sendrecv' });
    }
  };

  const joinRoom = (id) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'join-room', roomId: id }));
      setRoomId(id);
    }
  };

  const startCall = async () => {
    initPeerConnection(true);

    const dc = pcRef.current.createDataChannel('chat');
    dc.onmessage = (e) => {
      setChatMessages(prev => [...prev, { text: e.data, from: 'remote' }]);
    };
    dataChannelRef.current = dc;

    const offer = await pcRef.current.createOffer();
    await pcRef.current.setLocalDescription(offer);
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

  const endCall = () => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setRemoteStream(null);
    setChatMessages([]);
    setConnected(false);
  };

  const setLocalMediaStream = (stream) => {
    localStreamRef.current = stream;
    setLocalStreamState(stream);

    // If peer connection exists, add or replace tracks
    if (pcRef.current) {
      const transceivers = pcRef.current.getTransceivers();
      stream.getTracks().forEach(track => {
        const transceiver = transceivers.find(t => t.receiver && t.receiver.track && t.receiver.track.kind === track.kind);
        if (transceiver && transceiver.sender) {
          transceiver.sender.replaceTrack(track);
        } else {
          pcRef.current.addTrack(track, stream);
        }
      });
    }
  };

  const getSender = (kind) => {
    if (!pcRef.current) return null;
    const transceiver = pcRef.current.getTransceivers().find(t => t.receiver && t.receiver.track && t.receiver.track.kind === kind);
    return transceiver ? transceiver.sender : null;
  };

  return (
    <WebRTCContext.Provider value={{
      wsStatus: status,
      localStream,
      remoteStream,
      chatMessages,
      startCall,
      endCall,
      sendMessage,
      setLocalMediaStream,
      getSender,
      connected,
      isScreenSharing,
      setIsScreenSharing,
      isCameraOff,
      setIsCameraOff,
      isMuted,
      setIsMuted,
      roomId,
      joinRoom
    }}>
      {children}
    </WebRTCContext.Provider>
  );
};
