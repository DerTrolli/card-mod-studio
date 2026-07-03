#!/usr/bin/env python3
"""Drive Home Assistant onboarding via its HTTP API and write a token bundle
(tokens.json) that the Playwright harness injects into localStorage (hassTokens)
to be logged in headlessly. Stdlib only.

Run after the HA container starts. Idempotent only on a fresh container — if the
user step is already done it exits 2 (re-create the container to reset)."""
import json, os, sys, time, urllib.request, urllib.error, urllib.parse

HA_URL = os.environ.get("HA_URL", "http://127.0.0.1:8123")
CLIENT_ID = HA_URL + "/"
USER = {"name": "Dev", "username": "dev", "password": "dev"}
OUT = os.environ.get("TOKENS_OUT", os.path.join(os.path.dirname(os.path.abspath(__file__)), "tokens.json"))


def req(method, path, data=None, token=None, form=False):
    url = HA_URL + path
    headers, body = {}, None
    if data is not None:
        if form:
            body = urllib.parse.urlencode(data).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            body = json.dumps(data).encode()
            headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token
    r = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw.strip().startswith(("{", "[")) else raw)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
    except urllib.error.URLError as e:
        return None, str(e)
    except OSError as e:
        # Mid-boot HA can accept the TCP connection then reset it before
        # responding (ConnectionResetError etc.) — urllib doesn't wrap these
        # into URLError since they happen while reading the response, not
        # while connecting. Treat like any other transient failure so the
        # wait_ready() retry loop keeps polling instead of crashing.
        return None, str(e)


def wait_ready(timeout=180):
    print("waiting for HA onboarding endpoint...", flush=True)
    t0 = time.time()
    while time.time() - t0 < timeout:
        code, body = req("GET", "/api/onboarding")
        if code == 200:
            print("HA up. onboarding steps:", body, flush=True)
            return body
        time.sleep(3)
    sys.exit("TIMEOUT waiting for HA")


def main():
    steps = wait_ready()
    done = {s["step"]: s["done"] for s in steps} if isinstance(steps, list) else {}
    if done.get("user"):
        sys.exit("user step already done; re-create the container for a fresh start (exit 2)")

    code, body = req("POST", "/api/onboarding/users", {**USER, "client_id": CLIENT_ID, "language": "en"})
    print("create user:", code, body, flush=True)
    if code != 200:
        sys.exit(3)
    auth_code = body["auth_code"]

    code, tok = req("POST", "/auth/token",
                    {"grant_type": "authorization_code", "code": auth_code, "client_id": CLIENT_ID}, form=True)
    print("token exchange:", code, "OK" if code == 200 else tok, flush=True)
    if code != 200:
        sys.exit(4)
    access = tok["access_token"]

    for path, payload in [
        ("/api/onboarding/core_config", {}),
        ("/api/onboarding/analytics", {}),
        ("/api/onboarding/integration", {"client_id": CLIENT_ID, "redirect_uri": HA_URL + "/?auth_callback=1"}),
    ]:
        c, b = req("POST", path, payload, token=access)
        print(f"step {path}: {c}", "OK" if c in (200, 204) else b, flush=True)

    bundle = {
        "access_token": access, "token_type": "Bearer",
        "expires_in": tok.get("expires_in", 1800),
        "hassUrl": HA_URL, "clientId": CLIENT_ID,
        "expires": int(time.time() * 1000) + tok.get("expires_in", 1800) * 1000,
        "refresh_token": tok["refresh_token"],
    }
    with open(OUT, "w") as f:
        json.dump(bundle, f)
    print("WROTE", OUT, flush=True)


if __name__ == "__main__":
    main()
