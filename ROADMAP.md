# Product roadmap

This roadmap keeps the product database-free. Rooms remain ephemeral, signaling only coordinates WebRTC peers, chat uses the data channel, and no call content is stored on the server.

## Product rules

- A room supports two participants.
- Either participant can share a screen, including at the same time.
- Choosing a main view is local UI state. It does not force the other participant to change their view.
- When the selected share ends, the viewer falls back to the other active share. If no share remains, the participant camera or avatar becomes the main view.
- Refreshing or leaving clears call and chat state.

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
- [ ] Configure production TURN credentials in the deployment environment.

## Investigation — reconnecting, ICE routing, and endpoint load

### Why “Establishing the private connection” could remain visible

- [x] Fix signaling reconnects being treated as a full peer leave/join. A brief WebSocket loss now reserves the same in-memory room seat for five seconds and does not tear down a healthy direct media path.
- [x] Fix delayed `closed` or `failed` events from an old `RTCPeerConnection` clearing the newer connection state.
- [x] Await and report call-start failures instead of leaving an unhandled offer failure in the joining state.
- [x] Make optional `RTCRtpSender.setStreams()` association non-fatal so a browser-specific exception cannot prevent the answer from being sent.
- [x] Guard answer/candidate work against a peer connection that was replaced while asynchronous negotiation was running.
- [x] Clear an obsolete WebSocket message handler when signaling reconnects.
- [ ] Add a negotiation generation ID to offers, answers, and candidates to reject every late message from an older negotiation.
- [ ] Add a two-browser Playwright reconnect test covering signaling-only loss, transient ICE loss, ICE failure, and a real peer departure.

### Does a nearer STUN or TURN server make it faster?

- The reported sample—direct UDP, 8 ms round trip, and 0% packet loss—already has a healthy direct transport. STUN helps discover candidates during setup and is not in the ongoing media path. TURN carries media only when direct connectivity fails, so changing TURN cannot improve that direct call.
- [x] Keep trickle ICE enabled by forwarding each candidate as it becomes available instead of waiting for gathering to complete.
- [x] Accept comma-separated STUN and TURN URLs so production can provide regional endpoints plus UDP and TCP/TLS fallbacks.
- [ ] Provision geographically distributed TURN endpoints and select them through latency-aware DNS, Anycast, or deployment-region configuration.
- [ ] Use short-lived TURN credentials and monitor direct-versus-relay success rates without storing call content or persistent user identities.
- A browser does not guarantee that ordering several TURN URLs makes it choose the geographically nearest server. Production locality should be handled by the TURN provider or deployment routing.

### Is camera plus screen or movie sharing heavy for P2P?

- Yes. Each active sender captures and encodes camera plus shared content, uploads both streams, and simultaneously downloads, decodes, and renders the other participant's streams. If both participants run on one PC, that one device performs both sides of the workload and is not a representative performance test.
- Direct P2P avoids a media server but does not remove endpoint encoding and decoding cost. A TURN relay changes the network path, not the browser's capture/codec workload.
- The reported 640 × 360 at 7 fps alongside 8 ms RTT and 0% loss is consistent with browser encoder adaptation, not slow ICE negotiation. `availableOutgoingBitrate` is an estimate and `qualityLimitationReason: bandwidth` can coexist with healthy packet-loss/latency metrics.
- [x] Use a 24/30fps movie profile and Auto quality rather than encoding film content at 60fps.
- [ ] Add per-outbound-stream diagnostics so camera and shared-content limitations are identified independently.
- [ ] Add a pre-call performance hint when both room participants are detected on the same device during local testing.

