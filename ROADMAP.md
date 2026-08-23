# Product roadmap

This roadmap keeps the product database-free. Rooms remain ephemeral, signaling only coordinates WebRTC peers, chat uses the data channel, and no call content is stored on the server.

## Product rules

- A room supports two participants.
- Either participant can share a screen, including at the same time.
- Choosing a main view is local UI state. It does not force the other participant to change their view.
- When the selected share ends, the viewer falls back to the other active share. If no share remains, the participant camera or avatar becomes the main view.
- Refreshing or leaving clears call and chat state.

## Priority plan — catalog streaming, redesign, and chat

This priority order was audited on 2026-08-22. Every unfinished item later in this document is tagged P0–P3. P0 is a release or safety gate; P1 is the next user-facing milestone; P2 follows after the core flow is stable; P3 is exploratory.

### P0 — provider, privacy, and synchronization gates

- [ ] **P0 — Verify distribution rights before integration.** Do not ship Vidking, Vidsrc, or another free movie embed until the provider supplies verifiable authorization to distribute/embed the catalog, stable terms, a privacy policy, an abuse contact, and an operational support path. The current public pages advertise free current-title embeds, but the audit did not find enough licensing information to treat redistribution as approved.
- [x] **P0 — Require a bidirectional player contract.** The provider capability gate now requires readiness/state events plus inbound play, pause, and seek support before production enablement. Cross-origin iframe DOM access is prohibited by the browser, so an iframe without an inbound `postMessage` API cannot provide dependable synchronization.
- [x] **P0 — Keep a provider adapter boundary.** The tested adapter contract requires `buildEmbedUrl`, `load`, `play`, `pause`, `seek`, `subscribe`, `destroy`, HTTPS origin metadata, production approval, and explicit capability flags. Room state and UI are not coupled to Vidking/Vidsrc URL formats.
- [x] **P0 — Add viewer consent before third-party loading.** The extension prototype sends a bounded title/provider proposal over the encrypted data channel, requires Accept/Decline before creating the iframe, and explains the provider network/privacy boundary.
- [ ] **P0 — Isolate third-party frames.** Use an exact `frame-src` allowlist, restrictive iframe `sandbox`/`allow` permissions, `referrerPolicy="no-referrer"` where compatible, and no popup/top-navigation permission. Never inject provider scripts into PairBeam's top-level document.
- [x] **P0 — Validate the prototype message boundary.** PairBeam checks same-window/same-origin bridge messages, validates bounded data-channel proposal/command/state schemas, rejects stale revisions, and uses exact target origins rather than `*`.
- [x] **P0 — Do not scrape or proxy provider streams.** The companion extension observes only player state and invokes ordinary video controls. It does not discover hidden media URLs, bypass access controls, download media, or rebroadcast a provider stream through WebRTC.
- [x] **P0 — Build a cross-browser Vidking companion spike.** Desktop Chrome/Chromium and Firefox load an exact movie or TV episode locally after consent; proposer-authoritative play/pause/seek state travels through the existing data channel. One auditable runtime source is packaged with separate Chrome service-worker and Firefox event-page manifests.
- [x] **P0 — Split browser manifests and recover stale extension contexts.** Chrome's ZIP now contains only the MV3 `background.service_worker` entry, Firefox's ZIP contains only `background.scripts`, and PairBeam offers a one-click tab reload when an extension update invalidates an already-injected content script.
- [x] **P0 — Keep external playback mounted through signaling recovery.** A transient Render WebSocket interruption, an instance replacement that reconstructs the in-memory room, a confirmed peer departure, or a replacement WebRTC offer rebuilds only the peer transport; it no longer clears the accepted Vidking session or unmounts its iframe. The provider stays until explicit **Stop watching** or room exit. The backend holds the interrupted room seat for 30 seconds, the authority retains its live clock without a data channel, and replacement channels exchange a validated recovery snapshot so the media revision and playback position resume after negotiation.
- [x] **P0 — Harden pause, stop, and provider quality changes.** Shared local movies pause before sender cleanup. The extension now tags only the native events expected from a remote command, chooses the most likely long-form video when multiple video elements exist, and restores the last playback state after provider source/player replacement.
- [x] **P0 — Add a coordinated seek settle window.** Starting a timeline seek pauses playback, the authority applies and publishes the target timestamp, both players remain paused for 900 ms to settle, and playback resumes only when it was running before the seek. This applies to PairBeam's shared-movie slider and extension-controlled provider seeking.
- [x] **P0 — Guard provider popup tabs with the companion extension.** Vidking rejects sandboxed embeds, so the incompatible `sandbox` attribute was removed. While an accepted watch session is active, the extension closes new top-level targets created by provider subframes. Normal PairBeam top-level links and manually opened tabs are not globally blocked.
- [x] **P0 — Make the companion-extension requirement actionable.** If PairBeam cannot detect the extension, invitations cannot be accepted. PairBeam detects Firefox, Edge, Opera, Chrome/Chromium, mobile, and unsupported desktop browsers locally; it selects the correct browser-specific ZIP and instructions while retaining an alternate download.
- [x] **P0 — Add a Firefox personal-install flow.** Firefox receives a Gecko extension ID, no-data-collection declaration, MV3 `background.scripts` event-page fallback, and a `web-ext`-built ZIP with `manifest.json` at the archive root for direct temporary loading through `about:debugging`. Active watch state is rehydrated on bridge registration so background suspension does not silently disable popup protection.
- [x] **P0 — Replace rejected CRX distribution with manual unpacked installation.** Chrome can reject a privately packed CRX with `CRX_REQUIRED_PROOF_MISSING`; PairBeam now downloads a ZIP and never initiates installation. The user extracts it and explicitly chooses the extension folder through **Load unpacked**. The `.pem` and local `.crx` are ignored and excluded from deployment.
- [x] **P0 — Complete the two-device movie provider gate.** The owner confirmed the synchronized Vidking movie flow passed testing on two physical devices, so exact TV episode selection is now enabled.
- [x] **P0 — Preserve PairBeam controls in provider fullscreen.** Embedded providers no longer receive native iframe-fullscreen permission, because a cross-origin iframe in the browser top layer hides every PairBeam sibling overlay. The labelled PairBeam fullscreen action expands the application root instead, preserving chat, episode navigation, participant camera, and the call dashboard.
- [ ] **P0 — Complete the physical-device series test matrix.** Test at least one multi-season series on two physical devices and cover Chrome↔Chrome, Firefox↔Firefox, and mixed Chrome↔Firefox sessions, including episode identity, season changes, autoplay denial, subtitles, fullscreen, popup behavior, drift, reconnect, extension/background restart, and provider shutdown. Vidsrc remains disabled.
- [ ] **P1 — Investigate provider-authorized ad-free playback separately from popup protection.** Do not scrape or hide unknown provider UI or add broad request-blocking rules. Use a documented paid/ad-free provider contract, or narrowly verified MV3 declarative rules only when they do not interfere with video manifests, subtitle tracks, quality switching, analytics required by the provider, or access controls.

