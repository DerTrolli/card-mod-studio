#!/usr/bin/env bash
# The 1.0.0 release run on ONE frozen build (docs/V1.0_FINAL_PLAN.md §4).
#
#   RUN=/dir SC=/dir/with/rig-tokens-and-configs bash tools/sandbox/harness/release_run.sh
#
# Rigs (sequential, one at a time): card-mod 2026.11 :8123, UIX 2026.11 :8125,
# 2026.2 :8127, 2025.9 :8126. Every step appends one line to $RUN/record.txt;
# full logs sit next to it. A failing live check is retried once (logged as
# "retried"); nothing in the repository is changed while it runs.
set -u
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
H="$REPO/tools/sandbox/harness"
RUN="${RUN:?set RUN to an output folder}"
SC="${SC:?set SC to the folder with tokens-uix9.json, tokens-2602.json, tokens-2509.json and config-*/}"
mkdir -p "$RUN"
REC="$RUN/record.txt"
log() { echo "$(date -u +%H:%M:%S) $*" | tee -a "$REC"; }
last() { grep -E 'checks passed|SUMMARY|passed\.|FAILED|FAIL setup' "$1" | tail -1 | cut -c1-220; }
# check <name> <log> <cmd…>: run, retry once on failure, record
check() {
  local name="$1" logf="$2"; shift 2
  ( cd "$H" && timeout 3600 "$@" ) > "$logf" 2>&1; local rc=$? note=""
  if [ $rc -ne 0 ]; then mv "$logf" "$logf.try1"; ( cd "$H" && timeout 3600 "$@" ) > "$logf" 2>&1; rc=$?; note=" (retried; first attempt: $(last "$logf.try1" | cut -c1-120))"; fi
  log "$name rc=$rc$note: $(last "$logf")"
}

cd "$REPO"
START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
log "=== 1.0.0 release run, started $START"
[ -z "$(git status --porcelain)" ] || { log "STOP: the working tree is not clean"; exit 1; }
log "commit $(git rev-parse HEAD) on $(git rev-parse --abbrev-ref HEAD)"