References: [WebRTC statistics](https://www.w3.org/TR/webrtc-stats/), [ICE restart](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/restartIce), [WebRTC peer connections and trickle ICE](https://webrtc.org/getting-started/peer-connections), and [TURN server guidance](https://webrtc.org/getting-started/turn-server).

## Next — screen-share experience

- [x] Add an “Auto” quality mode that reacts to outgoing bitrate and encoder limitation reasons.
- [x] Display the actual captured and encoded resolution, FPS, and outgoing bitrate after browser constraints are applied.
- [x] Add a presentation mode that hides camera previews and nonessential controls while keeping chat and a clear exit available.
- [x] Add fit/fill controls and a scrollable 100% pixel view for text-heavy shares.
- [ ] Add a short confirmation before replacing an existing local screen source.
- [x] Add a clear system-audio state because browser and operating-system support varies.
- [ ] Add keyboard shortcuts for mute, camera, screen share, chat, and fullscreen.

## Investigation — connection limits, desktop video, and Linux audio

### “Connection limited”

- WebRTC's `qualityLimitationReason` describes the outbound encoder reducing resolution or frame rate because of `cpu`, `bandwidth`, or `other`; it is not, by itself, proof that the peer connection is failing. See the [W3C WebRTC statistics definition](https://w3c.github.io/webrtc-stats/#dom-rtcoutboundrtpstreamstats-qualitylimitationreason).
- Testing both participants on one PC can create legitimate CPU/GPU pressure because that machine captures, encodes, decodes, and renders both ends. Test again on two physical devices before treating a same-PC CPU warning as a production-network defect.
- Packet loss and round-trip time remain the transport-health inputs. Encoder pressure is now displayed as a separate, specific warning.
- [ ] Add health-indicator quality-warning hysteresis so a transient browser limitation does not make the global status flicker.
- [x] Implement the planned Auto preset: reduce frame rate first for text/detail shares and resolution first for motion shares when limitations persist.
- [x] Add separate Auto-quality hysteresis so a single two-second sample cannot change the selected encoding profile.
- Auto waits for sustained encoder pressure before stepping down, reacts faster when bandwidth pressure also produces constrained outgoing bitrate, and requires a longer healthy period before stepping back up.
- [ ] Add a locally generated diagnostics export with codec, encoder, candidate path, and limitation-duration counters.

### Picture-in-Picture

- The standard video Picture-in-Picture API creates a browser-managed floating video window outside the page and requires a user click. Support is browser-dependent; see [MDN's Picture-in-Picture API documentation](https://developer.mozilla.org/en-US/docs/Web/API/Picture-in-Picture_API).
- PairBeam now exposes PiP on the main video, the participant camera shown over a shared screen, and the local camera preview when the browser supports `requestPictureInPicture()`.
- A website cannot force a normal arbitrary window to remain above every desktop application. The browser/desktop window manager owns the PiP surface and its always-on-top behavior.
- [ ] Verify the native Firefox PiP affordance and Safari behavior, where the standard programmable button may be unavailable.
- [ ] Evaluate Document Picture-in-Picture only if controls or chat are later required inside the floating window; keep standard video PiP as the compatibility path.

### Linux screen-share audio

- `getDisplayMedia({ audio: true })` returns audio only when the chosen surface, browser, and operating system support it. `systemAudio` and `windowAudio` are hints; the browser picker and user permission remain authoritative. See [MDN's `getDisplayMedia()` reference](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia).
- Chromium added the `windowAudio` option in Chrome 141, but support remains partial and does not guarantee per-application capture on every Linux setup. See the [Chrome 141 release notes](https://developer.chrome.com/release-notes/141#windowaudio_for_getdisplaymedia).
- Chromium contains a Linux `PulseaudioLoopbackForScreenShare` feature, but it is disabled by default in current source. When enabled by the user, it can expose system loopback capture without installing a virtual-cable application. See [Chromium's media feature definition](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/media/base/media_switches.cc).
- No-virtual-cable Chrome test path: enable `chrome://flags/#pulseaudio-loopback-for-screen-share`, relaunch Chrome, start a share, and enable audio in the browser picker. If the picker still returns video only, PairBeam can use a physical-output `Monitor` source exposed in call settings.
- PipeWire/PulseAudio often exposes physical output monitors as audio inputs. PairBeam can now use a selected monitor source if the browser exposes it. This can capture the entire output, including the other participant, so echo is possible.
- A community implementation has successfully used Linux monitor sources and browser-side track replacement, but application-only routing still requires PipeWire/PulseAudio routing or a browser-native window-audio implementation. See [Screenshare with audio on Linux](https://github.com/edisionnano/Screenshare-with-audio-on-Discord-with-Linux).
- [ ] Validate native tab audio, whole-desktop audio, and the monitor fallback on Chrome/Chromium under both Wayland and X11.
- [x] Add an echo-risk warning when a full-output monitor source is selected.
- [x] Move shared-content audio to a dedicated WebRTC transceiver so microphone mute/switching and shared audio use independent senders.

## Now — Watch Together

- [x] Let either participant choose a local movie without uploading it to PairBeam or storing it in a database.
- [x] Support direct browser-playable media URLs without sending the URL through signaling or storing it in PairBeam.
- [x] Validate direct links, require HTTP(S), reject known video-page providers, and enforce a load timeout.
- [x] Try one-download host capture/WebRTC relay when media CORS permits it; otherwise fall back to synchronized direct playback where the exact URL is sent over the encrypted peer data channel and both participants fetch it.
- [x] Reject direct URLs containing embedded usernames or passwords, and disclose that query-string tokens are shared with the participant in synchronized direct mode.
- [ ] Add a viewer-side Accept/Decline confirmation before the browser requests a peer-supplied synchronized direct URL.
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
- [x] Detect and switch native audio tracks when the browser exposes `HTMLMediaElement.audioTracks`.
- [x] Preserve a movie's native display aspect ratio through capture, WebRTC downscaling, Fit mode, and fullscreen; use a true-black shared-content stage for correct letterboxing.
- [ ] Add an invitation with Accept/Decline before the host begins sending a movie.
- [x] Add independent local receiver-volume controls for participant voice, shared-screen audio, and shared-movie audio.
- [ ] Add a “we both have this file” mode that fingerprints local files and synchronizes controls without sending movie media.
- [ ] Research chunked RTCDataChannel + Media Source Extensions transfer only if one-copy, original-quality buffered playback becomes a product requirement.
- [ ] Add Playwright coverage with mocked media-element capture plus two-device Chrome and Firefox compatibility testing.

### Player and MKV investigation

- Vidstack is the preferred mature React player layer for browser-compatible media. It supports MediaStream sources, accessible controls, and external VTT/SRT/SSA captions, but its local audio-track API still depends on the underlying provider/browser and it does not add arbitrary MKV codec decoding.
- Shaka Player is optimized for DASH/HLS and browser-supported MP4/WebM. It supports UTF-8 SRT, WebVTT, TTML, and adaptive-stream audio tracks, but is not a general local MKV decoder.
- Experimental WebCodecs/WASM engines such as Movi Player can demux MKV and expose multiple audio/subtitle tracks, but add roughly 2–3 MB compressed plus significant decoding load. Their canvas/Web Audio output must be integrated into a capturable `MediaStream` before PairBeam can reliably send it to the peer.
- [ ] Prototype a lazily loaded WebCodecs/WASM MKV engine behind capability detection, including canvas capture, Web Audio capture, track switching, cancellation, memory limits, and fallback when a codec cannot be decoded.
- [ ] Extract text-based embedded MKV subtitle tracks (SRT/SSA/ASS) in that engine and render the selected cue in PairBeam; image-based PGS/VobSub subtitles require a separate renderer.
- [ ] Benchmark a 1080p HEVC MKV on low-, mid-, and high-tier devices while simultaneously encoding WebRTC video before enabling the fallback in production.
- Until that prototype passes the workload tests, a UI player library alone must not claim that an MKV is playable. Browser-compatible MP4 (H.264/AAC) and WebM remain the supported sharing inputs.

Research: [Vidstack player features](https://vidstack.io/docs/player/), [Vidstack source and track support](https://vidstack.io/docs/player/core-concepts/loading/), [Shaka container/subtitle support](https://github.com/shaka-project/shaka-player/blob/main/README.md#media-container-and-subtitle-support), and [WebCodecs](https://github.com/w3c/webcodecs).

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
- [x] Keep fullscreen and presentation controls idle while the pointer or keyboard is being used inside the open chat panel.

## Later — collaboration without storage

- [ ] Add a compact reaction button to the call controls with a small curated emoji tray; send reactions as validated ephemeral data-channel events and expire the stage animation locally.
- [ ] Add an emoji picker beside the chat composer that inserts Unicode into the existing text draft without changing the signaling protocol or storing picker history.
- [ ] Add GIF search and sending as a structured `chat-gif` event using HTTPS provider/CDN URLs, bounded alt text, an allowlisted host policy, lazy-loaded previews, and a clear third-party privacy notice; do not proxy or persist GIFs in PairBeam.
- [ ] Add a raised-hand signal over the data channel with a persistent indicator until lowered or the participant leaves.
- [ ] Test reaction expiry, reduced-motion rendering, emoji keyboard navigation, invalid GIF payload rejection, and GIF provider/network failure states.
- [ ] Add a laser pointer and temporary annotations sent as data-channel events; do not persist them.
- [ ] Add clipboard-safe room invite status and Web Share API support on mobile.
- [ ] Add optional end-to-end call diagnostics export generated locally as JSON.
- [ ] Add a pre-call device preview and permission check before joining.
- [ ] Add accessibility testing for keyboard-only use, screen readers, 200% zoom, and reduced motion.

## Engineering improvements discovered in the audit

- [x] Auto-dismiss transient media and Picture-in-Picture error banners while keeping blocking room errors persistent.
- [x] Consolidate duplicated data-channel message parsing into one handler.
- [x] Replace repeated transceiver identification by array position with explicit transceiver references.
- [x] Stop and close all media tracks and `AudioContext` instances when leaving.
- [x] Prevent rooms from accepting more than two peers and return an explicit “room full” message.
- Validate signaling message shapes and room identifiers on both client and server.
- Add Playwright tests for join, dual share, share end, camera fallback, and disconnect flows.
- [x] Add unit tests for view-selection transitions.
- [x] Add unit tests for WebRTC statistics classification.
- [x] Add a signaling protocol test for room capacity, reconnection, and peer presence.
- Add production security headers, an explicit CORS allowlist, and dependency update automation.
- [x] Document the project-specific internship learning outcomes in [INTERNSHIP_REFLECTION.md](./INTERNSHIP_REFLECTION.md).

## Explicitly out of scope

- Accounts, profiles, call history, stored messages, recordings, and analytics requiring persistent identifiers.
- Server-side media recording or an SFU for group calls. Either would materially change the current private two-person P2P model.
