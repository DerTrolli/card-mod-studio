#!/usr/bin/env bash
# One-shot setup + run for the Card-Mod Studio sandbox.
# Builds the plugin, fetches card-mod, starts a real Home Assistant in Docker,
# completes onboarding headlessly, then runs the support-matrix harness.
#
# Designed for a root-capable, Docker-in-Docker agent sandbox with Chromium
# preinstalled (PLAYWRIGHT_BROWSERS_PATH). See README.md for details.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
HA_IMAGE="${HA_IMAGE:-ghcr.io/home-assistant/home-assistant:stable}"
CARD_MOD_TAG="${CARD_MOD_TAG:-v4.2.1}"

echo "==> [1/6] ensure docker daemon"
if ! docker info >/dev/null 2>&1; then
  echo "    starting dockerd..."
  (sudo -n dockerd >/tmp/dockerd.log 2>&1 &) || (dockerd >/tmp/dockerd.log 2>&1 &)
  for _ in $(seq 1 15); do docker info >/dev/null 2>&1 && break; sleep 1; done
fi

echo "==> [2/6] build the plugin"
( cd "$REPO" && npm ci && npx vite build )
mkdir -p "$HERE/config/www"
cp "$REPO/dist/card-mod-studio.js" "$HERE/config/www/card-mod-studio.js"

echo "==> [3/6] fetch card-mod ($CARD_MOD_TAG)"
curl -fsSL -o "$HERE/config/www/card-mod.js" \
  "https://raw.githubusercontent.com/thomasloven/lovelace-card-mod/${CARD_MOD_TAG}/card-mod.js"

echo "==> [4/6] (re)start Home Assistant container"
docker rm -f ha-sandbox >/dev/null 2>&1 || true
docker run -d --name ha-sandbox -p 127.0.0.1:8123:8123 \
  -v "$HERE/config":/config "$HA_IMAGE" >/dev/null
echo "    HA at http://127.0.0.1:8123"

echo "==> [5/6] onboarding (creates user + tokens.json)"
python3 "$HERE/harness/onboard.py"

echo "==> [6/6] install harness deps + run the matrix"
( cd "$HERE/harness" && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --silent )
node "$HERE/harness/matrix.mjs"
node "$HERE/harness/button_matrix.mjs"

echo
echo "Done. Results: $HERE/harness/matrix.md  +  matrix.json"
echo "Other tools: harness/scan.mjs (mount check)."