# ---------------------------------------------------------------- 1. static
npm ci > "$RUN/npm-ci.log" 2>&1; log "npm ci rc=$?"
npx tsc --noEmit -p . > "$RUN/typecheck.log" 2>&1; log "typecheck rc=$?"
npx eslint src --ext .ts > "$RUN/lint.log" 2>&1; log "lint: $(grep -E '^✖ [0-9]+ problems' "$RUN/lint.log" | tail -1) (record only; before this cycle: 181 problems)"
npx vitest run > "$RUN/unit.log" 2>&1; log "unit rc=$?: $(grep -E 'Tests ' "$RUN/unit.log" | tail -1)"
npx vite build > "$RUN/build1.log" 2>&1; A="$(sha256sum dist/card-mod-studio.js | cut -d' ' -f1)"
npx vite build > "$RUN/build2.log" 2>&1; B="$(sha256sum dist/card-mod-studio.js | cut -d' ' -f1)"
[ "$A" = "$B" ] && log "build reproducible: $A" || log "FAIL build not reproducible: $A vs $B"
FROZEN="$RUN/card-mod-studio.frozen.js"
cp dist/card-mod-studio.js "$FROZEN"
FSHA="$(sha256sum "$FROZEN" | cut -d' ' -f1)"
log "FROZEN bundle sha256 $FSHA ($(stat -c %s "$FROZEN") bytes), version $(grep -o '"version": "[^"]*"' package.json)"
WWW=("$REPO/tools/sandbox/config/www" "$SC/config-uix9/www" "$SC/config-2602/www" "$SC/config-2509/www")
deploy() { for d in "${WWW[@]}"; do cp "$FROZEN" "$d/card-mod-studio.js"; done; }
verify() {
  local bad=0
  for d in "${WWW[@]}"; do [ "$(sha256sum "$d/card-mod-studio.js" | cut -d' ' -f1)" = "$FSHA" ] || { bad=1; log "FAIL $d does not hold the frozen bundle"; }; done
  [ $bad = 0 ] && log "rigs hold the frozen bundle ($1)"
}
deploy; verify "deployed"
# every rig starts with no stored presets, palette or settings (as a first install)
( cd "$H" && SC="$SC" node -e "
import('./click-driver.mjs').then(async (D) => {
  for (const o of [{ rig: 'cm' }, { rig: 'uix', tokensFile: process.env.SC + '/tokens-uix9.json' }, { rig: 'cm', tokensFile: process.env.SC + '/tokens-2602.json' }, { rig: 'cm', tokensFile: process.env.SC + '/tokens-2509.json' }]) {
    const h = await D.launch(o);
    await h.page.evaluate(async () => { const c = document.querySelector('home-assistant').hass.connection; for (const key of ['cms_settings', 'cms_presets', 'cms_palette']) await c.sendMessagePromise({ type: 'frontend/set_user_data', key, value: null }); });
    console.log('clean', h.ha); await h.close();
  }
});" ) > "$RUN/clean.log" 2>&1
log "rig state cleared rc=$?: $(tr '\n' ' ' < "$RUN/clean.log" | cut -c1-200)"

# ---------------------------------------------------------------- 2. continuity
VERS="v0.8.1,v0.9.1,v0.10.0,v0.10.1,v0.10.2,v0.11.0-beta.1,v0.11.0-beta.2,v0.11.0-beta.3,v0.11.0,v1.0.0-beta.1,v1.0.0-beta.2" \
  REGEN=1 tools/continuity/run.sh > "$RUN/continuity.log" 2>&1
log "continuity rc=$?: $(grep -E 'FAIL|differ|DIFF|identical|same|ok' "$RUN/continuity.log" | tail -4 | tr '\n' ' ' | cut -c1-300)"

# ---------------------------------------------------------------- 3a. card-mod 2026.11 (:8123)
export HA_URL=http://127.0.0.1:8123 TOKENS_FILE="$H/tokens.json" STYLE_KEY=card_mod
( cd "$H" && bash run_suite.sh cm card-mod "$HA_URL" tokens.json "$RUN/suite-cm" ) > "$RUN/suite-cm.txt" 2>&1
log "suite card-mod: $(tail -1 "$RUN/suite-cm.txt")"
for c in rename_check threshold_text_check conditions_text_check beta2_check sections_check phone_preview_check readback_check language_check first_run_languages_check presets_check containers_check features_check integration_check reporter_case_sim keyboard_sim; do
  check "cm $c" "$RUN/cm-$c.log" node "$c.mjs"
done
check "cm long_session_sim" "$RUN/cm-long_session_sim.log" env ROUNDS=30 node long_session_sim.mjs
for v in v0.11.0 v1.0.0-beta.1 v1.0.0-beta.2; do
  check "cm upgrade_sim $v" "$RUN/cm-upgrade-$v.log" env OLD_BUNDLE="$SC/old/$v/dist/card-mod-studio.js" OLD_LABEL="$v" NEW_BUNDLE="$FROZEN" node upgrade_sim.mjs
done
verify "after the upgrade simulations"
check "cm functional UI" "$RUN/cm-fui.log" env FUI_RIG=cm-release node functional_ui_check.mjs
check "cm sweep desktop" "$RUN/cm-sweep-desktop.log" node languages_sweep_check.mjs
check "cm sweep phone 390" "$RUN/cm-sweep-390.log" env PHONE=1 node languages_sweep_check.mjs
check "cm sweep phone 360" "$RUN/cm-sweep-360.log" env PHONE=1 PHONE_W=360 node languages_sweep_check.mjs
for th in light dark; do
  ( cd "$H" && QA_THEMES=$th QA_OUT="$RUN/qa-cm-$th" timeout 5400 node release_qa.mjs ) > "$RUN/cm-release_qa-$th.log" 2>&1
  log "cm release_qa $th rc=$?: $(grep -c 'contrast=0 clipped=0 lightCtrl=0 tiny=0 errors=0' "$RUN/cm-release_qa-$th.log") clean of $(grep -cE '^cardmod ' "$RUN/cm-release_qa-$th.log"); not clean: $(grep -E '^cardmod ' "$RUN/cm-release_qa-$th.log" | grep -v 'contrast=0 clipped=0 lightCtrl=0 tiny=0 errors=0' | head -3 | tr '\n' ';' | cut -c1-300)"
done
check "cm module_effect_audit (built-in)" "$RUN/cm-audit.log" env AUDIT_TAG=release node module_effect_audit.mjs
check "cm module_effect_audit (custom)" "$RUN/cm-audit-custom.log" env AUDIT_TAG=release AUDIT_CUSTOM=1 node module_effect_audit.mjs

# ---------------------------------------------------------------- 3b. UIX 2026.11 (:8125)
export HA_URL=http://127.0.0.1:8125 TOKENS_FILE="$SC/tokens-uix9.json" STYLE_KEY=uix RIG=uix UIX_TOKENS_FILE="$SC/tokens-uix9.json"
( cd "$H" && bash run_suite.sh uix uix "$HA_URL" "$TOKENS_FILE" "$RUN/suite-uix" ) > "$RUN/suite-uix.txt" 2>&1
log "suite UIX: $(tail -1 "$RUN/suite-uix.txt")"
check "uix functional UI" "$RUN/uix-fui.log" env FUI_RIG=uix-release node functional_ui_check.mjs
for c in rename_check threshold_text_check conditions_text_check beta2_check readback_check presets_check containers_check features_check phone_preview_check reporter_case_sim; do
  check "uix $c" "$RUN/uix-$c.log" node "$c.mjs"
done
check "uix module_effect_audit (custom)" "$RUN/uix-audit-custom.log" env AUDIT_TAG=release AUDIT_CUSTOM=1 node module_effect_audit.mjs
unset RIG UIX_TOKENS_FILE

# ---------------------------------------------------------------- 3c. older Home Assistant (2026.2 :8127, 2025.9 :8126)
for pair in "2602 8127" "2509 8126"; do
  set -- $pair; tag=$1; port=$2
  export HA_URL=http://127.0.0.1:$port TOKENS_FILE="$SC/tokens-$tag.json" STYLE_KEY=card_mod
  check "$tag functional UI" "$RUN/$tag-fui.log" env FUI_RIG=$tag-release node functional_ui_check.mjs
  for c in rename_check threshold_text_check conditions_text_check readback_check phone_preview_check presets_check reporter_case_sim; do
    check "$tag $c" "$RUN/$tag-$c.log" node "$c.mjs"
  done
done
check "2509 integration_check" "$RUN/2509-integration_check.log" env HA_URL=http://127.0.0.1:8126 TOKENS_FILE="$SC/tokens-2509.json" node integration_check.mjs
verify "at the end"

# ---------------------------------------------------------------- 4. Home Assistant's logs
for c in ha-sandbox ha-sandbox-uix9 ha-old-2602 ha-old-2509; do
  docker logs --since "$START" "$c" > "$RUN/halog-$c.txt" 2>&1
  e="$(grep -cE 'ERROR|Traceback' "$RUN/halog-$c.txt")"; ours="$(grep -E 'ERROR|Traceback' "$RUN/halog-$c.txt" | grep -c card_mod_studio)"
  [ "$ours" = 0 ] && log "HA log $c: $e errors / tracebacks, none from card_mod_studio" || log "FAIL HA log $c: $ours lines name card_mod_studio"
done
log "=== DONE"
