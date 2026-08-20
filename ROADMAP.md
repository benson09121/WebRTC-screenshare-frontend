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
- [x] Show actionable states: “CPU limited,” “network limited,” packet loss, and actual video quality.
- [x] Add signaling reconnection with bounded exponential backoff.
- [x] Show “participant left” and allow waiting for them to rejoin the same ephemeral room.
- [x] Surface whether the selected connection is direct or relayed through TURN.
- [ ] Configure production TURN credentials in the deployment environment.

## Next — screen-share experience

- [ ] Add an “Auto” quality mode that reacts to outgoing bitrate and encoder limitation reasons.
- [ ] Display the actual captured resolution and FPS after browser constraints are applied.
- [ ] Add a presentation mode that hides camera previews and nonessential controls.
- [ ] Add a fit/fill control and optional 100% pixel view for text-heavy shares.
- [ ] Add a short confirmation before replacing an existing local screen source.
- [ ] Add a clear system-audio state because browser and operating-system support varies.
- [ ] Add keyboard shortcuts for mute, camera, screen share, chat, and fullscreen.

## Requested focus — chatbox and fullscreen experience

> "Now I want you to fix the Chatbox as well as how the notifications perform and also how the chat works when they are full screen on screenshare... I want you make sure that the chat window is not being annoying on the viewer and they can still see the video or the screen that is being shared with ease.. Think of something okay.. Also on the create room.. I don't like the sparkling logo or that emoji.. It looks AI okay think of something for that... Now focous on the UI of the chatbox okay."

- [x] Replace the fullscreen overlay with a compact docked chat rail so the shared content remains visible; use a bottom sheet on narrow screens.
- [x] Add a quiet notification preview and unread count without automatically opening or obscuring the shared view.
- [x] Add an in-room sound preference with throttled, low-volume notification feedback; keep the preference ephemeral and database-free.
- [x] Support keyboard-first chat: focus management, Enter-to-send, Shift+Enter for a newline, Escape to close, and live announcements for new messages.
- [x] Keep message history in memory only and clear it when the room ends, reloads, or the participant leaves.
- [x] Replace the create-room sparkle/emoji treatment with a restrained product mark that matches the call UI.

## Later — collaboration without storage

- [ ] Add ephemeral reactions and a raised-hand signal over the data channel.
- [ ] Add a laser pointer and temporary annotations sent as data-channel events; do not persist them.
- [ ] Add clipboard-safe room invite status and Web Share API support on mobile.
- [ ] Add optional end-to-end call diagnostics export generated locally as JSON.
- [ ] Add a pre-call device preview and permission check before joining.
- [ ] Add accessibility testing for keyboard-only use, screen readers, 200% zoom, and reduced motion.

## Engineering improvements discovered in the audit

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

## Explicitly out of scope

- Accounts, profiles, call history, stored messages, recordings, and analytics requiring persistent identifiers.
- Server-side media recording or an SFU for group calls. Either would materially change the current private two-person P2P model.
