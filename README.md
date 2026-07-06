# Card-Mod Studio

[![hacs_badge](https://img.shields.io/badge/HACS-Default-blue.svg)](https://github.com/hacs/integration)
[![GitHub Release](https://img.shields.io/github/v/release/dertrolli/card-mod-studio)](https://github.com/dertrolli/card-mod-studio/releases)

A visual GUI editor for [card-mod](https://github.com/thomasloven/lovelace-card-mod) CSS styles in Home Assistant. Also works with [UIX](https://uix.lf.technology/), card-mod's integration-based successor.

Instead of hand-writing YAML + CSS + Jinja2 templates, Card-Mod Studio gives you color pickers, sliders, and animation presets — and generates the correct `card_mod`/`uix` YAML automatically.

![Style button in the card editor](images/01%20Style%20button.png)

---

## What it does

Card-Mod Studio adds a **🎨 Style button** to the Home Assistant card editor. Clicking it opens a two-column style panel alongside the native editor — no separate page, no copy-pasting YAML.

- **Left column** — scrollable list of style modules, each collapsible
- **Right column** — always-visible live card preview that updates as you change settings

![Card-Mod Studio panel](images/02%20Card-Mod%20Studio.png)

All changes are serialised to `card_mod` YAML and saved with the card config through HA's normal save flow. If you open a card that already has hand-written `card_mod` (or `uix`) CSS, the panel reads it back and pre-fills the controls.

### UIX support

[UIX](https://uix.lf.technology/) is a card-mod-derived Home Assistant integration built by card-mod's own current maintainer. It reads a `uix:` key in preference to `card_mod:`, but fully supports `card_mod:` as a fallback — so **Card-Mod Studio writes `card_mod:` by default even when UIX is installed**, and it just works. The only time it writes `uix:` instead is when UIX is detected and card-mod is not (UIX's own installer refuses to run alongside a `card-mod.js` resource, so this is the common "UIX-only" case). Either way, the panel reads back whichever of `uix:`/`card_mod:` is actually present — including cards you styled by hand — and the "not detected" warning only shows when neither engine is found.

If you switch back from UIX to card-mod-only, card-mod never reads `uix:` at all, so a card styled only under `uix:` would otherwise go silently unstyled. The panel warns about that specific card and offers a one-click "copy to `card_mod:`" fix for plain CSS. `uix:` blocks using UIX-only macros/billets get a clear incompatibility warning instead — card-mod can't run those under any key, so there's no fix to offer, just a heads-up.

---

## Style modules

### Icon Color & Accent Color

Set a static color for the card's icon or accent, choose separate colors for when the entity is **on** vs **off**, or — for light entities — let the icon automatically reflect the light's actual `rgb_color` attribute.

The Accent Color override targets the correct CSS variable per card type: `--tile-color` for tile cards, `--gauge-color` for gauges, and `--state-icon-color` for everything else.

![Icon and accent color controls](images/03%20Accent%20and%20Icon%20Color.png)

### Background

Apply a **solid color** or a **gradient** (with configurable angle) as the card background. Optionally restrict the background to only show when the entity is **on** or **off** — useful for making a card visually "glow" when a device is active.

![Background color module](images/04%20Background%20Color.png)

### Threshold Colors

The most powerful module. Define numeric rules that change visual properties based on a sensor's live value — no coding required.

Each rule has three parts:
- **Operator** — `<` `<=` `>` `>=` `==` `!=`
- **Value** — the numeric threshold to compare against
- **Color** — the color to apply when the rule matches

You can add as many rules as you need, plus a **default color** that applies when no rule matches. At runtime, card-mod/UIX evaluates the rules as a Jinja2 ternary chain against the live sensor state.

**Target properties:**
| Property | What it colors |
|---|---|
| Icon color | The card's main icon |
| Background | The entire card background |
| Text color | The card's state/value text |
| Accent color | The card's accent (tile glow, gauge fill, etc.) |
| Border color | The card border (requires Border module) |

**Example:** A temperature sensor could show the icon in blue below 18 °C, green between 18–25 °C, and red above 25 °C — all driven by three threshold rules, no YAML editing.

### Visual Filters

Apply CSS filter effects to the entire card:
- **Grayscale** — always on, only when entity is on, or only when off (great for making inactive devices look "dead")
- **Brightness** — brighten or dim the card
- **Blur** — blur the card content
- **Transition speed** — control how smoothly state changes animate

### Animation

Add a looping CSS animation to the card. Available presets:

| Animation | Effect |
|---|---|
| Pulse | Scale up and down rhythmically |
| Breathe | Soft opacity fade in and out |
| Gradient-shift | Slowly shift the background gradient colors |
| Bounce | Periodic vertical bounce |
| Blink | Abrupt on/off flash |

Each animation can run **always** or only trigger when the entity is **on** or **off**.

### Border

Round the card corners with a configurable **corner radius**, and optionally add a colored **border** with adjustable width. Works well combined with Threshold Colors targeting border color.

### Heading Style

For `heading` type cards: control font size, text color, icon size, icon color, and text alignment — all from one module.

### Advanced CSS

A raw CSS editor for anything the visual modules don't cover. Your CSS is appended after the generated styles and supports full `card_mod`/`uix` syntax including sub-element selectors and Jinja2 templates.

### Style presets

Save the full style configuration of any card as a **named preset** and restore it on any other card in one click. Presets are stored per-user in HA's backend (`frontend/get_user_data`) so they sync automatically across every device and browser logged in as the same HA user. localStorage is also written as an instant local fallback.

---

## Entities card per-row styling

For `type: entities` cards, Card-Mod Studio adds a dedicated section for each entity row in the list.

![Entities card styling](images/05%20Entities%20Card.png)

Each row can be styled independently:
- **Icon color** — static color, or threshold rules based on the row entity's numeric value
- **Text color** — static color, or threshold rules

The threshold rules per row work identically to the card-level Threshold Colors module: define operators, values, and colors, set a default, and card-mod/UIX evaluates the Jinja2 at runtime against that specific entity's state.

![Per-entity modifications](images/06%20Entities%20Card%20Modifications.png)

---

## Card-type awareness

The panel adapts to the card type so you never see irrelevant controls:

- **Container cards** (`grid`, `vertical-stack`, `horizontal-stack`, `sections`, `conditional`) — shows a redirect banner explaining that styles should be applied to child cards individually
- **Heading cards** — replaces icon/accent controls with the Heading Style module
- **Light cards** — Icon Color gains an automatic mode that mirrors the light's actual color
- **Entities cards** — hides card-level Icon Color, Accent Color, and Threshold modules (use per-row styling instead)
- **Data-viz / media cards** — hides Animation and Icon Color where they have no effect
- **Picture / iframe cards** — hides Background module

---

## Requirements

- Home Assistant 2024.4.0 or newer
- [card-mod](https://github.com/thomasloven/lovelace-card-mod) or [UIX](https://uix.lf.technology/) must be installed and working
- HACS (for installation)

Card-Mod Studio **generates** the YAML. card-mod/UIX **applies** it. One of the two is required.

---

## Installation

### Via HACS (recommended)

Card-Mod Studio is in the **HACS default store** — no custom repository needed.

1. Open HACS → search for **Card-Mod Studio**
2. Click it → **Download**
3. HACS registers the dashboard resource automatically on modern versions
4. Reload the browser (Ctrl+Shift+R)

> Added HACS before it was in the default store? Remove the old custom-repository
> entry to avoid a duplicate listing.

### Manual

1. Download `card-mod-studio.js` from the [latest release](../../releases/latest)
2. Copy to `config/www/card-mod-studio.js` in your HA config directory
3. Go to **Settings → Dashboards → ⋮ → Resources → + Add Resource**
   - URL: `/local/card-mod-studio.js?v=0.7.1`
   - Type: JavaScript Module
4. Reload the browser (Ctrl+Shift+R)

---

## Usage

1. Open any card in edit mode (click the pencil icon)
2. Look for the **🎨 Style** button in the card editor footer
3. Click it to open the style panel
4. Adjust controls — changes are previewed live on the right
5. Click **Save** as normal in the HA editor

---

## Compatibility

| HA Version | Status |
|---|---|
| 2026.x | Tested |
| 2025.x | Expected compatible |
| 2024.4+ | Minimum supported |

Card-mod compatibility follows card-mod's own compatibility table. See [card-mod releases](https://github.com/thomasloven/lovelace-card-mod/releases).

| Engine | Version tested | Status |
|---|---|---|
| card-mod | 4.2.1 | ✅ Tested, see [`docs/COMPATIBILITY_AUDIT.md`](docs/COMPATIBILITY_AUDIT.md) |
| UIX | 7.6.1 | ✅ Tested against a real running integration in Docker, see [`docs/COMPATIBILITY_AUDIT.md` §9](docs/COMPATIBILITY_AUDIT.md) and [`tools/sandbox/run-uix.sh`](tools/sandbox/run-uix.sh) |

> **Note on HA updates:** Card-Mod Studio injects into the card editor using the `hui-dialog-edit-card` element. If a HA update renames this element, the Style button will not appear and a console warning will be shown. Check [GitHub Issues](../../issues) for status after major HA releases.

---

## Limitations

- **card-mod or UIX required** — this plugin generates YAML; it does not apply CSS itself
- **Common card types prioritised** — standard HA cards are fully supported; custom cards (Mushroom, Bubble) have varying shadow DOM paths and may need the Advanced CSS editor
- **Entity-state conditionals only** — the UI supports on/off entity state conditions and numeric threshold rules; complex Jinja2 logic goes in the Advanced CSS editor
- **UIX reverse-compat warning doesn't cover dict-form or duplicate-entity-ID rows** — the per-card and per-row "styling is only under uix:" warnings (and the plain-CSS fix) work for the common case, but two pre-existing entities-card limitations carry over: hand-authored dictionary/shadow-pierce-form row styles aren't parsed back (same lossy round-trip as [dict-form card_mod](docs/COMPATIBILITY_AUDIT.md) generally), and rows sharing the same entity ID share one style slot. See [ROADMAP.md](docs/ROADMAP.md).
- **No UIX-exclusive features** — macros, billets, and Forge (UIX's own visual template builder) aren't generated by this tool; see [ROADMAP.md](docs/ROADMAP.md) for why and what's planned

---

## Development

### Prerequisites

```bash
node --version   # 18+ required
npm --version
```

Optional, only if you want to run the real-HA test rigs in `tools/sandbox/`
(not required for `npm test`/`npm run build`): Docker and Python 3.8+. See
[`tools/sandbox/README.md`](tools/sandbox/README.md).

### Setup

```bash
git clone https://github.com/dertrolli/card-mod-studio
cd card-mod-studio
npm install
```

### Build

```bash
npm run build       # one-off build to dist/
npm run dev         # watch mode — rebuilds on every file save
npm run typecheck   # TypeScript type checking only
npm test            # run unit tests (vitest)
```

### Copy to Home Assistant

After building, copy `dist/card-mod-studio.js` to your HA `config/www/` folder:

```bash
cp dist/card-mod-studio.js /path/to/ha/config/www/
```

Then hard-refresh the browser (Ctrl+Shift+R) and bump the `?v=` query string in the resource URL if caching is stubborn.

---

## Project structure

```
src/
├── card-mod-studio.ts      Entry point — loaded by HA as a Lovelace resource
├── editor/
│   ├── cms-injector.ts     Patches hui-dialog-edit-card to inject the UI
│   ├── cms-panel.ts        Main style panel — orchestrates all modules
│   └── cms-tab.ts          The "Style" button component
├── modules/                Visual style modules (one file per module)
├── generator/              StudioState → CSS → card_mod:/uix: YAML
├── parser/                 card_mod:/uix: YAML → CSS → StudioState
├── utils/                  DOM/engine-detection helpers, preset storage,
│                           card_mod:/uix: cross-compatibility checks
└── types/                  Shared TypeScript interfaces
test/
├── parser.test.ts          Parser pipeline unit tests
├── generator.test.ts       Generator pipeline unit tests
├── dom-helpers.test.ts     card-mod/UIX detection probe unit tests
└── style-compat.test.ts    Cross-compatibility check unit tests
tools/sandbox/              Real HA + real card-mod/UIX in Docker, Playwright
                            verification — see tools/sandbox/README.md
```

---

## Implementation status

| Phase | Goal | Status |
|---|---|---|
| 1 | Project scaffold + tab injection | ✅ Complete |
| 2 | YAML/CSS parser — read existing card-mod config | ✅ Complete |
| 3 | Visual modules — filter, icon color, accent color, background, animation, border, advanced CSS | ✅ Complete |
| 4 | Config integration — generate card_mod YAML and save via HA editor | ✅ Complete |
| 4.x | Card-type awareness — per-card module visibility, heading card, light card support | ✅ v0.3.10 |
| 5 | 2-column layout + live preview + style presets + cross-device preset sync | ✅ v0.3.13 |
| 6 | Entities card per-row styling (icon color + text color per entity, threshold rules) | ✅ v0.3.16 |
| 7 | HACS preparation — validation CI, badges, attribution | ✅ v0.4.0 |
| 8 | UX overhaul — unified "Apply when" controls, threshold legend, responsive layout | ✅ v0.5.0 |
| 9 | UIX support — dual-key parse/generate, reverse-compat warning | ✅ v0.6.0 |
| 10 | UX polish + correctness fixes — resizable style dialog, threshold color palette, card_mod:/uix: merge-on-edit, same-selector CSS parsing bug | ✅ v0.6.1 |
| 11 | Threshold color-palette popover positioning fix — correct inside HA's real (transformed, modal) card-edit dialog | ✅ v0.6.2 |
| 12 | Searchable entity picker everywhere + cross-entity control for Icon Color/Accent Color/Background/Filter (style one entity off a *different* entity's state) + multi-property threshold rules | ✅ v0.7.0 |
| 13 | Threshold Colors "Fade" (gradient) mode — smooth value→color interpolation as an alternative to discrete step rules | ✅ v0.7.0 |
| 14 | Full-codebase correctness audit — gauge dial + needle color support (accent + threshold/fade), tile/tile-feature color fix, stale-color-override fix, row/@keyframes/`!important` data-loss fixes, pre-0.7.0 preset migration, negative thresholds, on/off-filtered entity pickers | ✅ v0.7.1 |

For everything after a given release, [`CHANGELOG.md`](CHANGELOG.md) has full
detail and [`docs/ROADMAP.md`](docs/ROADMAP.md) has what's planned next.

---

## License

MIT — see [LICENSE](LICENSE)

---

## Credits

- [card-mod](https://github.com/thomasloven/lovelace-card-mod) by thomasloven — the engine that applies the generated YAML
- [UIX](https://uix.lf.technology/) by Lint-Free-Technology — card-mod's integration-based successor, also supported
- [Lit](https://lit.dev) — the web components library used for the editor UI
- [custom-cards boilerplate](https://github.com/custom-cards/boilerplate-card) — project structure inspiration

---

## Attribution

The concept, UX design, and product direction for Card-Mod Studio were created by [DerTrolli](https://github.com/dertrolli). The implementation was coded by [Claude](https://claude.ai) (AI assistant by [Anthropic](https://anthropic.com)).
