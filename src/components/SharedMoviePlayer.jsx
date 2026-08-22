import React, { useEffect, useRef, useState } from 'react';
import { Captions, FilePlus2, Languages, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { formatMediaTime } from '../lib/movieShare';
import { Button } from './ui/button';

export const SharedMoviePlayer = ({ owner, source, hidden, onCommand, onAddSubtitle, volume, onVolumeChange }) => {
  const [seekValue, setSeekValue] = useState(source.currentTime || 0);
  const [isSeeking, setIsSeeking] = useState(false);
  const seekValueRef = useRef(source.currentTime || 0);
  const isSeekingRef = useRef(false);
  const resumeAfterSeekRef = useRef(false);

  useEffect(() => {
    if (!isSeeking) {
      seekValueRef.current = source.currentTime || 0;
      setSeekValue(source.currentTime || 0);
    }
  }, [isSeeking, source.currentTime]);

  const beginSeek = () => {
    if (isSeekingRef.current) return;
    isSeekingRef.current = true;
    setIsSeeking(true);
    resumeAfterSeekRef.current = source.isPlaying === true;
    if (resumeAfterSeekRef.current) onCommand(owner, { action: 'pause' });
  };

  const commitSeek = () => {
    if (!isSeekingRef.current) return;
    isSeekingRef.current = false;
    setIsSeeking(false);
    onCommand(owner, {
      action: 'seek',
      currentTime: seekValueRef.current,
      resumeAfterSeek: resumeAfterSeekRef.current,
    });
    resumeAfterSeekRef.current = false;
  };

  const audioTracks = Array.isArray(source.audioTracks) ? source.audioTracks : [];
  const subtitleTracks = Array.isArray(source.subtitleTracks) ? source.subtitleTracks : [];
  const duration = Number.isFinite(source.duration) ? source.duration : 0;
  const playbackCopy = source.deliveryMode === 'direct'
    ? 'Both devices load this link · either person can control playback'
    : `${owner === 'local' ? 'You are sharing' : 'The participant is sharing'} · either person can control playback`;

  return (
    <section
      className={`absolute bottom-20 left-1/2 z-30 w-[min(48rem,calc(100vw-1rem))] -translate-x-1/2 rounded-xl border border-white/10 bg-[#111719]/92 p-2.5 shadow-[0_18px_55px_rgba(0,0,0,0.5)] backdrop-blur-2xl transition-[opacity,transform] duration-300 motion-reduce:transition-none ${hidden ? 'pointer-events-none translate-y-2 opacity-0' : 'translate-y-0 opacity-100'}`}
      aria-label="Shared movie player"
    >
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-zinc-200">{source.name || 'Shared movie'}</p>
          <p className="mt-0.5 hidden text-[10px] text-zinc-600 sm:block">
            {playbackCopy}
          </p>
        </div>
        <span className="shrink-0 font-mono text-[11px] text-zinc-500">
          {formatMediaTime(seekValue)} / {formatMediaTime(duration)}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <Button
          variant="active"
          size="icon"
          className="size-9 shrink-0"
          onClick={() => onCommand(owner, { action: source.isPlaying ? 'pause' : 'play' })}
          aria-label={source.isPlaying ? 'Pause shared movie for everyone' : 'Play shared movie for everyone'}
        >
          {source.isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>

        <input
          type="range"
          min="0"
          max={Math.max(duration, 0)}
          step="0.1"
          value={Math.min(seekValue, duration || 0)}
          disabled={!duration}
          onPointerDown={beginSeek}
          onKeyDown={(event) => {
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) beginSeek();
          }}
          onChange={(event) => {
            beginSeek();
            const nextValue = Number(event.target.value);
            seekValueRef.current = nextValue;
            setSeekValue(nextValue);
          }}
          onPointerUp={commitSeek}
          onKeyUp={commitSeek}
          onBlur={commitSeek}
          className="h-2 min-w-16 flex-1 cursor-pointer accent-teal-300 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Shared movie position"
        />

        <label className="flex shrink-0 items-center gap-1.5" title="Movie volume on this device only">
          <span className="sr-only">Shared movie volume on this device</span>
          {volume === 0
            ? <VolumeX className="size-4 text-zinc-500" aria-hidden="true" />
            : <Volume2 className="size-4 text-zinc-400" aria-hidden="true" />}
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={volume}
            onChange={event => onVolumeChange(event.target.value)}
            className="h-2 w-16 cursor-pointer accent-teal-300 sm:w-24"
            aria-valuetext={volume === 0 ? 'Muted' : `${volume} percent`}
          />
          <span className="w-8 text-right font-mono text-[10px] text-zinc-500" aria-hidden="true">
            {volume}%
          </span>
        </label>

        <Button
          variant={source.subtitlesEnabled && source.subtitlesAvailable ? 'active' : 'secondary'}
          size="icon"
          className="size-9 shrink-0"
          disabled={!source.subtitlesAvailable}
          onClick={() => onCommand(owner, { action: 'subtitles', enabled: !source.subtitlesEnabled })}
          aria-label={source.subtitlesAvailable
            ? source.subtitlesEnabled ? 'Turn shared subtitles off' : 'Turn shared subtitles on'
            : 'No subtitles loaded'}
          aria-pressed={Boolean(source.subtitlesEnabled && source.subtitlesAvailable)}
        >
          <Captions className="size-4" />
        </Button>

        {owner === 'local' ? (
          <Button
            variant="secondary"
            size="icon"
            className="size-9 shrink-0"
            onClick={onAddSubtitle}
            aria-label={source.subtitlesAvailable ? 'Load or replace an SRT subtitle file' : 'Add an SRT subtitle file'}
            title={source.subtitlesAvailable ? 'Load or replace SRT' : 'Add SRT'}
          >
            <FilePlus2 className="size-4" />
          </Button>
        ) : null}

        {subtitleTracks.length > 1 ? (
          <label className="hidden min-w-0 items-center gap-1.5 text-xs text-zinc-500 md:flex">
            <span className="sr-only">Movie subtitle track</span>
            <select
              value={source.selectedSubtitleTrack ?? subtitleTracks[0].index}
              onChange={event => onCommand(owner, {
                action: 'subtitle-track',
                trackIndex: Number(event.target.value),
              })}
              className="h-9 min-w-0 max-w-32 rounded-lg border border-white/10 bg-white/[0.06] px-2 text-xs text-zinc-200 outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
              aria-label="Movie subtitle track"
            >
              {subtitleTracks.map(track => (
                <option key={track.index} value={track.index}>{track.label}</option>
              ))}
            </select>
          </label>
        ) : null}

        {audioTracks.length > 1 ? (
          <label className="hidden min-w-0 items-center gap-1.5 text-xs text-zinc-500 sm:flex">
            <Languages className="size-4 shrink-0" aria-hidden="true" />
            <span className="sr-only">Movie audio track</span>
            <select
              value={source.selectedAudioTrack ?? 0}
              onChange={(event) => onCommand(owner, {
                action: 'audio-track',
                trackIndex: Number(event.target.value),
              })}
              className="h-9 min-w-0 max-w-32 rounded-lg border border-white/10 bg-white/[0.06] px-2 text-xs text-zinc-200 outline-none focus-visible:ring-2 focus-visible:ring-teal-300 sm:max-w-44"
              aria-label="Movie audio track"
            >
              {audioTracks.map(track => (
                <option key={track.index} value={track.index}>{track.label}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </section>
  );
};