Current investigation:

- The contract was re-audited on 2026-08-22. Vidking documents movie routes at `/embed/movie/{tmdbId}` and series routes at `/embed/tv/{tmdbId}/{season}/{episode}`. Its current player bundle emits `PLAYER_EVENT` messages for play, pause, time updates, seeks, and ended, and accepts a start `progress` URL parameter. The bundle has no parent-window listener for inbound play/pause/seek commands; the visible `message` listeners belong to media/utility internals. Reloading an iframe at a new start time would lose buffer/player state, encounter autoplay policy, and is not acceptable synchronization.
- Vidsrc.sbs documents `/embed/movie/{tmdb_id}` and `/embed/tv/{tmdb_id}/{season_number}/{episode_number}`, plus autoplay, subtitle, and starting-time URL options. Its embed page currently nests multiple unrelated player origins and changes iframe sandboxing per server; no stable parent playback-event bridge or inbound control contract was found. This expands the privacy, CSP, popup/navigation, availability, and origin-validation surface.
- Documentation found on `vidsrc.tw` describes outbound `PLAYER_EVENT` progress messages and a `startAt` reload parameter, not inbound play/pause/seek commands. It is also a different domain from the requested Vidsrc.sbs integration, so its behavior cannot be assumed to apply to Vidsrc.sbs.
- Both can currently be framed, but that only proves technical embeddability. It does not prove content rights, reliability, safe popup behavior, or watch-party control.
- **Current experiment:** Vidking remains unavailable to an ordinary PairBeam page because of the same-origin boundary and missing inbound player API. A manually loaded cross-browser MV3 companion extension now supplies the missing local control bridge for explicit Chrome/Chromium and Firefox testing. PairBeam distributes its auditable source as browser-labelled ZIPs and auto-selects the matching manual setup flow. This is not a media extractor: each user requests the same public embed directly, while PairBeam carries only playback state.
- **Vidsrc decision:** keep Vidsrc disabled. Its nested/changing player origins materially widen extension permissions and have not passed the same security and reliability review.
- **Implemented gates:** `watchProvider.js` still rejects providers from the normal web adapter path. `externalWatchProtocol.js` separately validates the extension-only proposal, authority, command, and monotonically revised playback-state protocol.

