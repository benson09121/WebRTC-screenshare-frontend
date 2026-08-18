import { useQuery } from '@tanstack/react-query';

export const useMediaDevices = () => {
  return useQuery({
    queryKey: ['mediaDevices'],
    queryFn: async () => {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return {
        audio: devices.filter(d => d.kind === 'audioinput'),
        video: devices.filter(d => d.kind === 'videoinput'),
        output: devices.filter(d => d.kind === 'audiooutput'),
      };
    },
    refetchOnWindowFocus: true,
  });
};
