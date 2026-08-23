import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Film,
  LoaderCircle,
  Maximize,
  Minimize,
  Puzzle,
  X,
} from 'lucide-react';
import { useWebRTC } from '../context/useWebRTC';
import { buildVidkingEmbedUrl } from '../lib/externalWatchProtocol';
import { detectCurrentExtensionBrowser } from '../lib/extensionBrowser';
import { Button } from './ui/button';
import chromiumExtensionArchiveUrl from '../../pairbeam-extension.zip?url&no-inline';
import firefoxExtensionArchiveUrl from '../../pairbeam-firefox-extension.zip?url&no-inline';
import { SeriesEpisodeDrawer } from './SeriesEpisodeDrawer';

const PAGE_CHANNEL = 'pairbeam-page';
const EXTENSION_CHANNEL = 'pairbeam-extension';
const PUBLISH_EVENTS = new Set([
  'play',
  'pause',
  'seeked',
  'timeupdate',
  'ready',
  'canplay',
  'command-applied',
]);
const REQUEST_EVENTS = new Set(['play', 'pause', 'seeked']);
const SEEK_SETTLE_DELAY_MS = 900;
const EXTENSION_GUIDE_URL =
  'https://github.com/benson09121/WebRTC-screenshare-frontend/tree/main/extension';
const EXTENSION_TARGETS = {
  chromium: {
    browserName: 'Chrome/Chromium',
    archiveUrl: chromiumExtensionArchiveUrl,
    downloadName: 'pairbeam-extension.zip',
    steps: [
      <>Download and extract the PairBeam extension ZIP.</>,
      <>
        Open <code>chrome://extensions</code> and enable Developer mode.
      </>,
      <>
        Choose <strong>Load unpacked</strong>.
      </>,
      <>
        Select the extracted <code>extension</code> folder.
      </>,
      <>Reload PairBeam after installation.</>,
    ],
  },
  firefox: {
    browserName: 'Firefox',
    archiveUrl: firefoxExtensionArchiveUrl,
    downloadName: 'pairbeam-firefox-extension.zip',
    steps: [
      <>Download the PairBeam Firefox extension ZIP. Keep the ZIP intact.</>,
      <>
        Open <code>about:debugging#/runtime/this-firefox</code>.
      </>,
      <>
        Choose <strong>Load Temporary Add-on</strong>.
      </>,
      <>
        Select the downloaded <code>pairbeam-firefox-extension.zip</code> file.
      </>,
      <>Reload PairBeam after installation.</>,
    ],
  },
};

const posterUrl = (path) =>
  path
    ? `https://image.tmdb.org/t/p/w342${path.startsWith('/') ? path : `/${path}`}`
    : null;

const episodeLabel = (media) =>
  media?.mediaType === 'tv'
    ? `S${String(media.season).padStart(2, '0')} E${String(media.episode).padStart(2, '0')}${media.episodeTitle ? ` · ${media.episodeTitle}` : ''}`
    : null;

