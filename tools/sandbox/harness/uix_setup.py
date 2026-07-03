#!/usr/bin/env python3
"""Headlessly complete the UIX (github.com/Lint-Free-Technology/uix) config flow.

UIX's async_step_user takes no user input — reading its source
(custom_components/uix/config_flow.py) it either aborts (single instance
already configured, or a card-mod.js Lovelace resource / extra_module_url is
detected — see ../config-uix/configuration.yaml for why we avoid that) or
immediately creates the config entry with async_create_entry. So this is just:

    POST /api/config/config_entries/flow {"handler": "uix"}

and, only if that ever returns a form (defensive — current UIX source never
shows one), follow up with an empty POST to advance it.

Requires a tokens file from onboard.py (TOKENS_IN) for auth. Stdlib only.

Reuses onboard.py's req() helper (including its OSError handling for HA
resetting the connection mid-boot) rather than re-implementing it — this
script's own retry loop below exists precisely to ride out that same flaky
boot window, so it needs the same resilience."""
import json, os, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from onboard import req  # noqa: E402 — req() reads HA_URL from onboard's own env lookup

HERE = os.path.dirname(os.path.abspath(__file__))
TOKENS_IN = os.environ.get("TOKENS_IN", os.path.join(HERE, "tokens.json"))


def main():
    with open(TOKENS_IN) as f:
        access = json.load(f)["access_token"]

    # The uix integration platform can take a few seconds to finish loading
    # after a fresh container start even once onboarding itself is done —
    # retry an unrecognized-handler response rather than failing immediately.
    code, body = None, None
    for attempt in range(20):
        code, body = req("POST", "/api/config/config_entries/flow", {"handler": "uix"}, token=access)
        if code == 200:
            break
        print(f"attempt {attempt + 1}: flow init -> {code} {body}", flush=True)
        time.sleep(3)
    if code != 200:
        sys.exit(f"FAILED to start uix config flow: {code} {body}")

    print("flow init:", code, body, flush=True)

    if isinstance(body, dict) and body.get("type") == "form":
        flow_id = body["flow_id"]
        code, body = req("POST", f"/api/config/config_entries/flow/{flow_id}", {}, token=access)
        print("flow step:", code, body, flush=True)

    if not isinstance(body, dict):
        sys.exit(f"Unexpected flow response (not JSON): {body}")
    if body.get("type") == "abort":
        sys.exit(f"UIX config flow aborted: {body.get('reason')} — {body}")
    if body.get("type") != "create_entry":
        sys.exit(f"Unexpected flow result: {body}")

    print("UIX integration set up OK:", body.get("title"), flush=True)


if __name__ == "__main__":
    main()
