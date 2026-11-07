#!/usr/bin/env bash
# Runs the live check suite against one rig and prints one line per check.
#
#   bash run_suite.sh <label> <card-mod|uix> <ha_url> <tokens_file> <outdir>
#
#   e.g. bash run_suite.sh cm card-mod http://localhost:8123 tokens.json /tmp/out
#        bash run_suite.sh uix uix     http://localhost:8124 tokens-uix.json /tmp/out
#
# Each check's full log goes to <outdir>/<label>-<check>.log. A failing check
# is retried once (the rig is occasionally slow right after start-up). Output
# per check: "<label> <check> rc=N [(retried)]: <last summary or error line>",
# then a final "<label> SUMMARY pass=P fail=F".
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
LABEL="${1:?label}"; ENGINE="${2:?card-mod|uix}"; URL="${3:?ha url}"; TOK="${4:?tokens file}"; OUT="${5:?outdir}"
case "$TOK" in /*) ;; *) TOK="$HERE/$TOK" ;; esac
mkdir -p "$OUT"
export HA_URL="$URL" TOKENS_FILE="$TOK" TOKENS_IN="$TOK"
if [ "$ENGINE" = uix ]; then export STYLE_KEY=uix; else export STYLE_KEY=card_mod; fi

CM_CHECKS="compat_check animation_pack_check attr_palette_check beta2_fixes_check button_card_binding_check dialog_popover_check entity_binding_check font_module_check gauge_color_check gradient_mode_check gradient_typing_check gradient_uix_compat_check palette_check preset_stale_state_check preview_picker_check stack_child_check state_props_check dict_preserve_check dict_visual_check heading_check pierce_check"
UIX_CHECKS="uix_matrix animation_pack_check attr_palette_check beta2_fixes_check dialog_popover_check font_module_check gauge_color_check gradient_typing_check gradient_uix_only_compat_check legacy_adopt_check merge_check preset_stale_state_check preview_picker_check stack_child_check state_props_check dict_preserve_check dict_visual_check heading_check pierce_check"
if [ "$ENGINE" = uix ]; then CHECKS="$UIX_CHECKS"; else CHECKS="$CM_CHECKS"; fi
[ -n "${SUITE_ONLY:-}" ] && CHECKS="$SUITE_ONLY"

summary() { grep -E "checks passed|passed|FAIL|ERR|Error" "$1" | tail -n 1 | cut -c1-200; }

cd "$HERE"
pass=0; fail=0
for c in $CHECKS; do
  log="$OUT/$LABEL-$c.log"
  timeout 900 node "$c.mjs" > "$log" 2>&1; rc=$?; note=""
  if [ $rc -ne 0 ]; then
    timeout 900 node "$c.mjs" > "$log" 2>&1; rc=$?; note=" (retried)"
  fi
  if [ $rc -eq 0 ]; then pass=$((pass+1)); else fail=$((fail+1)); fi
  echo "$LABEL $c rc=$rc$note: $(summary "$log")"
done
echo "$LABEL SUMMARY pass=$pass fail=$fail"
