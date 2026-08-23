#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
firefox_stage="$(mktemp -d)"
trap 'rm -rf "$firefox_stage"' EXIT

cd "$project_root"

zip -FS pairbeam-extension.zip \
  extension/manifest.json \
  extension/background.js \
  extension/pairbeam-bridge.js \
  extension/vidking-player.js \
  extension/README.md

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
