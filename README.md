# Peer Room frontend

A database-free, two-person WebRTC calling application with simultaneous screen sharing and ephemeral data-channel chat.

## Architecture

- React 19 and Vite
- Tailwind CSS v4
- Local shadcn-style components backed by Radix UI
- Direct WebRTC media and data channels
- WebSocket signaling only; the backend does not carry media
- No accounts, stored messages, call history, recordings, or database

Each participant has one audio transceiver, one camera-video transceiver, and one screen-video transceiver. Both participants can share simultaneously. Selecting `Participant`, `Their screen`, or `Your screen` changes only the local viewer layout.

The screen transceiver stays negotiated with a disabled placeholder track while sharing is off. Starting or stopping a share swaps that sender track without renegotiation, including when a participant begins sharing before the other peer joins.

## Local development

```bash
npm install
npm run dev
```

The frontend defaults to a signaling WebSocket at the current hostname on port `9080`. Start the backend separately from `../backend`.

## Environment variables

```dotenv
VITE_WS_URL=wss://your-signaling-host.example
VITE_TURN_URL=turn:your-turn-host.example:3478
VITE_TURN_USERNAME=ephemeral-or-deployment-username
VITE_TURN_PASSWORD=ephemeral-or-deployment-credential
```

TURN is optional for permissive networks but strongly recommended in production. The connection-health panel reports whether WebRTC selected a direct or relayed candidate path.

## Quality and diagnostics

Screen-sharing presets configure capture constraints and RTP bitrate ceilings. WebRTC can still adapt below those ceilings based on network and encoder conditions.

The in-call health panel samples `RTCPeerConnection.getStats()` every two seconds and shows:

- Round-trip time and interval packet loss
- Sending and receiving bitrate
- Actual encoded and decoded video dimensions/FPS
- Browser-reported CPU or bandwidth limitation
- Available outgoing bitrate when exposed by the browser
- Direct or TURN-relayed connection path

## Verification

```bash
npm test
npm run lint
npm run build
```

The backend has its own signaling protocol test:

```bash
cd ../backend
npm test
```

See [ROADMAP.md](./ROADMAP.md) for planned work and [ui_spec.md](./ui_spec.md) for interaction behavior.
