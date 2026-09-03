# PairBeam Watch Sync

This cross-browser MV3 extension lets PairBeam observe and control an ordinary video element inside a user-selected Vidking, Zoryva, 2Embed, or VidSrc.io embed on desktop Chrome/Chromium and Firefox. It sends only playback events and commands (play, pause, seek, position) through PairBeam's existing WebRTC data channel. It does not discover, copy, proxy, download, or relay the provider's media URL.

## Install the downloaded extension

Both participants must install the extension. PairBeam detects the current browser and offers the matching archive.

Multi-provider sessions require extension 0.5.1 or newer. PairBeam detects an older installed build and asks the user to download the current archive, reload the extension, and reload the room tab.

### Chrome, Edge, Opera, and Chromium

1. Download `pairbeam-extension.zip` from PairBeam.
2. Extract the ZIP to a permanent folder. The extracted folder must contain `manifest.json` directly. Do not delete that folder while using the extension.
3. Open `chrome://extensions` in Chrome.
4. Turn on **Developer mode**.
5. Choose **Load unpacked**.
6. Select the extracted folder containing `manifest.json`.
7. Reload the PairBeam tab.

Chrome may report `CRX_REQUIRED_PROOF_MISSING` for a privately packed `.crx`. PairBeam therefore does not offer direct CRX installation. The ZIP is source code for the browser's documented **Load unpacked** workflow and does not attempt to install anything automatically.

### Firefox

1. Download `pairbeam-firefox-extension.zip` from PairBeam and keep it intact.
2. Open `about:debugging#/runtime/this-firefox`.
3. Choose **Load Temporary Add-on**.
4. Select the downloaded ZIP itself. The Firefox package keeps `manifest.json` at the archive root.
5. Reload PairBeam.

Firefox removes a temporary add-on when the browser restarts. Standard Firefox requires Mozilla signing for permanent installation; this personal project does not silently weaken that browser security setting. Firefox Developer Edition, Nightly, and some ESR deployments provide separate advanced testing policies, but temporary loading is the documented default development workflow.

For a custom production domain, add its exact HTTPS match pattern to the PairBeam entry in `manifest.json`, reload the extension, and reload PairBeam. The included patterns support localhost, `127.0.0.1`, and Vercel preview/production subdomains.

The download never includes `extension.pem` or a `.crx` package.

## Current scope

- Desktop Chrome/Chromium and Firefox with Vidking, Zoryva, 2Embed, and VidSrc.io movie or exact-TV-episode embeds are the experimental combinations. PairBeam requires the provider choice before catalog search and includes it in the peer invitation.
- The shared bridge code is packaged with separate browser manifests: Chromium gets only `background.service_worker`, while Firefox gets only `background.scripts`. This avoids Chromium rejecting Firefox's background entry and keeps the runtime code audited in one place.
- If the extension is reloaded while PairBeam is already open, reload the PairBeam tab too. Existing content scripts belong to the old extension context and cannot reconnect themselves after Chrome invalidates that context.
- Pointer and keyboard activity inside the cross-origin player is forwarded to PairBeam so its fullscreen controls can follow the same 3-second inactivity timer as the rest of the room UI.
- The person who proposes the title is the playback authority. The other participant's controls become requests that the authority applies and broadcasts back.
- Autoplay rules can require each participant to press play once.
- Some providers reject iframe sandbox restrictions, so these embeds cannot use the browser's sandbox attribute. While an accepted watch session is active, the extension closes new top-level targets created by provider subframes instead.
- Popup protection does not remove advertising rendered inside the player. PairBeam does not install broad network filters that could break video, subtitle, or quality requests.
- Player replacement and source changes caused by the provider's quality selector preserve the last requested paused/playing state and position when the browser permits it.
- Native timeline seeking pauses immediately, sends the target through the proposer authority, waits 900 ms for both players to settle on the paused timestamp, and resumes only when playback was running before the seek.
- A provider frame registers with PairBeam only after it exposes a real video element. Wrapper frames cannot create a false player-ready state.
- Provider markup or nested hosts may change and require updating `vidking-player.js` and the exact manifest allowlist.
- VidSrc.io is the most fragile option because its internal player hostname can rotate. PairBeam intentionally does not request `<all_urls>`; an unrecognized host requires a reviewed extension update.

Use the integration only with content and providers you are authorized to access. PairBeam does not remove provider ads, DRM, authentication, or access controls.
