import React, { useCallback, useRef, useState, useEffect } from 'react';
import { useSignaling } from '../hooks/useSignaling';
import { EMPTY_CONNECTION_STATS, summarizeWebRTCStats } from '../lib/webrtcStats';
import { createEmptyAudioTrack, createEmptyVideoTrack } from '../lib/mediaTracks';
import { DEFAULT_PLAYBACK_VOLUMES, normalizePlaybackVolume } from '../lib/playbackVolume';
import { sanitizeSharedDirectMediaUrl } from '../lib/movieShare';
import { WebRTCContext } from './useWebRTC';

const getIceServers = () => {
  const configuredStunUrls = import.meta.env.VITE_STUN_URLS
    ?.split(',')
    .map(url => url.trim())
    .filter(Boolean);
  const servers = [
    {
      urls: configuredStunUrls?.length
        ? configuredStunUrls
        : ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
    },
  ];

  const configuredTurnUrls = (import.meta.env.VITE_TURN_URLS || import.meta.env.VITE_TURN_URL)
    ?.split(',')
    .map(url => url.trim())
    .filter(Boolean);
  if (configuredTurnUrls?.length) {
    servers.push({
      urls: configuredTurnUrls,
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
  const signalingSocketRef = useRef(ws);
  const disconnectRecoveryTimerRef = useRef(null);
  const isCallerRef = useRef(false);
  const iceRestartInFlightRef = useRef(false);
  const restartIceRef = useRef(null);
  const dataChannelRef = useRef(null);
  const localStreamRef = useRef(null);
  const localScreenStreamRef = useRef(null);
  const audioTransceiverRef = useRef(null);
  const outgoingAudioTrackRef = useRef(null);
  const audioPlaceholderTrackRef = useRef(null);
  const contentAudioTransceiverRef = useRef(null);
  const contentAudioPlaceholderTrackRef = useRef(null);
  const localContentAudioTrackRef = useRef(null);
  const contentAssociationStreamRef = useRef(null);
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
  const [movieControlRequest, setMovieControlRequest] = useState(null);
  const [participantVolume, setParticipantVolumeState] = useState(DEFAULT_PLAYBACK_VOLUMES.participant);
  const [screenVolume, setScreenVolumeState] = useState(DEFAULT_PLAYBACK_VOLUMES.screen);
  const [movieVolume, setMovieVolumeState] = useState(DEFAULT_PLAYBACK_VOLUMES.movie);
  
  const [isCameraOff, setIsCameraOff] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [remoteMirrored, setRemoteMirrored] = useState(true);
  const [remoteCameraOff, setRemoteCameraOff] = useState(true);
  const [remoteScreenSharing, setRemoteScreenSharing] = useState(false);
  const [localShareSource, setLocalShareSource] = useState(null);
  const [remoteShareSource, setRemoteShareSource] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPresentationMode, setIsPresentationMode] = useState(false);

  const setParticipantVolume = useCallback(value => {
    setParticipantVolumeState(normalizePlaybackVolume(value));
  }, []);
  const setScreenVolume = useCallback(value => {
    setScreenVolumeState(normalizePlaybackVolume(value));
  }, []);
  const setMovieVolume = useCallback(value => {
    setMovieVolumeState(normalizePlaybackVolume(value));
  }, []);

  useEffect(() => {
    signalingSocketRef.current = ws;
  }, [ws]);

  const isCameraOffRef = useRef(isCameraOff);
  const isScreenSharingRef = useRef(false);
  const localShareSourceRef = useRef(null);
  useEffect(() => { isCameraOffRef.current = isCameraOff; }, [isCameraOff]);
  useEffect(() => { localShareSourceRef.current = localShareSource; }, [localShareSource]);

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

    const audioTransceivers = transceivers.filter(
      transceiver => transceiver.receiver.track.kind === 'audio',
    );

    audioTransceiverRef.current = audioTransceivers[0] || null;
    contentAudioTransceiverRef.current = audioTransceivers[1] || null;
    cameraTransceiverRef.current = videoTransceivers[0] || null;
    screenTransceiverRef.current = videoTransceivers[1] || null;
  }, []);

  const resetRemotePeer = () => {
    if (disconnectRecoveryTimerRef.current) {
      window.clearTimeout(disconnectRecoveryTimerRef.current);
      disconnectRecoveryTimerRef.current = null;
    }
    iceRestartInFlightRef.current = false;
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    if (pcRef.current) {
      const pc = pcRef.current;
      pcRef.current = null;
      pc.close();
    }
    pendingCandidates.current = [];
    audioTransceiverRef.current = null;
    audioPlaceholderTrackRef.current?.stop();
    audioPlaceholderTrackRef.current = null;
    contentAudioTransceiverRef.current = null;
    cameraTransceiverRef.current = null;
    screenTransceiverRef.current = null;
    screenPlaceholderTrackRef.current?.stop();
    screenPlaceholderTrackRef.current = null;
    contentAudioPlaceholderTrackRef.current?.stop();
    contentAudioPlaceholderTrackRef.current = null;
    contentAssociationStreamRef.current = null;
    previousStatsRef.current = new Map();
    setConnectionStats(EMPTY_CONNECTION_STATS);
    setRemoteStream(null);
    setRemoteScreenStream(null);
    setRemoteScreenSharing(false);
    setRemoteShareSource(null);
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
        setRemoteShareSource(data.isScreenSharing
          ? {
              kind: data.source === 'movie' ? 'movie' : 'screen',
              name: typeof data.name === 'string' ? data.name.slice(0, 160) : null,
              duration: Number.isFinite(data.duration) ? data.duration : null,
              deliveryMode: data.deliveryMode === 'direct' ? 'direct' : 'relay',
              url: data.deliveryMode === 'direct' ? sanitizeSharedDirectMediaUrl(data.url) : null,
              width: Number.isFinite(data.width) && data.width > 0 ? data.width : null,
              height: Number.isFinite(data.height) && data.height > 0 ? data.height : null,
              aspectRatio: Number.isFinite(data.aspectRatio) && data.aspectRatio > 0
                ? data.aspectRatio
                : null,
              isPlaying: data.isPlaying !== false,
              currentTime: Number.isFinite(data.currentTime) ? data.currentTime : 0,
              subtitleText: typeof data.subtitleText === 'string' ? data.subtitleText.slice(0, 1000) : '',
              subtitlesAvailable: Boolean(data.subtitlesAvailable),
              subtitlesEnabled: data.subtitlesEnabled !== false,
              subtitleTracks: Array.isArray(data.subtitleTracks)
                ? data.subtitleTracks.slice(0, 16).map((track, index) => ({
                    index: Number.isInteger(track?.index) ? track.index : index,
                    label: typeof track?.label === 'string' ? track.label.slice(0, 80) : `Subtitles ${index + 1}`,
                    language: typeof track?.language === 'string' ? track.language.slice(0, 20) : null,
                  }))
                : [],
              selectedSubtitleTrack: Number.isInteger(data.selectedSubtitleTrack) ? data.selectedSubtitleTrack : null,
              audioTracks: Array.isArray(data.audioTracks)
                ? data.audioTracks.slice(0, 16).map((track, index) => ({
                    index: Number.isInteger(track?.index) ? track.index : index,
                    label: typeof track?.label === 'string' ? track.label.slice(0, 80) : `Audio ${index + 1}`,
                    language: typeof track?.language === 'string' ? track.language.slice(0, 20) : null,
                  }))
                : [],
              selectedAudioTrack: Number.isInteger(data.selectedAudioTrack) ? data.selectedAudioTrack : 0,
            }
          : null);
        return;
      }
      if (data.type === 'movie-state') {
        setRemoteShareSource(current => current?.kind === 'movie'
          ? {
              ...current,
              isPlaying: typeof data.isPlaying === 'boolean' ? data.isPlaying : current.isPlaying,
              currentTime: Number.isFinite(data.currentTime) ? data.currentTime : current.currentTime,
              duration: Number.isFinite(data.duration) ? data.duration : current.duration,
              subtitleText: typeof data.subtitleText === 'string' ? data.subtitleText.slice(0, 1000) : current.subtitleText,
              subtitlesAvailable: typeof data.subtitlesAvailable === 'boolean' ? data.subtitlesAvailable : current.subtitlesAvailable,
              subtitlesEnabled: typeof data.subtitlesEnabled === 'boolean' ? data.subtitlesEnabled : current.subtitlesEnabled,
              subtitleTracks: Array.isArray(data.subtitleTracks)
                ? data.subtitleTracks.slice(0, 16).map((track, index) => ({
                    index: Number.isInteger(track?.index) ? track.index : index,
                    label: typeof track?.label === 'string' ? track.label.slice(0, 80) : `Subtitles ${index + 1}`,
                    language: typeof track?.language === 'string' ? track.language.slice(0, 20) : null,
                  }))
                : current.subtitleTracks,
              selectedSubtitleTrack: Number.isInteger(data.selectedSubtitleTrack)
                ? data.selectedSubtitleTrack
                : current.selectedSubtitleTrack,
              audioTracks: Array.isArray(data.audioTracks)
                ? data.audioTracks.slice(0, 16).map((track, index) => ({
                    index: Number.isInteger(track?.index) ? track.index : index,
                    label: typeof track?.label === 'string' ? track.label.slice(0, 80) : `Audio ${index + 1}`,
                    language: typeof track?.language === 'string' ? track.language.slice(0, 20) : null,
                  }))
                : current.audioTracks,
              selectedAudioTrack: Number.isInteger(data.selectedAudioTrack)
                ? data.selectedAudioTrack
                : current.selectedAudioTrack,
            }
          : current);
        return;
      }
      if (
        data.type === 'movie-control-request'
        && ['play', 'pause', 'seek', 'audio-track', 'subtitle-track', 'subtitles'].includes(data.action)
      ) {
        setMovieControlRequest({
          id: `${Date.now()}-${messageSequenceRef.current++}`,
          action: data.action,
          currentTime: Number.isFinite(data.currentTime) ? Math.max(0, data.currentTime) : null,
          trackIndex: Number.isInteger(data.trackIndex) ? data.trackIndex : null,
          enabled: typeof data.enabled === 'boolean' ? data.enabled : null,
        });
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
      channel.send(JSON.stringify({
        type: 'screen-toggle',
        isScreenSharing: isScreenSharingRef.current,
        source: localShareSourceRef.current?.kind || 'screen',
        name: localShareSourceRef.current?.name || null,
        duration: localShareSourceRef.current?.duration || null,
        deliveryMode: localShareSourceRef.current?.deliveryMode || 'relay',
        url: localShareSourceRef.current?.deliveryMode === 'direct'
          ? localShareSourceRef.current?.url || null
          : null,
        width: localShareSourceRef.current?.width || null,
        height: localShareSourceRef.current?.height || null,
        aspectRatio: localShareSourceRef.current?.aspectRatio || null,
        isPlaying: localShareSourceRef.current?.isPlaying !== false,
        currentTime: localShareSourceRef.current?.currentTime || 0,
        subtitleText: localShareSourceRef.current?.subtitleText || '',
        subtitlesAvailable: Boolean(localShareSourceRef.current?.subtitlesAvailable),
        subtitlesEnabled: localShareSourceRef.current?.subtitlesEnabled !== false,
        subtitleTracks: localShareSourceRef.current?.subtitleTracks || [],
        selectedSubtitleTrack: localShareSourceRef.current?.selectedSubtitleTrack ?? null,
        audioTracks: localShareSourceRef.current?.audioTracks || [],
        selectedAudioTrack: localShareSourceRef.current?.selectedAudioTrack || 0,
      }));
    };

    channel.onmessage = handleDataMessage;
    channel.onopen = sendInitialState;
    if (channel.readyState === 'open') sendInitialState();
    dataChannelRef.current = channel;
  };

  useEffect(() => {
    if (status !== 'connected' || !ws) return;

    const handleSignalingMessage = async (event) => {
      if (signalingSocketRef.current !== ws) return;
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      console.log("[Signaling] Received message:", msg.type);

      if (msg.type === 'room-joined') {
        setRoomError(null);
        const mediaConnected = pcRef.current?.connectionState === 'connected';
        if (mediaConnected) {
          setConnected(true);
          setPeerPresence('connected');
        } else {
          setPeerPresence(msg.participantCount > 1 ? 'joining' : 'waiting');
        }
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
      } else if (msg.type === 'peer-reconnecting') {
        // The signaling socket can reconnect while the direct media path remains healthy.
        if (pcRef.current?.connectionState !== 'connected') setPeerPresence('reconnecting');
      } else if (msg.type === 'peer-reconnected') {
        if (pcRef.current?.connectionState === 'connected') {
          setConnected(true);
          setPeerPresence('connected');
        } else {
          resetRemotePeer();
          setPeerPresence('joining');
          try {
            await startCallRef.current?.();
          } catch (error) {
            console.error('[WebRTC] Failed to renegotiate after peer reconnect:', error);
            setPeerPresence('reconnecting');
          }
        }
      } else if (msg.type === 'peer-joined') {
        console.log("[Signaling] Peer joined. Initiating call...");
        resetRemotePeer();
        setPeerPresence('joining');
        try {
          await startCallRef.current?.();
        } catch (error) {
          console.error('[WebRTC] Failed to start call:', error);
          setPeerPresence('reconnecting');
        }
      } else if (msg.type === 'ice-restart-request') {
        if (isCallerRef.current) await restartIceRef.current?.();
      } else if (msg.type === 'offer') {
        try {
          const canReuseConnection = Boolean(
            msg.iceRestart
            && pcRef.current
            && pcRef.current.signalingState !== 'closed',
          );
          if (pcRef.current && !canReuseConnection) resetRemotePeer();
          setPeerPresence('joining');
          if (!canReuseConnection) initPeerConnectionRef.current?.(false);
          const pc = pcRef.current;
          if (!pc) return;
          isCallerRef.current = false;
          await pc.setRemoteDescription(new RTCSessionDescription({ type: msg.type, sdp: msg.sdp }));
          if (pcRef.current !== pc) return;
          bindTransceivers(pc);

          for (const candidate of pendingCandidates.current) {
            if (pcRef.current !== pc) return;
            try { await pc.addIceCandidate(candidate); } catch (e) { console.error('ICE error', e); }
          }
          pendingCandidates.current = [];

          // Force incoming transceivers to sendrecv and attach local tracks!
          // This guarantees the Joiner negotiates sending tracks, firing ontrack on the Creator.
          const audioTrack = outgoingAudioTrackRef.current?.readyState === 'live'
            ? outgoingAudioTrackRef.current
            : localStreamRef.current?.getAudioTracks()[0];
          const videoTrack = localStreamRef.current?.getVideoTracks()[0];
          const screenTrack = localScreenStreamRef.current?.getVideoTracks()[0];
          const contentAudioTrack = localContentAudioTrackRef.current?.readyState === 'live'
            ? localContentAudioTrackRef.current
            : null;
          
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
          if (contentAudioTransceiverRef.current) {
            contentAudioTransceiverRef.current.direction = 'sendrecv';
            const outgoingContentAudioTrack = contentAudioTrack || createEmptyAudioTrack();
            if (outgoingContentAudioTrack) {
              await contentAudioTransceiverRef.current.sender.replaceTrack(outgoingContentAudioTrack);
              if (!contentAudioTrack) contentAudioPlaceholderTrackRef.current = outgoingContentAudioTrack;
            }
          }

          const contentTracks = [
            screenTransceiverRef.current?.sender.track,
            contentAudioTransceiverRef.current?.sender.track,
          ].filter(Boolean);
          if (contentTracks.length) {
            contentAssociationStreamRef.current = new MediaStream(contentTracks);
            try {
              screenTransceiverRef.current?.sender.setStreams?.(contentAssociationStreamRef.current);
              contentAudioTransceiverRef.current?.sender.setStreams?.(contentAssociationStreamRef.current);
            } catch (error) {
              console.warn('[WebRTC] Browser could not associate shared-content tracks:', error);
            }
          }

          if (pcRef.current !== pc) return;
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          console.log("[Signaling] Sending answer");
          if (pcRef.current === pc && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(pc.localDescription));
          }
        } catch (err) {
          console.error("[WebRTC] Error handling offer:", err);
        }
      } else if (msg.type === 'answer') {
        const pc = pcRef.current;
        if (!pc) return;
        try {
          console.log("[Signaling] Received answer");
          await pc.setRemoteDescription(new RTCSessionDescription({ type: msg.type, sdp: msg.sdp }));
          if (pcRef.current !== pc) return;
          for (const candidate of pendingCandidates.current) {
            try { await pc.addIceCandidate(candidate); } catch (error) { console.warn('ICE error', error); }
          }
          pendingCandidates.current = [];
          iceRestartInFlightRef.current = false;
        } catch (error) {
          if (pcRef.current === pc) console.error('[WebRTC] Error handling answer:', error);
        }
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
    ws.onmessage = handleSignalingMessage;
    return () => {
      if (ws.onmessage === handleSignalingMessage) ws.onmessage = null;
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
    isCallerRef.current = isCaller;

    pc.onicecandidate = (event) => {
      if (pcRef.current !== pc) return;
      const socket = signalingSocketRef.current;
      if (event.candidate && socket?.readyState === WebSocket.OPEN) {
        console.log("[WebRTC] Sending ICE candidate");
        socket.send(JSON.stringify({ type: 'candidate', candidate: event.candidate }));
      }
    };

    pc.ontrack = (event) => {
      if (pcRef.current !== pc) return;
      console.log("[WebRTC] Track received:", event.track.kind);

      if (!screenTransceiverRef.current || !contentAudioTransceiverRef.current) bindTransceivers(pc);
      const screenTransceiver = screenTransceiverRef.current;
      const contentAudioTransceiver = contentAudioTransceiverRef.current;
      const isScreen = event.track.kind === 'video' && (
        event.transceiver === screenTransceiver
        || (screenTransceiver?.mid && event.transceiver.mid === screenTransceiver.mid)
      );
      const isContentAudio = event.track.kind === 'audio' && (
        event.transceiver === contentAudioTransceiver
        || (contentAudioTransceiver?.mid && event.transceiver.mid === contentAudioTransceiver.mid)
      );
      
      if (!isScreen && !isContentAudio) {
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
        // Shared content (screen or movie) keeps video and audio in one remote stream.
        setRemoteScreenStream(prev => {
          const tracksById = new Map(
            (prev?.getTracks() || []).map(track => [track.id, track]),
          );
          event.streams?.[0]?.getTracks().forEach(track => tracksById.set(track.id, track));
          tracksById.set(event.track.id, event.track);
          return new MediaStream([...tracksById.values()]);
        });

        if (isScreen) {
          event.track.onended = () => {
            setRemoteScreenStream(current => (
              current?.getTracks().some(track => track.id === event.track.id) ? null : current
            ));
            setRemoteScreenSharing(false);
            setRemoteShareSource(null);
          };
        } else {
          event.track.onended = () => {
            setRemoteScreenStream(current => {
              if (!current) return current;
              const remainingTracks = current.getTracks().filter(track => track.id !== event.track.id);
              return remainingTracks.length ? new MediaStream(remainingTracks) : null;
            });
          };
        }
      }
    };

    pc.ondatachannel = (event) => {
      if (pcRef.current !== pc) return;
      configureDataChannel(event.channel);
    };

    pc.onconnectionstatechange = () => {
      if (pcRef.current !== pc) return;
      console.log("[WebRTC] Connection state changed:", pc.connectionState);
      if (pc.connectionState === 'connected') {
        if (disconnectRecoveryTimerRef.current) {
          window.clearTimeout(disconnectRecoveryTimerRef.current);
          disconnectRecoveryTimerRef.current = null;
        }
        iceRestartInFlightRef.current = false;
        setConnected(true);
        setPeerPresence('connected');
      } else if (pc.connectionState === 'disconnected') {
        setPeerPresence('reconnecting');
        if (!disconnectRecoveryTimerRef.current) {
          disconnectRecoveryTimerRef.current = window.setTimeout(() => {
            disconnectRecoveryTimerRef.current = null;
            if (pcRef.current !== pc || pc.connectionState !== 'disconnected') return;
            setConnected(false);
            if (isCallerRef.current) {
              restartIceRef.current?.();
            } else {
              const socket = signalingSocketRef.current;
              if (socket?.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: 'ice-restart-request' }));
              }
            }
          }, 3000);
        }
      } else if (pc.connectionState === 'failed') {
        setConnected(false);
        setPeerPresence('reconnecting');
        if (isCallerRef.current) {
          restartIceRef.current?.();
        } else {
          const socket = signalingSocketRef.current;
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'ice-restart-request' }));
          }
        }
      }
    };
    
    pc.oniceconnectionstatechange = () => {
      if (pcRef.current !== pc) return;
      console.log("[WebRTC] ICE Connection state:", pc.iceConnectionState);
    };

    if (isCaller) {
      const audioTrack = outgoingAudioTrackRef.current?.readyState === 'live'
        ? outgoingAudioTrackRef.current
        : localStreamRef.current?.getAudioTracks()[0];
      const videoTrack = localStreamRef.current?.getVideoTracks()[0];
      const screenTrack = localScreenStreamRef.current?.getVideoTracks()[0];
      const contentAudioTrack = localContentAudioTrackRef.current?.readyState === 'live'
        ? localContentAudioTrackRef.current
        : null;

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
      const outgoingContentAudioTrack = contentAudioTrack || createEmptyAudioTrack();
      if (!screenTrack) screenPlaceholderTrackRef.current = outgoingScreenTrack;
      if (!contentAudioTrack) contentAudioPlaceholderTrackRef.current = outgoingContentAudioTrack;
      const contentTracks = [outgoingScreenTrack, outgoingContentAudioTrack].filter(Boolean);
      contentAssociationStreamRef.current = new MediaStream(contentTracks);
      screenTransceiverRef.current = outgoingScreenTrack
        ? pc.addTransceiver(outgoingScreenTrack, {
            direction: 'sendrecv',
            streams: [contentAssociationStreamRef.current],
          })
        : pc.addTransceiver('video', { direction: 'sendrecv' });
      contentAudioTransceiverRef.current = outgoingContentAudioTrack
        ? pc.addTransceiver(outgoingContentAudioTrack, {
            direction: 'sendrecv',
            streams: [contentAssociationStreamRef.current],
          })
        : pc.addTransceiver('audio', { direction: 'sendrecv' });
    }
  };
  initPeerConnectionRef.current = initPeerConnection;

  const joinRoom = (id) => {
    const normalizedRoomId = id.trim().toUpperCase();
    setRoomError(null);
    setPeerPresence('waiting');
    setParticipantVolume(DEFAULT_PLAYBACK_VOLUMES.participant);
    setScreenVolume(DEFAULT_PLAYBACK_VOLUMES.screen);
    setMovieVolume(DEFAULT_PLAYBACK_VOLUMES.movie);
    setRoomId(normalizedRoomId);
  };

  const startCall = async () => {
    console.log("[WebRTC] Starting call...");
    initPeerConnection(true);

    const pc = pcRef.current;
    const socket = signalingSocketRef.current;
    if (!pc || socket?.readyState !== WebSocket.OPEN) {
      throw new Error('The signaling connection is not ready.');
    }

    const dc = pc.createDataChannel('chat');
    configureDataChannel(dc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (pcRef.current !== pc || signalingSocketRef.current !== socket) return;
    console.log("[Signaling] Sending offer");
    socket.send(JSON.stringify(pc.localDescription));
  };
  startCallRef.current = startCall;

  const restartIce = async () => {
    const pc = pcRef.current;
    const socket = signalingSocketRef.current;
    if (
      !pc
      || !isCallerRef.current
      || iceRestartInFlightRef.current
      || pc.signalingState !== 'stable'
      || socket?.readyState !== WebSocket.OPEN
    ) return;

    iceRestartInFlightRef.current = true;
    try {
      pc.restartIce();
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      if (pcRef.current !== pc || signalingSocketRef.current !== socket) {
        iceRestartInFlightRef.current = false;
        return;
      }
      socket.send(JSON.stringify({ ...pc.localDescription.toJSON(), iceRestart: true }));
    } catch (error) {
      iceRestartInFlightRef.current = false;
      if (pcRef.current === pc) console.error('[WebRTC] ICE restart failed:', error);
    }
  };
  restartIceRef.current = restartIce;

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

  const requestMovieControl = useCallback((owner, command) => {
    if (!command || !['play', 'pause', 'seek', 'audio-track', 'subtitle-track', 'subtitles'].includes(command.action)) {
      return false;
    }
    const normalizedCommand = {
      action: command.action,
      currentTime: Number.isFinite(command.currentTime) ? Math.max(0, command.currentTime) : null,
      trackIndex: Number.isInteger(command.trackIndex) ? command.trackIndex : null,
      enabled: typeof command.enabled === 'boolean' ? command.enabled : null,
    };
    if (owner === 'local') {
      setMovieControlRequest({
        id: `${Date.now()}-${messageSequenceRef.current++}`,
        ...normalizedCommand,
      });
      return true;
    }
    if (owner === 'remote' && dataChannelRef.current?.readyState === 'open') {
      dataChannelRef.current.send(JSON.stringify({
        type: 'movie-control-request',
        ...normalizedCommand,
      }));
      return true;
    }
    return false;
  }, []);

  const endCall = () => {
    resetRemotePeer();
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    localScreenStreamRef.current?.getTracks().forEach(track => track.stop());
    const contentAudioTrack = localContentAudioTrackRef.current;
    const contentAudioOwnedByShare = localScreenStreamRef.current
      ?.getTracks()
      .some(track => track.id === contentAudioTrack?.id);
    if (contentAudioTrack && !contentAudioOwnedByShare) contentAudioTrack.stop();
    localStreamRef.current = null;
    localScreenStreamRef.current = null;
    localContentAudioTrackRef.current = null;
    outgoingAudioTrackRef.current = null;
    setLocalStreamState(null);
    setLocalScreenStreamState(null);
    setIsScreenSharing(false);
    setLocalShareSource(null);
    setChatMessages([]);
    setUnreadCount(0);
    setIsChatOpen(false);
    setIsPresentationMode(false);
    setPeerPresence('waiting');
    setParticipantVolume(DEFAULT_PLAYBACK_VOLUMES.participant);
    setScreenVolume(DEFAULT_PLAYBACK_VOLUMES.screen);
    setMovieVolume(DEFAULT_PLAYBACK_VOLUMES.movie);
    notificationAudioContextRef.current?.close().catch(() => {});
    notificationAudioContextRef.current = null;
  };

  const getSender = (kind, isScreen = false) => {
    if (!pcRef.current) return null;
    if (!audioTransceiverRef.current || !cameraTransceiverRef.current || !screenTransceiverRef.current || !contentAudioTransceiverRef.current) {
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
    const microphoneTrack = stream.getAudioTracks()[0] || null;
    let nextAudioTrack = microphoneTrack;
    if (!nextAudioTrack) {
      const reusablePlaceholder = audioPlaceholderTrackRef.current?.readyState === 'live'
        ? audioPlaceholderTrackRef.current
        : createEmptyAudioTrack();
      audioPlaceholderTrackRef.current = reusablePlaceholder;
      nextAudioTrack = reusablePlaceholder;
    }
    outgoingAudioTrackRef.current = nextAudioTrack;

    if (pcRef.current) {
      const audioSender = getSender('audio');
      const videoTrack = stream.getVideoTracks()[0] || null;
      const videoSender = getSender('video', false);
      if (audioSender && nextAudioTrack) replacements.push(audioSender.replaceTrack(nextAudioTrack));
      if (videoSender && videoTrack) replacements.push(videoSender.replaceTrack(videoTrack));
    }

    return Promise.all(replacements)
      .then(() => {
        if (microphoneTrack && audioPlaceholderTrackRef.current) {
          audioPlaceholderTrackRef.current.stop();
          audioPlaceholderTrackRef.current = null;
        }
      })
      .catch(error => {
        console.warn('Failed to update a camera or microphone sender', error);
        throw error;
      });
  };

  const setOutgoingAudioTrack = async (track) => {
    outgoingAudioTrackRef.current = track;
    const sender = getSender('audio');
    if (sender) await sender.replaceTrack(track);
  };

  const setSharedContentAudioTrack = async (track) => {
    localContentAudioTrackRef.current = track;
    if (!pcRef.current) return;

    if (!contentAudioTransceiverRef.current) bindTransceivers(pcRef.current);
    const sender = contentAudioTransceiverRef.current?.sender;
    if (!sender) throw new Error('The shared-content audio sender is not ready.');

    const outgoingTrack = track || createEmptyAudioTrack();
    if (!outgoingTrack) throw new Error('Unable to keep the shared-content audio sender active.');
    await sender.replaceTrack(outgoingTrack);

    if (contentAudioPlaceholderTrackRef.current && contentAudioPlaceholderTrackRef.current !== outgoingTrack) {
      contentAudioPlaceholderTrackRef.current.stop();
    }
    contentAudioPlaceholderTrackRef.current = track ? null : outgoingTrack;
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
      requestMovieControl,
      movieControlRequest,
      setCameraStream,
      setOutgoingAudioTrack,
      setSharedContentAudioTrack,
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
      localShareSource,
      setLocalShareSource,
      remoteShareSource,
      participantVolume,
      setParticipantVolume,
      screenVolume,
      setScreenVolume,
      movieVolume,
      setMovieVolume,
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
