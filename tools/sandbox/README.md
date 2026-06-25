# Card-Mod Studio — testing sandbox

A self-contained rig that runs **real Home Assistant + real card-mod** in Docker
and uses **Playwright** to measure exactly what a `card_mod` style does to a real
card — by reading the *computed style* of the rendered element, not by guessing.

It exists so an **AI agent (or CI) can verify card styling itself** instead of a
human manually applying a setting, eyeballing the result, and reporting back. The
agent gets ground truth: "did `--tile-color` actually change the tile icon? yes →
`rgb(255,0,0)`, no → unchanged."

This rig produced [`docs/CARD_SUPPORT_MATRIX.md`](../../docs/CARD_SUPPORT_MATRIX.md).

---

## Why this design

card-mod's whole job is injecting a `<style>` into a card's shadow DOM. Whether a
setting "works" depends entirely on the card's **real** shadow-DOM structure and
which CSS variables it honors. So the rig must use the **real HA card components**
— mockups would only test our own guesses. Hence: real HA in Docker.

---

## Prerequisites (agent sandbox)

This is built for a root-capable cloud agent sandbox like the one Card-Mod Studio
is developed in:

- **Docker-in-Docker**: `docker` CLI present and the process can start `dockerd`
  (we run as root; the daemon comes up with the default overlayfs driver).
- **Chromium preinstalled** for Playwright at `PLAYWRIGHT_BROWSERS_PATH`
  (`/opt/pw-browsers/...`). The harness points `executablePath` straight at the
  binary, so the `playwright` npm version doesn't need to match the browser build.
  Override with `CHROME_BIN=/path/to/chrome` if your build differs.
- **Outbound HTTPS** to pull the HA image and `card-mod.js`.
- Node 18+ and Python 3.8+.

> Everything the rig generates at runtime (the HA image, `.storage`, the built
> plugin, `card-mod.js`, tokens, screenshots, matrix output) is **gitignored** —
> only the source of the rig is committed, so it can be rebuilt from scratch.

---

## Run it

```bash
tools/sandbox/run.sh
```

That builds the plugin, fetches card-mod, starts HA, completes onboarding, and
runs the matrix. Results land in `tools/sandbox/harness/matrix.md` + `matrix.json`.

To re-run just the measurement after HA is already up:

```bash
cd tools/sandbox/harness
node matrix.mjs          # 15 standalone-mountable card types
node button_matrix.mjs   # adds the button row via a real dashboard
node scan.mjs            # which card types mount cleanly standalone
```

Environment overrides: `HA_URL`, `CHROME_BIN`, `HA_IMAGE`, `CARD_MOD_TAG`.

---

## How it works

```
run.sh
  ├─ start dockerd (if needed)
  ├─ npm ci && vite build        → dist/card-mod-studio.js → config/www/
  ├─ download card-mod.js        → config/www/
  ├─ docker run HA  (-v config:/config, demo integration, YAML dashboard)
  ├─ onboard.py     → POST /api/onboarding/* → tokens.json
  └─ harness (Playwright)
        ├─ inject tokens.json into localStorage(hassTokens)  → logged in
        ├─ open the dashboard, wait for hass + card-mod
        ├─ render a card via <hui-card> with a card_mod block
        ├─ card-mod (loaded as a resource) applies the style
        └─ pierce the shadow DOM, read getComputedStyle of the target
```

- **`config/configuration.yaml`** — minimal HA: the `demo` integration (≈117 test
  entities), YAML-mode dashboard, card-mod + the plugin as resources.
- **`harness/onboard.py`** — drives HA's onboarding HTTP API to create a user and
  emit `tokens.json` (no manual login, no `.storage` seeding).
- **`harness/matrix.mjs`** — renders each card type, applies the CSS the tool
  emits per setting, classifies each cell `effect` / `no-effect` / `no-target`.
- **`harness/button_matrix.mjs`** — the button card can't mount standalone, so it
  is measured inside a real YAML dashboard (cards matched by a `name` marker
  because the masonry layout reorders the DOM).

---

## Known limitations / gotchas

- **`button` won't mount standalone** via `document.createElement('hui-card')` — it
  renders an error card. Other 15 tested types mount fine. button is handled via a
  real dashboard (`button_matrix.mjs`); other awkward custom cards may need the
  same treatment.
- **Lazy-loading / masonry**: dashboard cards render on scroll and the masonry
  layout reorders the DOM — never map cards by index, match by a marker.
- **card-mod registers lazily**: `customElements.get('card-mod')` can read `false`
  until the first `card_mod` card renders. Don't gate on it; the resource 200 +
  observed effects confirm it's working.
- **`dockerd` can get reaped** between steps in some sandboxes — `run.sh` restarts
  it; long sessions may need a re-check.
- **The matrix measures the icon** for `icon_color`/`accent_color`. `—` means the
  card has no icon; for `accent_color` on gauge/thermostat that does **not** mean
  accent has no effect on the arc/ring (not yet measured).

---

## Extending

Add a card type or entity to the `CARDS` map and/or a setting to `SETTINGS` in
`matrix.mjs`. Each setting is `{ css, tag, prop }`: the CSS the tool emits, the
target element to find, and the computed property to compare. To test exactly what
the tool produces end-to-end, import and call the real `css-generator` output
instead of the hand-written CSS strings.
