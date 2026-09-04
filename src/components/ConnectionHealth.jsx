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
import { getConnectionHealthPresentation } from '../lib/connectionHealth';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

const QUALITY_COPY = {
  good: {
    label: 'Connection good',
    bars: 3,
    bar: 'bg-emerald-400',
    text: 'text-emerald-300',
  },
  fair: {
    label: 'Connection limited',
    bars: 2,
    bar: 'bg-amber-300',
    text: 'text-amber-200',
  },
  poor: {
    label: 'Connection poor',
    bars: 1,
    bar: 'bg-red-400',
    text: 'text-red-300',
  },
  unknown: {
    label: 'Measuring connection',
    bars: 0,
    bar: 'bg-zinc-500',
    text: 'text-zinc-300',
  },
};

const formatBitrate = (value) => {
  if (!value) return '0 kbps';
  if (value >= 1000) return `${(value / 1000).toFixed(1)} Mbps`;
  return `${value} kbps`;
};

const formatVideo = (video) => {
  if (!video?.width || !video?.height) return 'Waiting for video';
  const fps = video.framesPerSecond
    ? ` · ${Math.round(video.framesPerSecond)} fps`
    : '';
  return `${video.width} × ${video.height}${fps}`;
};

const ACTION_ICONS = {
  cpu: Cpu,
  bandwidth: Network,
  other: Gauge,
  poor: TriangleAlert,
  fair: Network,
};

const ConnectionBars = ({ copy, connected }) => (
  <span
    className={`flex h-5 items-end gap-0.5 ${connected ? '' : 'animate-pulse'}`}
    aria-hidden="true"
  >
    {[2, 3.5, 5].map((height, index) => (
      <span
        key={height}
        className={`w-1 rounded-[2px] ${index < copy.bars ? copy.bar : 'bg-zinc-600'}`}
        style={{ height: `${height * 0.25}rem` }}
      />
    ))}
  </span>
);

export const ConnectionHealth = ({ open, onOpenChange }) => {
  const { connected, connectionStats, peerPresence, wsStatus } = useWebRTC();

  const presentation = getConnectionHealthPresentation({
    connected,
    stats: connectionStats,
    wsStatus,
    peerPresence,
  });
  const { quality, statusLabel, action } = presentation;
  const copy = QUALITY_COPY[quality] || QUALITY_COPY.unknown;
  const ActionIcon = action ? ACTION_ICONS[action.kind] : null;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          size="icon"
          className="size-10 sm:size-9"
          aria-label={`${statusLabel}. Open connection details`}
          title={statusLabel}
          data-connection-quality={quality}
          data-active-bars={copy.bars}
        >
          <ConnectionBars copy={copy} connected={connected} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        className="w-[min(21rem,calc(100vw-1rem))] p-4"
      >
        <section id="connection-details" aria-label="Connection details">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
            <div>
              <p className={`text-sm font-semibold ${copy.text}`}>
                {statusLabel}
              </p>
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
              <dt className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                <Gauge className="size-3.5" /> Round trip
              </dt>
              <dd className="mt-1 font-mono text-sm text-zinc-200">
                {connectionStats.roundTripTimeMs == null
                  ? '—'
                  : `${connectionStats.roundTripTimeMs} ms`}
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                <Radio className="size-3.5" /> Packet loss
              </dt>
              <dd className="mt-1 font-mono text-sm text-zinc-200">
                {connectionStats.packetLossPercent == null
                  ? '—'
                  : `${connectionStats.packetLossPercent}%`}
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                <ArrowUp className="size-3.5" /> Sending
              </dt>
              <dd className="mt-1 font-mono text-sm text-zinc-200">
                {formatBitrate(connectionStats.sendBitrateKbps)}
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                <ArrowDown className="size-3.5" /> Receiving
              </dt>
              <dd className="mt-1 font-mono text-sm text-zinc-200">
                {formatBitrate(connectionStats.receiveBitrateKbps)}
              </dd>
            </div>
          </dl>

          <div className="space-y-2 border-t border-white/[0.08] pt-3 text-xs">
            <div className="flex items-center justify-between gap-4">
              <span className="text-zinc-500">Outgoing video</span>
              <span className="font-mono text-zinc-300">
                {formatVideo(connectionStats.outboundVideo)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-zinc-500">Incoming video</span>
              <span className="font-mono text-zinc-300">
                {formatVideo(connectionStats.inboundVideo)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-zinc-500">Available upload</span>
              <span className="font-mono text-zinc-300">
                {connectionStats.availableOutgoingBitrateKbps == null
                  ? '—'
                  : formatBitrate(connectionStats.availableOutgoingBitrateKbps)}
              </span>
            </div>
          </div>

          {action ? (
            <div
              role="status"
              className="mt-4 flex gap-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.07] p-3"
            >
              <ActionIcon className="mt-0.5 size-4 shrink-0 text-amber-300" />
              <div>
                <p className="text-xs font-semibold text-amber-100">
                  {action.title}
                </p>
                <p className="mt-1 text-xs leading-5 text-amber-100/60">
                  {action.description}
                </p>
              </div>
            </div>
          ) : null}
        </section>
      </PopoverContent>
    </Popover>
  );
};
