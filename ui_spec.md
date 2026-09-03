# Fullscreen & UI Behavior Specifications

This document outlines the UI behaviors and conditions implemented.

## 1. User Avatar Placeholder

- **Condition:** Triggers when the user mutes their camera or when the connection is initializing and video tracks are not yet available.
- **Behavior:** Hides the black screen and renders a pulsing `User` icon inside a placeholder div.

## 2. Auto-hide Control Panel

- **Condition:** Triggers after 3 seconds without pointer, click, or keyboard activity anywhere on the screen.
- **Behavior:** The dashboard may fade after three seconds of inactivity and returns on pointer, keyboard, or forwarded provider activity. The participant/content dock and Chat launcher remain reachable while idle, including in fullscreen. Only explicit focus mode hides the dock. There is no separate dashboard reveal handle. An already open chat stays open until the user closes it, and activity inside chat remains scoped to chat.

## 3. Fullscreen Constraints

- **Condition:** The `Fullscreen` button (Maximize) is strictly conditionally rendered.
- **Behavior:** It only appears if there is an active screen share (either `hasRemoteScreen` or `hasLocalScreen`). If no one is sharing their screen, the Fullscreen button is completely hidden.

## 4. Local Screen Share Loopback

- **Condition:** When the user initiates a screen share.
- **Behavior:** The `mainStream` intelligently prioritizes the `localScreenStream`, meaning the user who is sharing their screen will actually see their own shared screen in the main view.

## 5. Shared-Content Participant Dock

- **Condition:** Active below a selected local/remote screen, shared movie, or external watch provider whenever presentation mode is off.
- **Behavior:** Keeps labeled shared-content, `Participant`, and `You` tiles in a compact bottom dock that is visually separate from the selected content. Activating any tile focuses that source locally and marks it with a teal selected state; there is no duplicate view-switch toolbar. Camera-off tiles retain selectable avatar placeholders. Secondary actions live behind one ellipsis button per tile.
- **Focus control:** Keep one down-arrow at the trailing edge of the dock itself. It must not share the dashboard's bottom-center anchor. Focus mode hides the dock; a persistent restore arrow exits focus mode.
- **Reserved viewport:** While the dock is present, render native screen shares, uploaded/direct-link movies, focused cameras, and external provider iframes inside one shared-content viewport whose bottom edge clears both the dashboard and dock. Recalculate fitted movie dimensions from that viewport, not the full browser stage. Removing the dock in focus mode restores the full available stage.

## 6. Fullscreen Auto-hide (Global Idle State)

- **Condition:** Triggers 3 seconds after no mouse movement while in Fullscreen mode.
- **Behavior:** Hides the main Control Panel, Fullscreen controls, and top Room Information bar. The participant/content dock and Chat launcher remain visible while idle; only explicit focus mode hides the dock. An open chat remains interactive, but pointer movement and typing inside it do not wake the underlying media controls.

## 7. Fullscreen Chat Accessibility

- **Condition:** The participant opens Chat while a screen share is fullscreen.
- **Behavior:** Chat opens as a 340px docked rail on wide screens, reserving layout space so it does not cover shared content or camera tiles. On narrow screens it becomes a full-width right drawer over a dismissible scrim. Closing Chat returns the stage to its full available width.
- **Ordinary room:** The same responsive behavior applies to camera calls, native shared content, and external providers. During external-provider playback, the closed launcher sits at the right-center instead of covering the provider's bottom-right controls.
- **Keyboard behavior:** The launcher and close control are keyboard reachable; `Enter` sends, `Shift+Enter` inserts a newline, `Escape` closes the panel, and new messages are announced through a polite live region.
- **Replies:** A reply action selects one existing message, shows a cancellable composer preview, and sends only its validated message ID with the new message. Render a one-level quoted preview; activating it scrolls to and briefly highlights the original. If it is unavailable, show a restrained fallback. Reply state remains ephemeral and database-free.

## 8. Chat Notifications

- **Condition:** Triggers when a new message is received via the WebRTC DataChannel, but only if the Chat Panel is currently closed.
- **Behavior:**
  - Shows a compact, dismissible "New message" preview without exposing message text over a shared screen.
  - Increments a notification badge on the chat launcher without automatically opening the panel.
  - Optionally generates a throttled, low-volume synthetic blip using the browser's native `AudioContext`.
  - Provides a local sound on/off preference; no notification settings or messages are persisted.
  - When the user opens the chat, the badge disappears and the counter resets.

