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
- **Condition:** When the user enters Fullscreen mode.
- **Behavior:** A dedicated top-bar appears with a "Chat" button. Clicking this reveals a glassmorphism Chat Overlay. The chat panel is accessible and fully functional without exiting Fullscreen mode.

## 8. Chat Notifications
- **Condition:** Triggers when a new message is received via the WebRTC DataChannel, but only if the Chat Panel is currently closed.
- **Behavior:** 
  - Generates a synthetic notification blip using the browser's native `AudioContext`.
  - Increments a notification badge on the floating chat button.
  - When the user opens the chat, the badge disappears and the counter resets.