const MediaSummary = ({ media }) => {
  const selectedEpisode = episodeLabel(media);
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="grid h-16 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/[0.06] text-zinc-600">
        {posterUrl(media?.posterPath) ? (
          <img
            src={posterUrl(media.posterPath)}
            alt=""
            className="size-full object-cover"
          />
        ) : (
          <Film className="size-4" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-zinc-100">
          {media?.title}
        </p>
        <p className="mt-1 truncate text-xs text-zinc-400">
          {selectedEpisode || 'Vidking sync prototype · no media relay'}
        </p>
        {selectedEpisode ? (
          <p className="mt-0.5 text-[10px] text-zinc-600">
            Vidking sync prototype · no media relay
          </p>
        ) : null}
      </div>
    </div>
  );
};

const ExtensionInstallNotice = ({
  compact = false,
  reloadRequired = false,
}) => {
  const detectedBrowser = detectCurrentExtensionBrowser();
  const target = EXTENSION_TARGETS[detectedBrowser.family] || null;
  const alternateTarget =
    detectedBrowser.family === 'firefox'
      ? EXTENSION_TARGETS.chromium
      : EXTENSION_TARGETS.firefox;

  return (
    <div
      className={`flex gap-2 rounded-xl border border-amber-300/25 bg-amber-300/[0.08] text-amber-100 ${compact ? 'p-2.5' : 'p-3'}`}
      role="alert"
    >
      <Puzzle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs font-semibold">
          {reloadRequired
            ? 'Reload PairBeam to reconnect'
            : 'PairBeam extension required'}
        </p>
        <p className="mt-1 text-[11px] leading-5 text-amber-100/80">
          {reloadRequired
            ? 'The extension was updated or reloaded while this room tab was open. Reload this tab to attach the new extension context; you do not need to reinstall it.'
            : target && detectedBrowser.supported
              ? `PairBeam detected ${detectedBrowser.label}. Both participants must load the ${target.browserName} extension and reload the room.`
              : `${detectedBrowser.label} does not support this desktop companion flow. Open PairBeam in desktop Firefox or a Chromium browser.`}
        </p>
        {!reloadRequired && !compact && target && detectedBrowser.supported ? (
          <>
            <ol className="mt-2 list-decimal space-y-0.5 pl-4 text-[11px] leading-5 text-amber-100/80">
              {target.steps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
            {detectedBrowser.family === 'firefox' ? (
              <p className="mt-2 text-[10px] leading-4 text-amber-100/65">
                Firefox removes temporary add-ons when it restarts. Standard
                Firefox requires Mozilla signing for permanent installation.
              </p>
            ) : null}
          </>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-2">
          {reloadRequired ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-amber-100 px-3 text-xs font-semibold text-amber-950 transition-colors outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-amber-200"
            >
              Reload PairBeam
            </button>
          ) : target && detectedBrowser.supported ? (
            <a
              href={target.archiveUrl}
              download={target.downloadName}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-amber-100 px-3 text-xs font-semibold text-amber-950 transition-colors outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-amber-200"
            >
              Download for {target.browserName}
            </a>
          ) : (
            Object.values(EXTENSION_TARGETS).map((downloadTarget) => (
              <a
                key={downloadTarget.browserName}
                href={downloadTarget.archiveUrl}
                download={downloadTarget.downloadName}
                className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-amber-100 px-3 text-xs font-semibold text-amber-950 transition-colors outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-amber-200"
              >
                {downloadTarget.browserName}
              </a>
            ))
          )}
          {!reloadRequired &&
          !compact &&
          target &&
          detectedBrowser.supported ? (
            <a
              href={alternateTarget.archiveUrl}
              download={alternateTarget.downloadName}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-amber-200/25 bg-amber-100/10 px-3 text-xs font-medium text-amber-50 transition-colors outline-none hover:bg-amber-100/15 focus-visible:ring-2 focus-visible:ring-amber-200"
            >
              Download for {alternateTarget.browserName}
            </a>
          ) : null}
          <a
            href={EXTENSION_GUIDE_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-amber-200/25 bg-amber-100/10 px-3 text-xs font-medium text-amber-50 transition-colors outline-none hover:bg-amber-100/15 focus-visible:ring-2 focus-visible:ring-amber-200"
          >
            Installation help{' '}
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>
    </div>
  );
};

export default function ExternalWatchParty({ isIdle }) {
  const {
    externalWatchInvite,
    outgoingExternalWatchProposal,
    externalWatchSession,
    externalWatchCommand,
    externalWatchProposalStatus,
    respondExternalWatchProposal,
    requestExternalWatchControl,
    publishExternalWatchState,
    selectExternalWatchEpisode,
    stopExternalWatch,
    isChatOpen,
    isFullscreen,
  } = useWebRTC();
  const [extensionDetected, setExtensionDetected] = useState(false);
  const [extensionReloadRequired, setExtensionReloadRequired] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerError, setPlayerError] = useState('');
  const [popupBlocked, setPopupBlocked] = useState(false);
  const sessionRef = useRef(externalWatchSession);
  const lastPublishedAtRef = useRef(0);
  const lastAppliedCommandRef = useRef(null);
  const lastAppliedRevisionRef = useRef(-1);
  const popupNoticeTimerRef = useRef(null);
  const externalSeekTimerRef = useRef(null);
  const externalSeekResumeTimerRef = useRef(null);
  const activeWatchProposalId = externalWatchSession?.proposalId || null;
  const activeMediaIdentity = externalWatchSession?.media
    ? `${externalWatchSession.media.mediaType}:${externalWatchSession.media.tmdbId}:${externalWatchSession.media.season || 0}:${externalWatchSession.media.episode || 0}`
    : null;
  sessionRef.current = externalWatchSession;

  const sendBridgeCommand = useCallback((command) => {
    window.postMessage(
      { channel: PAGE_CHANNEL, type: 'command', command },
      window.location.origin,
    );
  }, []);

  const clearExternalSeekTimers = useCallback(() => {
    window.clearTimeout(externalSeekTimerRef.current);
    window.clearTimeout(externalSeekResumeTimerRef.current);
    externalSeekTimerRef.current = null;
    externalSeekResumeTimerRef.current = null;
  }, []);

  useEffect(() => {
    if (!activeMediaIdentity) return;
    clearExternalSeekTimers();
    lastPublishedAtRef.current = 0;
    lastAppliedCommandRef.current = null;
    lastAppliedRevisionRef.current = -1;
    setPlayerReady(false);
    setPlayerError('');
  }, [activeMediaIdentity, clearExternalSeekTimers]);

  const scheduleExternalResume = useCallback(
    (commandId) => {
      window.clearTimeout(externalSeekResumeTimerRef.current);
      externalSeekResumeTimerRef.current = window.setTimeout(() => {
        externalSeekResumeTimerRef.current = null;
        sendBridgeCommand({ action: 'play', commandId: `${commandId}-resume` });
      }, SEEK_SETTLE_DELAY_MS);
    },
    [sendBridgeCommand],
  );

  const toggleExternalFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await (
          document.getElementById('root') || document.documentElement
        ).requestFullscreen();
      }
    } catch (error) {
      setPlayerError(
        error?.message || 'Fullscreen could not be opened in this browser.',
      );
    }
  }, []);

  useEffect(() => {
    const onMessage = (event) => {
      if (event.source !== window || event.origin !== window.location.origin)
        return;
      const message = event.data;
      if (!message || message.channel !== EXTENSION_CHANNEL) return;
      if (message.type === 'user-activity') {
        window.dispatchEvent(new Event('pairbeam-user-activity'));
        return;
      }
      if (message.type === 'status') {
        const detected = Boolean(message.detected);
        setExtensionDetected(detected);
        setPlayerReady(Boolean(message.playerReady));
        setExtensionReloadRequired(
          !detected && message.reloadRequired === true,
        );
        return;
      }
      if (message.type === 'popup-blocked') {
        window.clearTimeout(popupNoticeTimerRef.current);
        setPopupBlocked(true);
        popupNoticeTimerRef.current = window.setTimeout(() => {
          setPopupBlocked(false);
          popupNoticeTimerRef.current = null;
        }, 3500);
        return;
      }
      if (message.type !== 'player-event' || !message.event) return;

      const playerEvent = message.event;
      if (['attached', 'ready', 'canplay'].includes(playerEvent.event))
        setPlayerReady(true);
      if (playerEvent.event === 'error') {
        setPlayerError(
          playerEvent.error ||
            'The provider player rejected a synchronized command.',
        );
        return;
      }
      const session = sessionRef.current;
      if (
        !session ||
        typeof playerEvent.paused !== 'boolean' ||
        !Number.isFinite(playerEvent.position)
      )
        return;

      if (
        session.authority === 'local' &&
        PUBLISH_EVENTS.has(playerEvent.event)
      ) {
        const now = performance.now();
        if (
          playerEvent.event === 'timeupdate' &&
          now - lastPublishedAtRef.current < 1500
        )
          return;
        lastPublishedAtRef.current = now;
        publishExternalWatchState({
          paused: playerEvent.paused,
          position: playerEvent.position,
          duration: playerEvent.duration,
        });
        if (playerEvent.event === 'seeked' && playerEvent.resumeAfterSeek) {
          scheduleExternalResume(`local-seek-${Date.now()}`);
        }
        return;
      }

      if (
        session.authority === 'remote' &&
        !playerEvent.commandId &&
        REQUEST_EVENTS.has(playerEvent.event)
      ) {
        requestExternalWatchControl({
          action: playerEvent.event === 'seeked' ? 'seek' : playerEvent.event,
          position: playerEvent.position,
          resumeAfterSeek:
            playerEvent.event === 'seeked' &&
            playerEvent.resumeAfterSeek === true,
        });
      }
    };

    window.addEventListener('message', onMessage);
    const ping = () =>
      window.postMessage(
        { channel: PAGE_CHANNEL, type: 'ping' },
        window.location.origin,
      );
    ping();
    const interval = window.setInterval(ping, 1500);
    return () => {
      window.removeEventListener('message', onMessage);
      window.clearInterval(interval);
      window.clearTimeout(popupNoticeTimerRef.current);
      popupNoticeTimerRef.current = null;
      clearExternalSeekTimers();
    };
  }, [
    clearExternalSeekTimers,
    publishExternalWatchState,
    requestExternalWatchControl,
    scheduleExternalResume,
  ]);

  useEffect(() => {
    const active = Boolean(activeWatchProposalId);
    window.postMessage(
      { channel: PAGE_CHANNEL, type: 'watch-session', active },
      window.location.origin,
    );
    return () => {
      if (active) {
        window.postMessage(
          { channel: PAGE_CHANNEL, type: 'watch-session', active: false },
          window.location.origin,
        );
      }
    };
  }, [activeWatchProposalId]);

  useEffect(() => {
    if (
      !externalWatchCommand ||
      lastAppliedCommandRef.current === externalWatchCommand.commandId
    )
      return;
    lastAppliedCommandRef.current = externalWatchCommand.commandId;
    clearExternalSeekTimers();
    if (externalWatchCommand.action !== 'seek') {
      sendBridgeCommand(externalWatchCommand);
      return;
    }

    sendBridgeCommand({
      action: 'pause',
      commandId: `${externalWatchCommand.commandId}-pause`,
    });
    externalSeekTimerRef.current = window.setTimeout(() => {
      externalSeekTimerRef.current = null;
      sendBridgeCommand(externalWatchCommand);
    }, 75);
    if (externalWatchCommand.resumeAfterSeek) {
      scheduleExternalResume(externalWatchCommand.commandId);
    }
  }, [
    clearExternalSeekTimers,
    externalWatchCommand,
    scheduleExternalResume,
    sendBridgeCommand,
  ]);

  useEffect(() => {
    const state = externalWatchSession?.playback;
    if (
      externalWatchSession?.authority !== 'remote' ||
      !state ||
      state.revision <= lastAppliedRevisionRef.current
    )
      return;
    lastAppliedRevisionRef.current = state.revision;
    sendBridgeCommand({
      action: 'sync',
      commandId: `sync-${state.revision}`,
      paused: state.paused,
      position: state.position,
    });
  }, [externalWatchSession, sendBridgeCommand]);

  if (externalWatchInvite) {
    return (
      <div
        className="fixed inset-0 z-[90] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
        data-idle-exempt="true"
      >
        <section
          className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111719] p-5 shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="watch-invite-title"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.16em] text-teal-300 uppercase">
                Watch together invite
              </p>
              <h2
                id="watch-invite-title"
                className="mt-1 text-lg font-semibold text-white"
              >
                Open this title together?
              </h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => respondExternalWatchProposal(false)}
              aria-label="Decline invitation"
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="mt-5">
            <MediaSummary media={externalWatchInvite.media} />
          </div>
          <p className="mt-4 text-xs leading-5 text-zinc-400">
            Accepting loads the third-party Vidking embed in your browser.
            Vidking receives your network request and IP address and may use its
            own storage or cookies. PairBeam sends playback state, not the
            movie, to your peer.
          </p>
          {!extensionDetected ? (
            <div className="mt-4">
              <ExtensionInstallNotice
                reloadRequired={extensionReloadRequired}
              />
            </div>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => respondExternalWatchProposal(false)}
            >
              Decline
            </Button>
            <Button
              variant="active"
              disabled={!extensionDetected}
              onClick={() => respondExternalWatchProposal(true)}
            >
              <Check className="size-4" />
              Accept and open
            </Button>
          </div>
        </section>
      </div>
    );
  }

  if (outgoingExternalWatchProposal) {
    return (
      <div
        className="fixed top-6 left-1/2 z-[90] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-white/10 bg-[#111719]/95 p-4 shadow-2xl backdrop-blur-xl"
        role="status"
        data-idle-exempt="true"
      >
        <div className="flex items-center gap-3">
          <LoaderCircle className="size-5 shrink-0 animate-spin text-teal-300" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-zinc-100">
              Waiting for the other participant
            </p>
            <p className="truncate text-xs text-zinc-500">
              {outgoingExternalWatchProposal.media.title}
              {episodeLabel(outgoingExternalWatchProposal.media)
                ? ` · ${episodeLabel(outgoingExternalWatchProposal.media)}`
                : ''}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={stopExternalWatch}>
            Cancel
          </Button>
        </div>
        {!extensionDetected ? (
          <div className="mt-3">
            <ExtensionInstallNotice
              compact
              reloadRequired={extensionReloadRequired}
            />
          </div>
        ) : null}
      </div>
    );
  }

  if (!externalWatchSession) {
    if (!['declined', 'cancelled'].includes(externalWatchProposalStatus))
      return null;
    return (
      <div
        className="fixed top-6 left-1/2 z-[90] flex -translate-x-1/2 items-center gap-3 rounded-xl border border-white/10 bg-[#111719]/95 px-4 py-3 text-sm text-zinc-300 shadow-2xl"
        role="status"
      >
        <span>
          {externalWatchProposalStatus === 'declined'
            ? 'The watch invite was declined.'
            : 'The watch invite was cancelled.'}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={stopExternalWatch}
          aria-label="Dismiss"
        >
          <X className="size-4" />
        </Button>
      </div>
    );
  }

  const embedUrl = buildVidkingEmbedUrl(externalWatchSession.media);
  const externalControlsHidden = isFullscreen && isIdle;
  return (
    <section
      className={`absolute inset-0 z-10 overflow-hidden bg-black ${isChatOpen && isFullscreen && !isIdle ? 'external-watch--chat-docked' : ''}`}
      aria-label={`Watching ${externalWatchSession.media.title}`}
      data-idle-exempt="true"
    >
      <iframe
        title={`Vidking player for ${externalWatchSession.media.title}`}
        src={embedUrl}
        className="size-full border-0 bg-black"
        allow="autoplay; picture-in-picture; encrypted-media"
        referrerPolicy="no-referrer"
      />
      <SeriesEpisodeDrawer
        media={externalWatchSession.media}
        onSelect={selectExternalWatchEpisode}
        hidden={externalControlsHidden}
      />
      <div
        className={`absolute top-4 right-4 z-50 flex gap-2 transition-opacity duration-200 ease-out motion-reduce:transition-none sm:top-6 sm:right-6 ${externalControlsHidden ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
        aria-hidden={externalControlsHidden}
        inert={externalControlsHidden}
      >
        <Button
          variant="secondary"
          size="sm"
          className="h-9"
          onClick={toggleExternalFullscreen}
          aria-label={
            isFullscreen
              ? 'Exit PairBeam fullscreen'
              : 'Open PairBeam fullscreen'
          }
        >
          {isFullscreen ? (
            <Minimize className="size-4" />
          ) : (
            <Maximize className="size-4" />
          )}
          <span className="hidden sm:inline">
            {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          </span>
        </Button>
        <Button variant="secondary" size="sm" onClick={stopExternalWatch}>
          <X className="size-4" />
          Stop watching
        </Button>
      </div>
      {!extensionDetected || !playerReady || playerError ? (
        <div className="pointer-events-auto absolute bottom-24 left-1/2 w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-amber-300/20 bg-amber-950/95 p-3 text-xs leading-5 text-amber-100 shadow-xl">
          {!extensionDetected ? (
            <ExtensionInstallNotice
              compact
              reloadRequired={extensionReloadRequired}
            />
          ) : (
            <div className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>
                {playerError ||
                  'The extension is connected and waiting for the Vidking video element. Start the provider player if it remains idle.'}
              </p>
            </div>
          )}
        </div>
      ) : null}
      {popupBlocked ? (
        <div
          className="pointer-events-none absolute top-24 right-4 rounded-lg border border-teal-300/20 bg-black/80 px-3 py-2 text-xs text-teal-100 shadow-xl"
          role="status"
        >
          Blocked a provider popup.
        </div>
      ) : null}
    </section>
  );
}