## 9. Simultaneous Screen Shares

- **Condition:** Either or both participants are sharing a screen.
- **Behavior:** Available sources appear as dock tiles for `Participant`, `You`, `Their screen/movie`, `Your screen/movie`, or the synchronized provider. Activating a tile makes it the main stage; the old `Viewing` switch is removed.
- **Media readiness:** A remote share is offered as a view only after its negotiated video stream exists; a status message alone never moves the viewer into a permanent loading screen.
- **Local choice:** Selecting a source changes only the current user's main view. It never changes the other participant's layout.
- **New local share:** Starting your own share selects `Your screen` so the selected source can be verified.
- **New remote share:** The remote share becomes the main view when the participant camera was selected. It does not interrupt another screen already being watched.

## 10. Screen Share End Fallback

- **Selected share ends:** Switch to the other active share when one exists.
- **Final share ends:** Switch to the participant camera view.
- **Camera unavailable or off:** Render the participant user-icon placeholder instead of retaining the final shared frame.
- **Remote cleanup:** Hide the remote screen immediately when `screen-toggle` reports that sharing stopped, while retaining its negotiated receiver track so a later share can resume without renegotiation or a stuck loading state.
- **Playback volume:** Keep participant microphone playback separate from shared-content playback. Place the local-only participant voice slider in the microphone arrow menu, shared-screen audio in the screen-share arrow menu, and shared-movie audio beside the movie timeline. The host and viewer can choose different movie levels; volume is never sent as a shared playback command. On the host, media-element volume changes local monitoring but does not change the level of the captured audio track. Values remain in memory and reset when the room ends or the page reloads.
- **Scoped settings:** Use compact, keyboard-accessible popovers anchored to down-arrow buttons beside microphone, camera, and screen share. The camera menu owns camera selection; microphone owns input selection and participant voice; screen share owns quality, content type, outgoing desktop-audio source, incoming screen volume, and collapsible live metrics. Do not render a global settings panel over the stage.
- **Shared movie player:** Render the same branded player controls for the host and viewer. Either participant can request play, pause, seek, subtitle visibility, or an available audio-track change; the browser holding the source remains the timeline authority and publishes the resulting state.
- **Subtitles:** External SRT files remain on the host device. The host may load or replace an SRT before or during playback. Parse cues locally, send only the currently active cue over the data channel, and render it as inert text over both movie views. When the source browser exposes embedded text tracks, either participant may choose one during playback; the host applies the shared selection and publishes the resulting cue. A UI player must not claim embedded MKV support when the browser did not demux those tracks.

## 11. Component System

- **Foundation:** Tailwind CSS v4 with local shadcn-style components backed by Radix UI primitives.
- **Current primitives:** Button, Input, Textarea, Tabs, Tooltip, and Popover, all backed by semantic canvas, panel, foreground, muted, border, primary, destructive, and focus tokens. Stage sizing and per-tile actions use compact Popovers instead of adding another persistent toolbar.
- **Accessibility:** Icon buttons have accessible names, tabs support keyboard navigation, controls use visible focus rings, and dynamic waiting/error states use live regions.

## 12. Connection Health

- **Sampling:** Collect standardized `RTCPeerConnection.getStats()` reports every two seconds while media is connected.
- **Summary:** Show round-trip time, interval packet loss, sending and receiving bitrate, actual video dimensions/FPS, available upload bandwidth, and direct/relay path.
- **Actionable states:** Packet loss and round-trip time determine transport health. Browser `qualityLimitationReason` values are displayed separately as device/CPU, upload-bandwidth, or other video adaptation so local encoder pressure is not mislabeled as a failing connection.
- **Rendering:** Cumulative counters stay outside React state; only the summarized health snapshot updates the interface.
- **Dashboard indicator:** Render connection health inside the call dashboard as three ascending bars: three green for good, two amber for limited, one red for poor, and gray pulsing bars while measuring. Activating the bars opens the full metrics Popover.

## 13. Signaling Recovery and Presence

