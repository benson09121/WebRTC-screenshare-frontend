# Fullscreen & UI Behavior Specifications

This document outlines the UI behaviors and conditions implemented.

## 1. User Avatar Placeholder
- **Condition:** Triggers when the user mutes their camera or when the connection is initializing and video tracks are not yet available.
- **Behavior:** Hides the black screen and renders a pulsing `User` icon inside a placeholder div.

## 2. Auto-hide Control Panel
- **Condition:** Triggers when the mouse is idle (no movement) for 3 seconds anywhere on the screen.
- **Behavior:** The entire Control Panel at the bottom elegantly fades out and translates downwards (`opacity-0 translate-y-8`). It instantly reappears upon any mouse movement. If the mouse is actively hovering over the Control Panel, it will remain visible regardless of the idle state.

## 3. Fullscreen Constraints
- **Condition:** The `Fullscreen` button (Maximize) is strictly conditionally rendered.
- **Behavior:** It only appears if there is an active screen share (either `hasRemoteScreen` or `hasLocalScreen`). If no one is sharing their screen, the Fullscreen button is completely hidden.

## 4. Local Screen Share Loopback
- **Condition:** When the user initiates a screen share.
- **Behavior:** The `mainStream` intelligently prioritizes the `localScreenStream`, meaning the user who is sharing their screen will actually see their own shared screen in the main view.

## 5. Draggable PIP Windows
- **Condition:** Always active for any PIP window (both Local Camera and Remote Camera).
- **Behavior:** Utilizes `framer-motion` for spring-physics-based dragging (`<motion.div drag>`). It is constrained to the bounding box of the browser window. It is also completely resizable via the `resize overflow-hidden` CSS property, allowing corner-dragging to scale the PIP.

## 6. Fullscreen Auto-hide (Global Idle State)
- **Condition:** Triggers 3 seconds after no mouse movement while in Fullscreen mode.
- **Behavior:** Hides the main Control Panel, the Fullscreen toggle buttons, the top Room Information bar, and all PIP windows. The screen becomes entirely devoted to the shared stream. Opening the Chat prevents the idle state from triggering.

## 7. Fullscreen Chat Accessibility
- **Condition:** The participant opens Chat while a screen share is fullscreen.
- **Behavior:** Chat opens as a narrow docked rail on wide screens, reserving layout space so it does not cover the shared content. On narrow screens it becomes a bounded bottom sheet. Closing Chat returns the shared view to its full available size.
- **Keyboard behavior:** The launcher and close control are keyboard reachable; `Enter` sends, `Shift+Enter` inserts a newline, `Escape` closes the panel, and new messages are announced through a polite live region.

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
- **Behavior:** A `Viewing` switch appears with `Participant`, `Their screen`, and `Your screen` when each source is available.
- **Media readiness:** A remote share is offered as a view only after its negotiated video stream exists; a status message alone never moves the viewer into a permanent loading screen.
- **Local choice:** Selecting a source changes only the current user's main view. It never changes the other participant's layout.
- **New local share:** Starting your own share selects `Your screen` so the selected source can be verified.
- **New remote share:** The remote share becomes the main view when the participant camera was selected. It does not interrupt another screen already being watched.

## 10. Screen Share End Fallback
- **Selected share ends:** Switch to the other active share when one exists.
- **Final share ends:** Switch to the participant camera view.
- **Camera unavailable or off:** Render the participant user-icon placeholder instead of retaining the final shared frame.
- **Remote cleanup:** Hide the remote screen immediately when `screen-toggle` reports that sharing stopped, while retaining its negotiated receiver track so a later share can resume without renegotiation or a stuck loading state.

## 11. Component System
- **Foundation:** Tailwind CSS v4 with local shadcn-style components backed by Radix UI primitives.
- **Current primitives:** Button, Textarea, Tabs, and Tooltip.
- **Accessibility:** Icon buttons have accessible names, tabs support keyboard navigation, controls use visible focus rings, and dynamic waiting/error states use live regions.

## 12. Connection Health
- **Sampling:** Collect standardized `RTCPeerConnection.getStats()` reports every two seconds while media is connected.
- **Summary:** Show round-trip time, interval packet loss, sending and receiving bitrate, actual video dimensions/FPS, available upload bandwidth, and direct/relay path.
- **Actionable states:** Browser `qualityLimitationReason` values produce specific CPU-limited or network-limited guidance.
- **Rendering:** Cumulative counters stay outside React state; only the summarized health snapshot updates the interface.

## 13. Signaling Recovery and Presence
- **Reconnect:** Retry WebSocket signaling with exponential delays starting at 500 ms and capped at 10 seconds.
- **Session identity:** Use an ephemeral per-page client ID so a reconnect replaces its stale socket instead of occupying another room slot.
- **Presence:** Explicitly represent waiting, joining, connected, reconnecting, and participant-left states.
- **Rejoin:** Keep the remaining participant in the room and negotiate a fresh peer connection when the other participant returns.
- **Capacity:** Reject a third participant with an inline room-full error.