Research: [Vidking](https://www.vidking.net/), [Vidsrc.sbs embed documentation](https://vidsrc.sbs/), [browser same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy), [`postMessage` security](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage), [iframe security/permissions](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe), [Mozilla cross-browser MV3 backgrounds](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background), and [Firefox temporary installation](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/).

### P1 — searchable catalog and series experience, without a database

- [x] **P1 — Add a frontend-only TMDB catalog client.** Search and detail requests go directly from the browser to TMDB with no PairBeam backend route, proxy, database, or cache. The deployment uses a restricted, replaceable `VITE_TMDB_READ_ACCESS_TOKEN`; because Vite embeds it in the public bundle, it must never be treated as a private credential or reused as a TMDB user/session token.
- [x] **P1 — Build a shadcn-style catalog search flow.** Debounce and cancel searches; show skeleton, empty, authentication, offline/upstream, and rate-limit states. Search movies and TV series only, with poster, title, year, media-type label, and a clearly attributed TMDB rating.
- [x] **P1 — Keep catalog metadata separate from playback availability.** A TMDB result means “metadata found,” not “stream available.” Ordinary cross-origin providers remain blocked by the capability gate; only the explicit Vidking companion-extension flow may create a proposal, and the peer must consent before either browser loads the provider iframe.
- [ ] **P1 — Complete movie details before the watch request.** Poster, title, year, runtime, genres, overview, rating, source attribution, and the extension-only peer Accept/Decline proposal are implemented. Backdrop and content rating remain. A catalog selection never immediately loads media on the peer.
- [x] **P1 — Complete the series navigator.** Series details now provide desktop season navigation, an accessible shadcn-style mobile season Sheet, and scrollable episode cards with still, exact S/E code, title, runtime, air date, overview, TMDB rating, loading/error states, and an explicit Watch episode action.
- [x] **P1 — Synchronize exact selected-media identity.** Movie proposals send validated provider ID, TMDB ID, media type, title, and poster path. TV proposals additionally require an exact season and episode and carry the bounded episode title; both participants render the same identity and load the same Vidking episode route.
- [x] **P1 — Add the in-player series drawer.** While a TV episode is active, a persistent left-edge arrow opens a focus-managed, keyboard-dismissible season/episode Sheet above the player. Either participant can choose an episode; viewer choices become requests that the proposer authority validates and publishes so both iframes switch together.
- [x] **P1 — Isolate playback generations across episode changes.** Episode selections carry an authoritative media revision, and every play/pause/seek state is tagged with that revision. Late commands and timestamps from the previous episode are rejected, while a short source-change guard ignores events emitted as the old iframe is being replaced.
- [ ] **P1 — Add replace-session confirmation.** If a local movie, screen share, or external provider session is already active, show the current and proposed sources before stopping or replacing anything.
- [ ] **P1 — Complete the authoritative playback clock.** The extension prototype publishes paused/playing state, position, duration, and monotonically increasing revision; the proposer applies viewer requests and rebroadcasts truth. Monotonic send-time compensation, tiered drift correction, reconnect snapshots, and browser tests remain. Volume stays local.
- [x] **P1 — Label ratings correctly.** TMDB supplies `vote_average`, not an IMDb rating. Use a TMDB-labelled star by default. Display “IMDb” only through an IMDb-licensed source or the official non-commercial dataset under its terms; never scrape IMDb pages or relabel TMDB votes.
- [ ] **P1 — Add required TMDB attribution.** Include the approved TMDB logo and notice in an About/Credits surface and follow commercial licensing requirements if PairBeam becomes revenue-generating.

Catalog sources: [TMDB multi-search](https://developer.themoviedb.org/reference/search-multi), [TMDB images](https://developer.themoviedb.org/reference/movie-images), [TMDB TV episode details](https://developer.themoviedb.org/reference/tv-episode-details), [TMDB external IDs](https://developer.themoviedb.org/reference/movie-external-ids), [TMDB authentication](https://developer.themoviedb.org/docs/authentication-application), [TMDB attribution and licensing FAQ](https://developer.themoviedb.org/docs/faq), and [official IMDb dataset terms](https://www.imdb.com/interfaces/).

### P1 — unified interface redesign

- [ ] **P1 — Replace the overlay collection with a responsive room shell.** Use a stable stage with an optional series rail. In the ordinary room, chat overlays the stage without reflow; in fullscreen/presentation it becomes a docked desktop rail that reserves media space. Mobile allows only one bounded Sheet at a time.
- [x] **P1 — Establish semantic shadcn-style tokens.** Background, panel, foreground, muted, border, primary, destructive, focus-ring, and radius roles now back the local primitives and room shell. Continue migrating incidental legacy hardcoded colors as their owning components are redesigned; shared-content media remains true black.
- [ ] **P1 — Complete the local primitive set.** Add accessible local shadcn-style Sheet/Drawer, Command, ScrollArea, Select, DropdownMenu, Avatar, Badge, Skeleton, Separator, and ToggleGroup primitives as needed; do not install a second design framework.
- [ ] **P1 — Redesign the room hierarchy.** Keep room/invite/health in a quiet top strip, content selection in a dedicated watch-together surface, and camera/mic/share/movie/leave controls in one compact bottom transport. Avoid stacked floating cards over the video.
- [ ] **P1 — Define shared loading, empty, permission, provider-error, disconnected, and unavailable states.** Every state must preserve a usable Leave action, chat access, and keyboard focus.

### P1 — shadcn-style chat, emoji, and message reactions

- [ ] **P1 — Replace the custom chat dialog shell with a local shadcn-style Sheet on narrow screens and a semantic docked panel on wide screens.** Use ScrollArea for messages, Tooltip/DropdownMenu for message actions, Popover + Command for emoji, Avatar/fallbacks for speakers, and visible focus management.
- [x] **P1 — Introduce shared chat message IDs before reactions.** The sender creates and transmits a bounded message ID and timestamp; both peers store the same ID. Duplicates and malformed IDs are rejected so reactions target the same message on both devices.
- [x] **P1 — Add reactions to every message.** Hover, focus, and touch actions expose a curated emoji set; reaction chips show counts and local pressed state. Toggling sends an idempotent `chat-reaction` event and persists only for the room lifetime.
- [x] **P1 — Add a composer emoji picker.** The compact searchable local set inserts Unicode at the caret and supports keyboard navigation and Escape without adding a large emoji dependency to the initial bundle.
- [x] **P1 — Keep chat unobtrusive during media playback.** In the ordinary room, opening chat is an overlay and never shrinks or shifts the media stage. In fullscreen/presentation it reserves a docked desktop rail, while mobile uses a bounded panel. During external playback, the launcher moves away from the provider's bottom-right controls, and chat activity does not wake PairBeam's media controls.
- [ ] **P1 — Validate ephemeral chat payloads.** Bound message, emoji, and reaction lengths; allow only known event shapes; escape/render text as text; clear messages and reactions on leave/reload; add two-peer ordering, duplicate, reconnect, and accessibility tests.

### Audited remaining backlog

| Priority | Meaning | Remaining work |
| --- | --- | --- |
| P0 | Production/reliability gate | TURN credentials; negotiation generation IDs; schema validation; reconnect and end-to-end browser coverage; security headers/CORS/dependency automation; external-provider gates above |
| P1 | Next product milestone | catalog/series flow; unified redesign; chat reactions/emoji; watch invitations; replace-share confirmation; keyboard shortcuts; pre-call device preview; accessibility coverage |
| P2 | Stability and compatibility | regional/short-lived TURN; per-stream diagnostics; quality-warning hysteresis; diagnostics export; Linux audio matrix; Firefox/Safari PiP; MKV prototype and benchmarks; GIF messaging |
| P3 | Exploratory/later | Document PiP; same-file fingerprint mode; chunked RTCDataChannel/MSE research; raised hand; annotations/laser pointer; mobile Web Share |

Duplicate roadmap entries for movie invitations, diagnostics export, and browser tests are consolidated under their highest-priority owner below.

## Now — call clarity and reliability

- [x] Add realistic screen-share resolution, frame-rate, and bitrate presets.
- [x] Wait for the screen sender track before applying encoding parameters.
- [x] Attach an already-running screen share when a peer connection is negotiated.
- [x] Keep a negotiated placeholder screen track so later `replaceTrack()` calls reach the viewer reliably.
- [x] Clear stale remote screen state when a participant stops sharing.
- [x] Return to the participant camera/avatar after the final share ends.
- [x] Add local view selection for simultaneous screen shares.
- [x] Establish reusable shadcn-style Button, Tabs, and Tooltip components.
- [x] Add accessible labels, focus rings, live empty states, and responsive call controls.
- [x] Add an in-call connection health indicator based on `getStats()`.
- [x] Show actionable transport loss/latency and browser encoder-adaptation states alongside actual video quality.
- [x] Add signaling reconnection with bounded exponential backoff.
- [x] Preserve a healthy WebRTC media path during a brief signaling reconnect with a five-second ephemeral room-seat grace period.
- [x] Add signaling ping/pong heartbeats so idle proxy timeouts and half-open sockets recover instead of hanging silently.
- [x] Ignore late state events from replaced peer connections so they cannot close the current call UI.
- [x] Recover failed media paths with a guarded ICE restart and delay recovery for transient disconnects.
- [x] Show “participant left” and allow waiting for them to rejoin the same ephemeral room.
- [x] Surface whether the selected connection is direct or relayed through TURN.
- [x] Separate transport health from browser encoder limits so CPU pressure is no longer mislabeled as a bad connection.
- [x] Name the active encoder limitation in the health control: device/CPU, upload bandwidth, or another browser adaptation reason.
- [x] Keep the global health status transport-based when the browser adapts an otherwise healthy outbound encoder.
- [x] Keep captured screen audio live when the microphone is muted, unmuted, or switched.
- [x] Request system and window audio with the correct top-level `getDisplayMedia()` options and report when the chosen source returns no audio track.
- [x] Add standard video Picture-in-Picture controls for the participant, local camera, and active main video.
- [x] Detect PipeWire/PulseAudio monitor inputs and offer an explicit Linux desktop-audio fallback when the browser exposes one.
- [ ] **P0 — Configure production TURN credentials in the deployment environment.**

## Investigation — reconnecting, ICE routing, and endpoint load

### Why “Establishing the private connection” could remain visible

- [x] Fix signaling reconnects being treated as a full peer leave/join. A brief WebSocket loss now reserves the same in-memory room seat for five seconds and does not tear down a healthy direct media path.
- [x] Fix delayed `closed` or `failed` events from an old `RTCPeerConnection` clearing the newer connection state.
- [x] Await and report call-start failures instead of leaving an unhandled offer failure in the joining state.
- [x] Make optional `RTCRtpSender.setStreams()` association non-fatal so a browser-specific exception cannot prevent the answer from being sent.
- [x] Guard answer/candidate work against a peer connection that was replaced while asynchronous negotiation was running.
- [x] Clear an obsolete WebSocket message handler when signaling reconnects.
- [ ] **P0 — Add a negotiation generation ID to offers, answers, and candidates to reject every late message from an older negotiation.**
- [ ] **P0 — Add a two-browser Playwright reconnect test covering signaling-only loss, transient ICE loss, ICE failure, and a real peer departure.**

### Does a nearer STUN or TURN server make it faster?

- The reported sample—direct UDP, 8 ms round trip, and 0% packet loss—already has a healthy direct transport. STUN helps discover candidates during setup and is not in the ongoing media path. TURN carries media only when direct connectivity fails, so changing TURN cannot improve that direct call.
- [x] Keep trickle ICE enabled by forwarding each candidate as it becomes available instead of waiting for gathering to complete.
- [x] Accept comma-separated STUN and TURN URLs so production can provide regional endpoints plus UDP and TCP/TLS fallbacks.
- [ ] **P2 — Provision geographically distributed TURN endpoints and select them through latency-aware DNS, Anycast, or deployment-region configuration.**
- [ ] **P2 — Use short-lived TURN credentials and monitor direct-versus-relay success rates without storing call content or persistent user identities.**
- A browser does not guarantee that ordering several TURN URLs makes it choose the geographically nearest server. Production locality should be handled by the TURN provider or deployment routing.

### Is camera plus screen or movie sharing heavy for P2P?

- Yes. Each active sender captures and encodes camera plus shared content, uploads both streams, and simultaneously downloads, decodes, and renders the other participant's streams. If both participants run on one PC, that one device performs both sides of the workload and is not a representative performance test.
- Direct P2P avoids a media server but does not remove endpoint encoding and decoding cost. A TURN relay changes the network path, not the browser's capture/codec workload.
- The reported 640 × 360 at 7 fps alongside 8 ms RTT and 0% loss is consistent with browser encoder adaptation, not slow ICE negotiation. `availableOutgoingBitrate` is an estimate and `qualityLimitationReason: bandwidth` can coexist with healthy packet-loss/latency metrics.
- [x] Use a 24/30fps movie profile and Auto quality rather than encoding film content at 60fps.
- [ ] **P2 — Add per-outbound-stream diagnostics so camera and shared-content limitations are identified independently.**
- [ ] **P2 — Add a pre-call performance hint when both room participants are detected on the same device during local testing.**

References: [WebRTC statistics](https://www.w3.org/TR/webrtc-stats/), [ICE restart](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/restartIce), [WebRTC peer connections and trickle ICE](https://webrtc.org/getting-started/peer-connections), and [TURN server guidance](https://webrtc.org/getting-started/turn-server).

## Next — screen-share experience

- [x] Add an “Auto” quality mode that reacts to outgoing bitrate and encoder limitation reasons.
- [x] Display the actual captured and encoded resolution, FPS, and outgoing bitrate after browser constraints are applied.
- [x] Add a presentation mode that hides camera previews and nonessential controls while keeping chat and a clear exit available.
- [x] Add fit/fill controls and a scrollable 100% pixel view for text-heavy shares.
- [ ] **P1 — Add a short confirmation before replacing an existing local screen source.**
- [x] Add a clear system-audio state because browser and operating-system support varies.
- [ ] **P1 — Add keyboard shortcuts for mute, camera, screen share, chat, and fullscreen.**

## Investigation — connection limits, desktop video, and Linux audio

### “Connection limited”

- WebRTC's `qualityLimitationReason` describes the outbound encoder reducing resolution or frame rate because of `cpu`, `bandwidth`, or `other`; it is not, by itself, proof that the peer connection is failing. See the [W3C WebRTC statistics definition](https://w3c.github.io/webrtc-stats/#dom-rtcoutboundrtpstreamstats-qualitylimitationreason).
- Testing both participants on one PC can create legitimate CPU/GPU pressure because that machine captures, encodes, decodes, and renders both ends. Test again on two physical devices before treating a same-PC CPU warning as a production-network defect.
- Packet loss and round-trip time remain the transport-health inputs. Encoder pressure is now displayed as a separate, specific warning.
- [ ] **P2 — Add health-indicator quality-warning hysteresis so a transient browser limitation does not make the global status flicker.**
- [x] Implement the planned Auto preset: reduce frame rate first for text/detail shares and resolution first for motion shares when limitations persist.
- [x] Add separate Auto-quality hysteresis so a single two-second sample cannot change the selected encoding profile.
- Auto waits for sustained encoder pressure before stepping down, reacts faster when bandwidth pressure also produces constrained outgoing bitrate, and requires a longer healthy period before stepping back up.
- [ ] **P2 — Add a locally generated diagnostics export with codec, encoder, candidate path, and limitation-duration counters.**

### Picture-in-Picture

- The standard video Picture-in-Picture API creates a browser-managed floating video window outside the page and requires a user click. Support is browser-dependent; see [MDN's Picture-in-Picture API documentation](https://developer.mozilla.org/en-US/docs/Web/API/Picture-in-Picture_API).
- PairBeam now exposes PiP on the main video, the participant camera shown over a shared screen, and the local camera preview when the browser supports `requestPictureInPicture()`.
- A website cannot force a normal arbitrary window to remain above every desktop application. The browser/desktop window manager owns the PiP surface and its always-on-top behavior.
- [ ] **P2 — Verify the native Firefox PiP affordance and Safari behavior, where the standard programmable button may be unavailable.**
- [ ] **P3 — Evaluate Document Picture-in-Picture only if controls or chat are later required inside the floating window; keep standard video PiP as the compatibility path.**

### Linux screen-share audio

- `getDisplayMedia({ audio: true })` returns audio only when the chosen surface, browser, and operating system support it. `systemAudio` and `windowAudio` are hints; the browser picker and user permission remain authoritative. See [MDN's `getDisplayMedia()` reference](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia).
- Chromium added the `windowAudio` option in Chrome 141, but support remains partial and does not guarantee per-application capture on every Linux setup. See the [Chrome 141 release notes](https://developer.chrome.com/release-notes/141#windowaudio_for_getdisplaymedia).
- Chromium contains a Linux `PulseaudioLoopbackForScreenShare` feature, but it is disabled by default in current source. When enabled by the user, it can expose system loopback capture without installing a virtual-cable application. See [Chromium's media feature definition](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/media/base/media_switches.cc).
- No-virtual-cable Chrome test path: enable `chrome://flags/#pulseaudio-loopback-for-screen-share`, relaunch Chrome, start a share, and enable audio in the browser picker. If the picker still returns video only, PairBeam can use a physical-output `Monitor` source exposed in call settings.
- PipeWire/PulseAudio often exposes physical output monitors as audio inputs. PairBeam can now use a selected monitor source if the browser exposes it. This can capture the entire output, including the other participant, so echo is possible.
- A community implementation has successfully used Linux monitor sources and browser-side track replacement, but application-only routing still requires PipeWire/PulseAudio routing or a browser-native window-audio implementation. See [Screenshare with audio on Linux](https://github.com/edisionnano/Screenshare-with-audio-on-Discord-with-Linux).
- [ ] **P2 — Validate native tab audio, whole-desktop audio, and the monitor fallback on Chrome/Chromium under both Wayland and X11.**
- [x] Add an echo-risk warning when a full-output monitor source is selected.
- [x] Move shared-content audio to a dedicated WebRTC transceiver so microphone mute/switching and shared audio use independent senders.

## Now — Watch Together

- [x] Let either participant choose a local movie without uploading it to PairBeam or storing it in a database.
- [x] Support direct browser-playable media URLs without sending the URL through signaling or storing it in PairBeam.
- [x] Validate direct links, require HTTP(S), reject known video-page providers, and enforce a load timeout.
- [x] Try one-download host capture/WebRTC relay when media CORS permits it; otherwise fall back to synchronized direct playback where the exact URL is sent over the encrypted peer data channel and both participants fetch it.
- [x] Reject direct URLs containing embedded usernames or passwords, and disclose that query-string tokens are shared with the participant in synchronized direct mode.
- [ ] **P0 — Add a viewer-side Accept/Decline confirmation before the browser requests a peer-supplied synchronized direct URL.**
- [x] Capture a compatible local `<video>` player and send its video and audio through the negotiated shared-content transceivers.
- [x] Add source-aware “Your movie” and “Their movie” views while retaining simultaneous two-way source selection.
- [x] Add host play, pause, seek, progress, stop, and automatic end-of-movie cleanup.
- [x] Use a 24/30fps adaptive movie profile instead of spending bandwidth encoding film content at 60fps.
- [x] Keep participant microphone playback independent from the selected shared-content audio.
- [x] Feature-detect media-element capture and explain the Chrome/Firefox or tab-sharing fallback when unavailable.
- [x] Wait for the first decoded frame and asynchronously added `captureStream()` tracks before starting a movie share.
- [x] Add a visible shared-movie player for the host and viewer instead of showing controls only to the host.
- [x] Allow either participant to play, pause, seek, toggle subtitles, and request an exposed audio-track change over the encrypted data channel.
- [x] Parse an external `.srt` file locally and synchronize only the active subtitle cue; do not upload or persist the subtitle file.
- [x] Let the host load or replace an external `.srt` while the movie is already playing.
- [x] Let either participant select an embedded subtitle track in real time when the browser exposes those tracks; the source owner applies the request and republishes the active cue.
- [x] Detect and switch native audio tracks when the browser exposes `HTMLMediaElement.audioTracks`.
- [x] Preserve a movie's native display aspect ratio through capture, WebRTC downscaling, Fit mode, and fullscreen; use a true-black shared-content stage for correct letterboxing.
- [x] Add independent local playback-volume controls for participant voice, shared-screen audio, and shared-movie audio. A host can listen at 60% while the viewer listens at 80%; movie volume is never synchronized over the data channel.
- [x] Bind the host movie slider to the source media element. Per the Media Capture from DOM Elements specification, element volume does not attenuate its captured audio track, so the peer still receives a full-level source and chooses their own volume.
- [ ] **P3 — Add a “we both have this file” mode that fingerprints local files and synchronizes controls without sending movie media.**
- [ ] **P3 — Research chunked RTCDataChannel + Media Source Extensions transfer only if one-copy, original-quality buffered playback becomes a product requirement.**
- [ ] **P0 — Add Playwright coverage with mocked media-element capture plus two-device Chrome and Firefox compatibility testing.**

### Player and MKV investigation

- Vidstack remains a strong React control/accessibility layer for browser-compatible media and live text-track switching. It can load external VTT/SRT/SSA tracks, but it cannot expose an embedded MKV subtitle track that the browser/provider never demuxed.
- Shaka Player is optimized for DASH/HLS and browser-supported MP4/WebM. It supports UTF-8 SRT, WebVTT, TTML, and adaptive-stream audio tracks, but is not a general local MKV decoder.
- Movi Player is the most complete browser-side MKV candidate found: its WebCodecs/FFmpeg-WASM pipeline claims raw MKV, HEVC, multiple audio tracks, and embedded SRT/ASS/WebVTT/PGS/DVB switching. It is still a young dependency, its full bundle is roughly 2–3 MB compressed, and its current `captureStream()` exposes canvas video only. PairBeam must add a `MediaStreamAudioDestinationNode` track explicitly; DOM subtitle overlays also remain outside the captured canvas.
- `playsvideo` is a smaller remux prototype that uses MediaBunny and a native `<video>` pipeline while extracting embedded SRT/ASS/SSA as WebVTT. That is attractive for browser-decodable codecs, but remuxing alone does not make an unsupported HEVC decoder appear, so it does not solve every current MKV/H.265 case.
- `libmedia` is a broader WebCodecs/WASM player alternative with Matroska and subtitle parsing, but it has no documented public capture-stream output and would require deeper renderer integration.
- A lower-level `web-demuxer` + WebCodecs pipeline offers tighter bundle and lifecycle control. PairBeam would own decoding, A/V scheduling, seeking, and track switching; JASSUB can render extracted ASS/SSA into the captured canvas, while image-based subtitles need a renderer such as libbitsub.
- [ ] **P2 — Prototype Movi Player first behind a lazy dynamic import.** Join its canvas video track with an explicit Web Audio destination track, keep subtitle cues synchronized separately initially, and test its decoder fallback against the user's HEVC Main 10 files.
- [ ] **P2 — Keep the MKV engine out of the initial React bundle** and load it only after the user selects an unsupported container/codec.
- [ ] **P2 — Extract text-based embedded MKV subtitle tracks** (SRT/SSA/ASS) in that engine and render the selected cue in PairBeam; image-based PGS/VobSub subtitles require a separate renderer.
- [ ] **P2 — Benchmark a 1080p HEVC MKV** on low-, mid-, and high-tier devices while simultaneously encoding WebRTC video before enabling the fallback in production.
- Until that prototype passes the workload tests, a UI player library alone must not claim that an MKV is playable. Browser-compatible MP4 (H.264/AAC) and WebM remain the supported sharing inputs.

Research: [Vidstack text tracks](https://vidstack.io/docs/player/api/text-tracks/), [Vidstack source and track loading](https://vidstack.io/docs/player/core-concepts/loading/), [Movi Player](https://github.com/mrujjwalg/movi-player), [`playsvideo`](https://github.com/kzahel/playsvideo), [`libmedia`](https://github.com/zhaohappy/libmedia), [`web-demuxer`](https://github.com/bilibili/web-demuxer), [JASSUB](https://github.com/ThaUnknown/jassub), [`libbitsub`](https://github.com/altqx/libbitsub), [Shaka container/subtitle support](https://github.com/shaka-project/shaka-player/blob/main/README.md#media-container-and-subtitle-support), [Media Capture from DOM Elements](https://www.w3.org/TR/mediacapture-fromelement/), and [WebCodecs](https://github.com/w3c/webcodecs).

## Requested focus — chatbox and fullscreen experience

> "Now I want you to fix the Chatbox as well as how the notifications perform and also how the chat works when they are full screen on screenshare... I want you make sure that the chat window is not being annoying on the viewer and they can still see the video or the screen that is being shared with ease.. Think of something okay.. Also on the create room.. I don't like the sparkling logo or that emoji.. It looks AI okay think of something for that... Now focous on the UI of the chatbox okay."

- [x] Replace the fullscreen overlay with a compact docked chat rail so the shared content remains visible; use a bottom sheet on narrow screens.
- [x] Add a quiet notification preview and unread count without automatically opening or obscuring the shared view.
- [x] Add an in-room sound preference with throttled, low-volume notification feedback; keep the preference ephemeral and database-free.
- [x] Support keyboard-first chat: focus management, Enter-to-send, Shift+Enter for a newline, Escape to close, and live announcements for new messages.
- [x] Keep message history in memory only and clear it when the room ends, reloads, or the participant leaves.
- [x] Replace the create-room sparkle/emoji treatment with a restrained product mark that matches the call UI.
- [x] Replace the oversized global settings panel with Discord-style arrow menus beside microphone, camera, and screen-share controls; keep each menu scoped to that media source.
- [x] Put participant voice volume in microphone settings, shared-screen volume in screen settings, and shared-movie volume directly beside the movie timeline.
- [x] Coordinate fullscreen inactivity across the complete media chrome. Pointer, click, or keyboard activity anywhere—including the chat and the cross-origin provider player through the companion bridge—resets one 3-second timer.
- [x] Keep the participant camera above selected screen and external-provider playback as a stage-constrained draggable preview. Dragging never promotes it to the main view; focus and desktop PiP are separate explicit buttons.
- [x] Rebind and elevate the participant camera when external playback starts. Treat the provider-session transition as a media-binding dependency and render the draggable preview in a fixed high-priority overlay so the iframe cannot cover it.
- [x] Add a PairBeam-level fullscreen action for external playback so chat and the participant camera remain available, and move the chat launcher away from the provider player's bottom-right fullscreen area.
- [x] Replace the fullscreen control strip with a compact arrow handle. It opens the mic, camera, screen-share, movie, and leave dashboard above the media. After 3 seconds of inactivity, the chat panel or launcher, left episode trigger, dashboard and arrow handle, and top-right fullscreen/stop actions fade completely and become non-interactive. Any activity restores them, and reduced-motion preferences are respected.
- [x] Fix the fullscreen episode drawer trigger. Keep its vertical centering on press by isolating the button animation and mount the Radix Sheet portal inside the active fullscreen element so the drawer opens visibly on the first click.
- [x] Remove shared-button press translation. Use a subtle reduced-motion-aware scale response so vertically centered chat and episode triggers retain their positioning while pressed.
- [x] Add one coherent interaction-motion system. Chat and the movie-source picker now ease in and out without abrupt unmounts; the catalog uses a controlled Radix dialog so its backdrop and surface finish their exit; episode sheets use a restrained slide/fade overshoot; settings popovers animate from their trigger; catalog content changes and result cards receive short staged entrances. All motion stays below 300 ms and respects `prefers-reduced-motion`.
- [x] Make multi-season navigation explicit. Keep the season chips horizontally scrollable, add accessible earlier/later controls, and center the selected season when the drawer opens or the season changes.
- [x] Treat a superseded `HTMLMediaElement.play()` promise as normal synchronization cancellation. Ignore `AbortError`/play-interrupted outcomes across local, direct-link, and extension-controlled playback while continuing to surface permission and decoder failures.

## Later — collaboration without storage

- [x] **P1 — Complete the message-reaction and composer-emoji milestones defined in the prioritized chat section above.**
- [ ] **P1 — Add a compact stage-reaction button** with a small curated emoji tray; send reactions as validated ephemeral data-channel events and expire the stage animation locally.
- [ ] **P2 — Add GIF search and sending** as a structured `chat-gif` event using HTTPS provider/CDN URLs, bounded alt text, an allowlisted host policy, lazy-loaded previews, and a clear third-party privacy notice; do not proxy or persist GIFs in PairBeam.
- [ ] **P3 — Add a raised-hand signal** over the data channel with a persistent indicator until lowered or the participant leaves.
- [ ] **P1 — Test reaction expiry, reduced-motion rendering, emoji keyboard navigation, invalid payload rejection, duplicate delivery, and reconnect ordering.**
- [ ] **P3 — Add a laser pointer and temporary annotations** sent as data-channel events; do not persist them.
- [ ] **P3 — Add clipboard-safe room invite status and Web Share API support on mobile.**
- [ ] **P1 — Add a pre-call device preview and permission check before joining.**
- [ ] **P1 — Add accessibility testing** for keyboard-only use, screen readers, 200% zoom, and reduced motion.

## Engineering improvements discovered in the audit

- [x] Auto-dismiss transient media and Picture-in-Picture error banners while keeping blocking room errors persistent.
- [x] Consolidate duplicated data-channel message parsing into one handler.
- [x] Replace repeated transceiver identification by array position with explicit transceiver references.
- [x] Stop and close all media tracks and `AudioContext` instances when leaving.
- [x] Prevent rooms from accepting more than two peers and return an explicit “room full” message.
- [ ] **P0 — Validate signaling message shapes and room identifiers on both client and server.**
- [ ] **P0 — Add Playwright tests for join, dual share, share end, camera fallback, movie synchronization, and disconnect flows.**
- [x] Add unit tests for view-selection transitions.
- [x] Add unit tests for WebRTC statistics classification.
- [x] Add a signaling protocol test for room capacity, reconnection, and peer presence.
- [ ] **P0 — Add production security headers, an explicit CORS allowlist, and dependency update automation.**
- [x] Document the project-specific internship learning outcomes in [INTERNSHIP_REFLECTION.md](./INTERNSHIP_REFLECTION.md).

## Explicitly out of scope

- Accounts, profiles, call history, stored messages, recordings, and analytics requiring persistent identifiers.
- Server-side media recording or an SFU for group calls. Either would materially change the current private two-person P2P model.
