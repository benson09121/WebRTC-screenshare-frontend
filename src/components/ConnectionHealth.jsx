import React from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Cpu,
  Gauge,
  Network,
  Radio,
  TriangleAlert,
} from 'lucide-react';
import { useWebRTC } from '../context/useWebRTC';
import { Button } from './ui/button';

const QUALITY_COPY = {
  good: { label: 'Connection good', dot: 'bg-teal-300', text: 'text-teal-200' },
  fair: { label: 'Connection limited', dot: 'bg-amber-300', text: 'text-amber-200' },
  poor: { label: 'Connection poor', dot: 'bg-red-400', text: 'text-red-200' },
  unknown: { label: 'Measuring connection', dot: 'bg-zinc-500', text: 'text-zinc-300' },
};

const LIMITATION_COPY = {
  cpu: { label: 'Device limiting video', dot: 'bg-amber-300', text: 'text-amber-200' },
  bandwidth: { label: 'Upload limiting video', dot: 'bg-amber-300', text: 'text-amber-200' },
  other: { label: 'Video quality adapting', dot: 'bg-amber-300', text: 'text-amber-200' },
};

const formatBitrate = value => {
  if (!value) return '0 kbps';
  if (value >= 1000) return `${(value / 1000).toFixed(1)} Mbps`;
  return `${value} kbps`;
};

const formatVideo = video => {
  if (!video?.width || !video?.height) return 'Waiting for video';
  const fps = video.framesPerSecond ? ` · ${Math.round(video.framesPerSecond)} fps` : '';
  return `${video.width} × ${video.height}${fps}`;
};

const getAction = stats => {
  if (stats.qualityLimitationReason === 'cpu') {
    return {
      icon: Cpu,
      title: 'CPU limited',
      description: 'Close heavy apps or lower the screen-share resolution.',
    };
  }
  if (stats.qualityLimitationReason === 'bandwidth') {
    return {
      icon: Network,
      title: 'Network limited',
      description: 'Use a stronger connection or lower the screen-share quality.',
    };
  }
  if (stats.qualityLimitationReason === 'other') {
    return {
      icon: Gauge,
      title: 'Browser adapting video',
      description: 'The browser reduced resolution or frame rate for a non-network, non-CPU reason.',
    };
  }
  if (stats.quality === 'poor') {
    return {
      icon: TriangleAlert,
      title: 'Unstable connection',
      description: 'Packet loss or latency is affecting this call.',
    };
  }
  if (stats.quality === 'fair') {
    return {
      icon: Network,
      title: 'Connection adapting',
      description: 'Moderate packet loss or latency may reduce call quality.',
    };
  }
  return null;
};

export const ConnectionHealth = ({ isIdle, open, onOpenChange }) => {
  const { connected, connectionStats, peerPresence, wsStatus } = useWebRTC();

  const quality = connected ? connectionStats.quality : 'unknown';
  const copy = QUALITY_COPY[quality] || QUALITY_COPY.unknown;
  const limitation = connected
    ? LIMITATION_COPY[connectionStats.qualityLimitationReason]
    : null;
  const displayCopy = limitation || copy;
  const statusLabel = connected
    ? displayCopy.label
    : wsStatus === 'reconnecting'
      ? 'Signaling reconnecting'
      : peerPresence === 'left'
        ? 'Participant left'
        : peerPresence === 'joining' || peerPresence === 'reconnecting'
          ? 'Call reconnecting'
          : 'Waiting for participant';
  const action = getAction(connectionStats);
  const ActionIcon = action?.icon;

  return (
    <div className={`pointer-events-auto relative transition-opacity duration-300 ${isIdle && !open ? 'opacity-0' : 'opacity-100'}`}>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-controls="connection-details"
        className="w-fit bg-[#111719]/90"
      >
        <span className={`size-2 rounded-full ${displayCopy.dot} ${connected ? '' : 'animate-pulse'}`} />
        {statusLabel}
      </Button>

      {open ? (
        <section
          id="connection-details"
          aria-label="Connection details"
          className="absolute left-0 top-12 w-[min(21rem,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-[#111719]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.5)] backdrop-blur-2xl"
        >
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
            <div>
              <p className={`text-sm font-semibold ${displayCopy.text}`}>{statusLabel}</p>
              <p className="mt-0.5 text-xs text-zinc-500">
                {connectionStats.connectionPath === 'relay'
                  ? 'Relayed through TURN'
                  : connectionStats.connectionPath === 'direct'
                    ? `Direct peer connection${connectionStats.protocol ? ` · ${connectionStats.protocol.toUpperCase()}` : ''}`
                    : 'Connection path unavailable'}
              </p>
            </div>
            <Activity className="size-4 text-zinc-500" />
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 py-4">
            <div>
              <dt className="flex items-center gap-1.5 text-[11px] text-zinc-500"><Gauge className="size-3.5" /> Round trip</dt>
              <dd className="mt-1 font-mono text-sm text-zinc-200">{connectionStats.roundTripTimeMs == null ? '—' : `${connectionStats.roundTripTimeMs} ms`}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-[11px] text-zinc-500"><Radio className="size-3.5" /> Packet loss</dt>
              <dd className="mt-1 font-mono text-sm text-zinc-200">{connectionStats.packetLossPercent == null ? '—' : `${connectionStats.packetLossPercent}%`}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-[11px] text-zinc-500"><ArrowUp className="size-3.5" /> Sending</dt>
              <dd className="mt-1 font-mono text-sm text-zinc-200">{formatBitrate(connectionStats.sendBitrateKbps)}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-[11px] text-zinc-500"><ArrowDown className="size-3.5" /> Receiving</dt>
              <dd className="mt-1 font-mono text-sm text-zinc-200">{formatBitrate(connectionStats.receiveBitrateKbps)}</dd>
            </div>
          </dl>

          <div className="space-y-2 border-t border-white/[0.08] pt-3 text-xs">
            <div className="flex items-center justify-between gap-4">
              <span className="text-zinc-500">Outgoing video</span>
              <span className="font-mono text-zinc-300">{formatVideo(connectionStats.outboundVideo)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-zinc-500">Incoming video</span>
              <span className="font-mono text-zinc-300">{formatVideo(connectionStats.inboundVideo)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-zinc-500">Available upload</span>
              <span className="font-mono text-zinc-300">{connectionStats.availableOutgoingBitrateKbps == null ? '—' : formatBitrate(connectionStats.availableOutgoingBitrateKbps)}</span>
            </div>
          </div>

          {action ? (
            <div role="status" className="mt-4 flex gap-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.07] p-3">
              <ActionIcon className="mt-0.5 size-4 shrink-0 text-amber-300" />
              <div>
                <p className="text-xs font-semibold text-amber-100">{action.title}</p>
                <p className="mt-1 text-xs leading-5 text-amber-100/60">{action.description}</p>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
};
