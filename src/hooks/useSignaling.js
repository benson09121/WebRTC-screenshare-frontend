import { useEffect, useRef, useState } from 'react';

const BASE_RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_DELAY_MS = 10000;

export const useSignaling = url => {
  const [status, setStatus] = useState('connecting');
  const [ws, setWs] = useState(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const attemptRef = useRef(0);

  useEffect(() => {
    let active = true;
    let reconnectTimer = null;
    let currentSocket = null;

    const scheduleReconnect = () => {
      if (!active || reconnectTimer) return;

      const delay = Math.min(
        MAX_RECONNECT_DELAY_MS,
        BASE_RECONNECT_DELAY_MS * (2 ** attemptRef.current),
      );
      attemptRef.current += 1;
      setReconnectAttempt(attemptRef.current);
      setStatus('reconnecting');
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    };

    const connect = () => {
      if (!active) return;

      setStatus(attemptRef.current > 0 ? 'reconnecting' : 'connecting');
      const socket = new WebSocket(url);
      currentSocket = socket;

      socket.onopen = () => {
        if (!active || currentSocket !== socket) return;
        attemptRef.current = 0;
        setReconnectAttempt(0);
        setWs(socket);
        setStatus('connected');
      };

      socket.onerror = () => {
        if (!active || currentSocket !== socket) return;
        socket.close();
      };

      socket.onclose = () => {
        if (!active || currentSocket !== socket) return;
        setWs(current => current === socket ? null : current);
        scheduleReconnect();
      };
    };

    const reconnectNow = () => {
      if (
        !active
        || currentSocket?.readyState === WebSocket.OPEN
        || currentSocket?.readyState === WebSocket.CONNECTING
      ) return;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
      connect();
    };

    window.addEventListener('online', reconnectNow);
    connect();

    return () => {
      active = false;
      window.removeEventListener('online', reconnectNow);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (currentSocket) {
        currentSocket.onopen = null;
        currentSocket.onclose = null;
        currentSocket.onerror = null;
        currentSocket.close();
      }
    };
  }, [url]);

  return { status, ws, reconnectAttempt };
};
