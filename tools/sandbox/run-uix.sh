#!/usr/bin/env bash
# One-shot setup + run for the Card-Mod Studio × UIX sandbox.
#
# Mirrors run.sh but targets UIX (github.com/Lint-Free-Technology/uix)
# instead of card-mod, as a SEPARATE HA instance/container/port. It can't
# share config/ or a container with run.sh's sandbox: UIX's own config flow
# (custom_components/uix/config_flow.py) aborts setup with
# "old_frontend_script_resource" if it detects any Lovelace resource URL
# containing the substring "card-mod.js" — see config-uix/configuration.yaml.
#
# UIX ships no tagged release archive, and codeload.github.com (GitHub's
# archive/zip endpoint) is blocked by some outbound network policies even
# when github.com itself is reachable — so this clones the tag over the
# standard git protocol instead of downloading a tarball.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
CFG="${CFG:-$HERE/config-uix}"
CONTAINER="${CONTAINER:-ha-sandbox-uix}"
# Pinned, not :stable — a new HA release must never move the baseline
# silently (docs/V0.11_PLAN.md D8); try a newer one with HA_IMAGE=….
HA_IMAGE="${HA_IMAGE:-ghcr.io/home-assistant/home-assistant:2026.10.4}"
MUSHROOM_TAG="${MUSHROOM_TAG:-v5.2.3}"
BUBBLE_TAG="${BUBBLE_TAG:-v3.4.2}"
UIX_TAG="${UIX_TAG:-v8.4.0}"  # 8.4 needs HA >= 2026.10
HOST_PORT="${HOST_PORT:-8124}"
HA_URL="http://127.0.0.1:${HOST_PORT}"
TOKENS="${TOKENS:-$HERE/harness/tokens-uix.json}"

echo "==> [1/7] ensure docker daemon"
if ! docker info >/dev/null 2>&1; then
  echo "    starting dockerd..."
  (sudo -n dockerd >/tmp/dockerd.log 2>&1 &) || (dockerd >/tmp/dockerd.log 2>&1 &)
  for _ in $(seq 1 15); do docker info >/dev/null 2>&1 && break; sleep 1; done
fi

echo "==> [2/7] build the plugin"
( cd "$REPO" && npm ci && npx vite build )
mkdir -p "$CFG/www"
[ -f "$CFG/configuration.yaml" ] || cp "$HERE/config-uix/configuration.yaml" "$CFG/configuration.yaml"
cp "$REPO/dist/card-mod-studio.js" "$CFG/www/card-mod-studio.js"

echo "==> [3/7] fetch UIX ($UIX_TAG) custom_components/uix"
rm -rf "$CFG/custom_components"
mkdir -p "$CFG/custom_components"
TMP_CLONE="$(mktemp -d)"
git clone --quiet --depth 1 --branch "$UIX_TAG" \
  https://github.com/Lint-Free-Technology/uix.git "$TMP_CLONE"
cp -r "$TMP_CLONE/custom_components/uix" "$CFG/custom_components/uix"
rm -rf "$TMP_CLONE"

echo "==> fetch pinned custom cards (Mushroom $MUSHROOM_TAG, Bubble Card $BUBBLE_TAG)"
# Real Mushroom/Bubble builds so custom-card support can be probed and
# audited (docs/V0.11_PLAN.md). CUSTOM_CARDS=0 skips; the resources in
# configuration.yaml then just 404 and the cards render as errors.
if [ "${CUSTOM_CARDS:-1}" != "0" ]; then
  curl -fsSL -o "$CFG/www/mushroom.js" \
    "https://github.com/piitaya/lovelace-mushroom/releases/download/${MUSHROOM_TAG}/mushroom.js"
  curl -fsSL -o "$CFG/www/bubble-card.js" \
    "https://github.com/Clooos/Bubble-Card/releases/download/${BUBBLE_TAG}/bubble-card.js"
fi

echo "==> [4/7] (re)start Home Assistant container"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" -p "127.0.0.1:${HOST_PORT}:8123" \
  -v "$CFG":/config "$HA_IMAGE" >/dev/null
echo "    HA at $HA_URL"

echo "==> [5/7] onboarding (creates user + tokens-uix.json)"
HA_URL="$HA_URL" TOKENS_OUT="$TOKENS" python3 "$HERE/harness/onboard.py"

echo "==> [6/7] set up the UIX integration (headless config flow)"
HA_URL="$HA_URL" TOKENS_IN="$TOKENS" python3 "$HERE/harness/uix_setup.py"

echo "==> [7/7] install harness deps + run UIX checks"
( cd "$HERE/harness" && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --silent )
HA_URL="$HA_URL" TOKENS_IN="$TOKENS" node "$HERE/harness/uix_matrix.mjs"

echo
echo "Done. Results: $HERE/harness/uix-matrix.json"
