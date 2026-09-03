#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
chromium_stage="$(mktemp -d)"
firefox_stage="$(mktemp -d)"
trap 'rm -rf "$chromium_stage" "$firefox_stage"' EXIT

cd "$project_root"

cp extension/manifest.json "$chromium_stage/manifest.json"
cp extension/background.js "$chromium_stage/background.js"
cp extension/pairbeam-bridge.js "$chromium_stage/pairbeam-bridge.js"
cp extension/vidking-player.js "$chromium_stage/vidking-player.js"
cp extension/README.md "$chromium_stage/README.md"

(
  cd "$chromium_stage"
  zip -FS "$project_root/pairbeam-extension.zip" \
    manifest.json \
    background.js \
    pairbeam-bridge.js \
    vidking-player.js \
    README.md
)

cp extension/background.js "$firefox_stage/background.js"
cp extension/pairbeam-bridge.js "$firefox_stage/pairbeam-bridge.js"
cp extension/vidking-player.js "$firefox_stage/vidking-player.js"
cp extension/README.md "$firefox_stage/README.md"
cp extension/manifest.firefox.json "$firefox_stage/manifest.json"

npx --yes web-ext lint --source-dir "$firefox_stage"
npx --yes web-ext build \
  --source-dir "$firefox_stage" \
  --artifacts-dir "$project_root" \
  --filename pairbeam-firefox-extension.zip \
  --overwrite-dest