- **Reconnect:** Retry WebSocket signaling with exponential delays starting at 500 ms and capped at 10 seconds.
- **Session identity:** Use an ephemeral per-page client ID so a reconnect replaces its stale socket instead of occupying another room slot.
- **Presence:** Explicitly represent waiting, joining, connected, reconnecting, and participant-left states.
- **Rejoin:** Keep the remaining participant in the room and negotiate a fresh peer connection when the other participant returns.
- **Capacity:** Reject a third participant with an inline room-full error.

## 14. Desktop Picture-in-Picture

- **Availability:** Render the desktop PiP control only when the browser exposes `document.pictureInPictureEnabled` and `HTMLVideoElement.requestPictureInPicture()`.
- **Sources:** The active main video, the participant camera preview, and the local camera preview can each be opened as the single browser-managed PiP video.
- **Desktop behavior:** The browser and operating-system window manager create and position the floating window outside PairBeam. PairBeam cannot force arbitrary application windows to stay on top.
- **Failure state:** If the video is not ready or the browser rejects the request, keep the call unchanged and show an inline, accessible error.

## 15. Screen-Share Audio

- **Capture request:** Ask the browser for screen/window audio through top-level `systemAudio` and `windowAudio` hints. The selected surface and browser decide whether an audio track is returned.
- **Mute independence:** Rebuild the outgoing microphone/screen mix whenever the microphone is muted, enabled, or changed. Muting the microphone must not remove a live screen-audio track from the sender.
- **Linux fallback:** When the browser exposes a non-virtual PipeWire/PulseAudio physical-output monitor as an audio input, allow the user to select it explicitly. Do not select or capture a monitor without user action.
- **Status:** Report whether audio came from the browser share, a selected monitor, or was unavailable while video sharing continues.
- **Cleanup:** Stop monitor/display tracks and close the mixing `AudioContext` when sharing or the call ends.

## 16. Adaptive Screen Quality

- **Default:** New shares use Auto quality. Motion starts at 720p60; text/detail starts at 1080p20.
- **Content-aware order:** Under sustained pressure, motion shares reduce resolution before frame rate. Text/detail shares reduce frame rate before resolution to preserve readable text.
- **Feedback loop:** Sample only the screen `RTCRtpSender` every two seconds. CPU, bandwidth, and other browser limitation reasons drive adaptation; constrained outgoing bitrate makes a bandwidth downgrade happen sooner.
- **Hysteresis:** Require repeated limited samples before stepping down, wait at least ten seconds between changes, and require eight healthy samples before stepping up. A single sample never changes quality.
- **Live changes:** Changing Auto/manual quality or content type while sharing applies new track constraints and sender parameters without restarting the share picker.
- **Truthful metrics:** Show the track's configured capture dimensions/FPS from `getSettings()` separately from the sender's actual encoded dimensions/FPS and outgoing bitrate from `getStats()`.
- **Compatibility:** If capture constraints are rejected, keep sharing and use sender scaling/bitrate limits when supported rather than ending the share.

## 17. Presentation and Screen Sizing

- **Availability:** Presentation mode and screen-sizing controls appear only while a local or remote screen is selected as the main view.
- **Presentation mode:** A compact down-arrow above the dock hides the room header, dock, bottom call controls, and secondary video actions. Keep room chat available and retain an up-arrow restore control that never becomes noninteractive.
- **Share end:** If the selected screen ends and the view falls back to the participant camera, presentation mode exits automatically.
- **Chat:** In presentation mode, use the same responsive chat behavior as fullscreen: a docked rail that reserves stage width on larger screens and a full-width right drawer on narrow screens.
- **Escape priority:** When chat is open, Escape closes chat first. When chat is closed, Escape exits presentation mode. Browser fullscreen remains controlled by the browser's fullscreen behavior.
- **Fit:** Preserve the source's natural display aspect ratio so the complete shared surface remains visible with symmetrical black letterboxing or pillarboxing.
- **Crop:** Use `object-cover` only when the user explicitly chooses to fill the stage; edges may be cropped when aspect ratios differ.
- **100%:** Render the video at its decoded intrinsic dimensions with no CSS downscaling. Place it in a two-axis scrollable viewport so oversized screens can be panned without clipping inaccessible edges.
- **Shared-content background:** Screen shares and shared movies use true black (`#000`) behind the media in normal, presentation, and fullscreen modes.
- **Source changes:** Reset sizing to Fit when the selected local/remote source changes or no screen remains.
- **Accessibility:** Use keyboard-operable menu actions for sizing, `aria-pressed` on selected media tiles, visible focus rings, and a polite live region for mode changes.

