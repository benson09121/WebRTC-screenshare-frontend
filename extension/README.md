# PairBeam Vidking Sync Prototype

This unpacked Chrome extension lets PairBeam observe and control the ordinary video element inside a Vidking embed. It sends only playback events and commands (play, pause, seek, position) through PairBeam's existing WebRTC data channel. It does not discover, copy, proxy, download, or relay the provider's media URL.

## Install the downloaded extension

Both participants must install the extension.

1. Download `pairbeam-extension.zip` from PairBeam.
2. Extract the ZIP to a permanent folder. Do not delete that folder while using the extension.
3. Open `chrome://extensions` in Chrome.
4. Turn on **Developer mode**.
5. Choose **Load unpacked**.
6. Select the extracted `extension` folder containing `manifest.json`.
7. Reload the PairBeam tab.

Chrome may report `CRX_REQUIRED_PROOF_MISSING` for a privately packed `.crx`. PairBeam therefore does not offer direct CRX installation. The ZIP is source code for Chrome's documented **Load unpacked** workflow and does not attempt to install anything automatically.

For a custom production domain, add its exact HTTPS match pattern to the PairBeam entry in `manifest.json`, reload the extension, and reload PairBeam. The included patterns support localhost, `127.0.0.1`, and Vercel preview/production subdomains.

The download never includes `extension.pem` or a `.crx` package.

## Current scope

- Chrome/Chromium with Vidking movie and exact TV episode embeds is the supported experimental combination. PairBeam chooses the episode before loading the provider and disables Vidking's internal episode switching for synchronized sessions.
- Pointer and keyboard activity inside the cross-origin player is forwarded to PairBeam so its fullscreen controls can follow the same 3-second inactivity timer as the rest of the room UI.
- The person who proposes the title is the playback authority. The other participant's controls become requests that the authority applies and broadcasts back.
- Autoplay rules can require each participant to press play once.
- Vidking rejects iframe sandbox restrictions, so the embed cannot use the browser's sandbox attribute. While an accepted watch session is active, the extension closes new top-level targets created by provider subframes instead.
- Popup protection does not remove advertising rendered inside the player. PairBeam does not install broad network filters that could break video, subtitle, or quality requests.
- Player replacement and source changes caused by the provider's quality selector preserve the last requested paused/playing state and position when the browser permits it.
- Native timeline seeking pauses immediately, sends the target through the proposer authority, waits 900 ms for both players to settle on the paused timestamp, and resumes only when playback was running before the seek.
- Provider markup may change and require updating `vidking-player.js`.
- Vidsrc's nested and changing player origins are intentionally not included in this prototype.

Use the integration only with content and providers you are authorized to access. PairBeam does not remove provider ads, DRM, authentication, or access controls.
