import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

export const useSignaling = (url) => {
  const queryClient = useQueryClient();
  const wsRef = useRef(null);
  
  // The query itself just returns the current status from the queryClient
  const { data: status } = useQuery({
    queryKey: ['ws-status'],
    queryFn: () => 'disconnected',
    initialData: 'disconnected',
    staleTime: Infinity, // never stale, we manage it manually
  });

  useEffect(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      queryClient.setQueryData(['ws-status'], 'connected');
    };

    ws.onclose = () => {
      queryClient.setQueryData(['ws-status'], 'disconnected');
    };

    ws.onerror = () => {
      queryClient.setQueryData(['ws-status'], 'error');
    };

    return () => {
      ws.close();
    };
  }, [url, queryClient]);

  return { status, ws: wsRef.current };
};