## 18. Error Banner Lifetime

- **Transient errors:** Media-device, screen-share, and Picture-in-Picture errors remain visible for seven seconds and then dismiss automatically.
- **Repeated errors:** A newly reported error restarts the full seven-second timer, including when its message matches the current error.
- **Manual dismissal:** Every transient error banner includes a keyboard-accessible close button with an accessible name.
- **Cleanup:** Clear pending dismissal timers when their owning component unmounts so a timer cannot update removed call UI.
- **Blocking errors:** Room-capacity and join failures remain visible until the user retries or navigation changes because the underlying action did not succeed.

## 19. Watch Together

- **Entry:** A dedicated film control opens a compact source chooser for either a local video file or a direct browser-playable HTTP(S) media URL. Local files are never uploaded to signaling or persisted.
- **Direct links:** Validate through the same hidden media player before offering Start movie. Reject URL-embedded usernames and passwords. First request anonymous CORS playback so the host can capture and relay one decoded stream through WebRTC. If CORS capture fails but ordinary media playback succeeds, use synchronized direct mode: send the exact URL only over the encrypted peer data channel, let both browsers fetch it, and synchronize playback state and controls. Never send the URL to signaling or persist it. Clearly disclose that query parameters, including signed access tokens, are visible to the participant in direct mode.
- **Provider pages:** YouTube, Netflix, and ordinary webpage links are not direct media sources. Explain this distinction and direct the user to browser-tab sharing with audio.
- **Preparation:** Show the movie name and duration with an explicit Start movie action. Starting while another local source is active is an explicit Replace share action.
- **Transport:** Relay mode captures a compatible media element into the existing shared-content video sender and dedicated shared-content audio sender. Synchronized direct mode sends no movie media through WebRTC; each browser downloads the source URL independently. Camera and microphone remain separate in both modes.
- **Playback:** Both participants use the shared player. Commands travel through the peer data channel; the source owner remains the timeline authority and publishes the resulting state. In synchronized direct mode, the receiving player corrects meaningful drift while avoiding constant seek jitter.
- **Source selection:** Existing local view choice remains authoritative. Labels become Your movie or Their movie when the corresponding shared source is a local file.
- **End behavior:** Reaching the end, stopping, replacing the movie, or leaving stops captured tracks, revokes the object URL, clears file metadata, and returns affected viewers through the existing share fallback rules.
- **Quality:** Auto uses movie-specific 24/30fps profiles. Manual screen presets remain available, but the source frame rate remains browser and file dependent.
- **Compatibility:** Feature-detect `captureStream()`/`mozCaptureStream()`. When unavailable or the codec cannot be decoded, show an actionable transient error suggesting current Chrome/Firefox or browser-tab sharing with audio.

## 20. Frontend-only TMDB catalog

- **Architecture:** The browser calls TMDB directly. PairBeam exposes no catalog route, stores no catalog response, and adds no catalog database.
- **Authentication:** Read `VITE_TMDB_READ_ACCESS_TOKEN` at build time and send it as a TMDB application Bearer token. Treat it as a public, restricted, replaceable client credential because Vite embeds it in the shipped JavaScript; never use a TMDB user/session token.
- **Search:** Debounce input by 300 ms, cancel superseded requests, exclude person results, and distinguish initial, loading, empty, invalid-token, rate-limit, and upstream/offline states.
- **Metadata:** Normalize movie and TV fields into one local shape. Label `vote_average` as a TMDB rating, preserve movie/series identity, and browse TV seasons and episodes without claiming playback availability.
- **Series selection:** On desktop, keep seasons in a left navigation rail and episodes in a scrollable detail list. On mobile, open seasons in a focus-managed bottom Sheet. Every episode shows its exact S/E code and available still, title, runtime, air date, overview, and TMDB rating, with an explicit Watch episode action.
- **Active-series drawer:** During TV playback, keep a compact arrow on the left edge. It opens a modal left Sheet with the current episode, horizontally scrollable seasons, and a keyboard-accessible episode list. Focus stays inside while open, Escape closes it, focus returns to the arrow, and reduced-motion preferences reduce the transition to a near-instant state change.
- **Playback boundary:** Selecting a result prepares metadata only. It must not create a provider frame, fetch a movie stream, or tell the peer that the title is playable. A future approved provider requires the proposal, consent, rights, and bidirectional-control gates in the roadmap.
- **Bundle behavior:** Lazy-load the catalog surface when the user opens Browse catalog so discovery UI does not enlarge the initial call-control path.

