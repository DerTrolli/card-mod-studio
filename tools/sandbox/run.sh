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
# Overridable so a second instance (e.g. HA_IMAGE=...:beta) can run beside
# the default one: its own config dir, container, port and tokens file.
CFG="${CFG:-$HERE/config}"
CONTAINER="${CONTAINER:-ha-sandbox}"
HOST_PORT="${HOST_PORT:-8123}"
HA_URL="http://127.0.0.1:${HOST_PORT}"
TOKENS="${TOKENS:-$HERE/harness/tokens.json}"

echo "==> [1/6] ensure docker daemon"
if ! docker info >/dev/null 2>&1; then
  echo "    starting dockerd..."
  (sudo -n dockerd >/tmp/dockerd.log 2>&1 &) || (dockerd >/tmp/dockerd.log 2>&1 &)
  for _ in $(seq 1 15); do docker info >/dev/null 2>&1 && break; sleep 1; done
fi

echo "==> [2/6] build the plugin"
( cd "$REPO" && npm ci && npx vite build )
mkdir -p "$CFG/www"
[ -f "$CFG/configuration.yaml" ] || cp "$HERE/config/configuration.yaml" "$CFG/configuration.yaml"
cp "$REPO/dist/card-mod-studio.js" "$CFG/www/card-mod-studio.js"

echo "==> [3/6] fetch card-mod ($CARD_MOD_TAG)"
curl -fsSL -o "$CFG/www/card-mod.js" \
  "https://raw.githubusercontent.com/thomasloven/lovelace-card-mod/${CARD_MOD_TAG}/card-mod.js"

echo "==> [4/6] (re)start Home Assistant container"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" -p "127.0.0.1:${HOST_PORT}:8123" \
  -v "$CFG":/config "$HA_IMAGE" >/dev/null
echo "    HA at $HA_URL"

echo "==> [5/6] onboarding (creates user + tokens.json)"
HA_URL="$HA_URL" TOKENS_OUT="$TOKENS" python3 "$HERE/harness/onboard.py"

echo "==> [6/6] install harness deps + run the matrix"
( cd "$HERE/harness" && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --silent )
export HA_URL TOKENS_FILE="$TOKENS"
node "$HERE/harness/matrix.mjs"
[ "$CFG" = "$HERE/config" ] && node "$HERE/harness/button_matrix.mjs"  # writes config/ui-lovelace.yaml
node "$HERE/harness/compat_check.mjs"

echo
echo "Done. Results: $HERE/harness/matrix.md  +  matrix.json  +  compat-check.json"
echo "Other tools: harness/scan.mjs (mount check)."
