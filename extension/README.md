# PairBeam Vidking Sync Prototype

This packed Chrome extension lets PairBeam observe and control the ordinary video element inside a Vidking embed. It sends only playback events and commands (play, pause, seek, position) through PairBeam's existing WebRTC data channel. It does not discover, copy, proxy, download, or relay the provider's media URL.

## Install the packaged extension

Both participants must install the extension.

1. Download `pairbeam-extension.crx` from PairBeam.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Drag the downloaded `.crx` onto the extensions page and confirm.
5. Reload the PairBeam tab.

If Chrome rejects a directly installed `.crx`, use the unpacked fallback:

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode**.
3. Choose **Load unpacked**.
4. Select this `frontend/extension` directory.
5. Reload the PairBeam tab after installing or updating the extension.

For a custom production domain, add its exact HTTPS match pattern to the PairBeam entry in `manifest.json`, reload the extension, and reload PairBeam. The included patterns support localhost, `127.0.0.1`, and Vercel preview/production subdomains.

Keep `extension.pem` private. It is the owner's signing key for repacking the same extension identity and is not an installation file.

## Current scope

- Chrome/Chromium with Vidking movie and exact TV episode embeds is the supported experimental combination. PairBeam chooses the episode before loading the provider and disables Vidking's internal episode switching for synchronized sessions.
- The person who proposes the title is the playback authority. The other participant's controls become requests that the authority applies and broadcasts back.
- Autoplay rules can require each participant to press play once.
- Vidking rejects iframe sandbox restrictions, so the embed cannot use the browser's sandbox attribute. While an accepted watch session is active, the extension closes new top-level targets created by provider subframes instead.
- Popup protection does not remove advertising rendered inside the player. PairBeam does not install broad network filters that could break video, subtitle, or quality requests.
- Player replacement and source changes caused by the provider's quality selector preserve the last requested paused/playing state and position when the browser permits it.
- Native timeline seeking pauses immediately, sends the target through the proposer authority, waits 900 ms for both players to settle on the paused timestamp, and resumes only when playback was running before the seek.
- Provider markup may change and require updating `vidking-player.js`.
- Vidsrc's nested and changing player origins are intentionally not included in this prototype.

Use the integration only with content and providers you are authorized to access. PairBeam does not remove provider ads, DRM, authentication, or access controls.