## 21. External watch-provider gate

- **Required contract:** A production provider adapter must declare one exact HTTPS origin, production approval, readiness/state/time/duration capabilities, inbound play/pause/seek capabilities, and the `buildEmbedUrl`, `load`, `play`, `pause`, `seek`, `subscribe`, and `destroy` lifecycle methods.
- **Current result:** Cross-origin providers are not reliably controllable from an ordinary PairBeam page, so the experimental cross-browser MV3 extension supplies the local player bridge after explicit installation and viewer consent. The provider-first picker supports Vidking, Zoryva, 2Embed, and VidSrc.io. One bridge codebase is packaged with separate manifests: desktop Chrome/Chromium receives only its service-worker entry, and Firefox receives only its event-page background entry. Exact provider/player origins are allowlisted; VidSrc.io can fail closed if its internal hostname rotates.
- **Missing or stale extension:** Disable invitation acceptance and auto-detect the current browser locally. The content bridge announces installation immediately instead of waiting for the Chromium MV3 worker, and the UI shows a short checking state before install guidance. Both browser ZIPs keep `manifest.json` at the archive root. Firefox uses **Load Temporary Add-on** on the ZIP; Chrome-family browsers extract it and select the folder containing `manifest.json` through **Load unpacked**. If an installed extension context is invalidated, offer a one-click room reload rather than another install prompt. Never distribute a `.crx` or expose a `.pem` signing key.
- **Fullscreen:** Use PairBeam-level fullscreen for the external stage so PairBeam chat, episode navigation, the participant dock, and call controls remain available. The cross-origin provider iframe is not granted native fullscreen permission because browser top-layer isolation would hide sibling controls. The dashboard fades directly and returns with activity; it has no reveal handle. Participant/content tiles and the Chat launcher remain visible until the user explicitly enters focus mode. Radix portals mount inside the active fullscreen element so dialogs remain visible and keyboard accessible.
- **Interaction motion:** Use a consistent fast motion language across room surfaces. Chat and compact pickers use opacity plus a short translate/scale settle; centered catalog dialogs pair a fading backdrop with a restrained scale/vertical overshoot; side and bottom episode Sheets slide from their physical edge with a subtle final settle; settings Popovers scale from the Radix trigger origin. Entrances may take 190–280 ms, exits 100–190 ms, and paired surfaces share timing. Animate only transform and opacity, keep keyboard navigation immediate, and reduce transform motion to a near-instant state change under `prefers-reduced-motion`.
- **Catalog behavior:** Catalog metadata never claims playback availability. Before search is enabled, the user must choose a provider. Starting the prototype requires the extension-specific proposal and peer consent before loading that provider.
- **Episode identity:** A TV proposal is invalid without a supported provider ID plus positive season and episode numbers. The proposal also carries a bounded episode title for display, and both participants derive the same provider-specific episode URL locally.
- **Episode changes:** Either participant may select another episode. A non-authority sends a bounded request; the proposer authority increments and broadcasts the media revision. Playback commands and state must match that revision so events from the replaced episode cannot affect the new player.
- **Signaling recovery:** Keep an accepted provider iframe mounted when the signaling WebSocket reconnects, the in-memory signaling room is reconstructed, the peer temporarily leaves, or WebRTC receives a replacement offer. Rebuild only the peer transport. When the replacement data channel opens, exchange a validated session/media/playback snapshot and reconcile to the authority's latest clock. Only explicit **Stop watching** or room exit removes locally active external playback.
- **No reload synchronization:** Do not emulate play/pause/seek by recreating an iframe with a timestamp. Reloading destroys buffer and subtitle state, can fail browser autoplay checks, and cannot provide a stable shared clock.
- **Future activation:** Only an authorized provider that passes the adapter validation may proceed to viewer consent, sandbox/CSP isolation, exact-origin message validation, and the two-peer authoritative playback clock.
