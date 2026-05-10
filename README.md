# Card-Mod Studio

A visual GUI editor for [card-mod](https://github.com/thomasloven/lovelace-card-mod) CSS styles in Home Assistant.

Instead of hand-writing YAML + CSS + Jinja2 templates, Card-Mod Studio gives you color pickers, sliders, and animation presets — and generates the correct `card_mod` YAML automatically.

> **Current version: v0.3.14**

---

## What it does

Card-Mod Studio adds a **"🎨 Style" button** to the Home Assistant card editor. Clicking it opens a two-column style panel alongside the native editor:

- **Left column** — scrollable list of style modules
- **Right column** — always-visible live card preview

### Style modules

| Module | Controls |
|---|---|
| Heading Style | Font size, text color, icon size, icon color, alignment |
| Visual Filters | Grayscale (always / when on / when off), brightness, blur, transition speed |
| Accent Color | CSS `--accent-color` override |
| Icon Color | Static, on/off conditional, or auto light color from `rgb_color` attribute |
| Threshold Colors | Numeric rules (< <= > >= == !=) driving icon color, background, text color, accent color, or border color |
| Background | Solid or gradient + angle, optional on/off state condition |
| Animation | Pulse, breathe, gradient-shift, bounce, blink — always or state-triggered |
| Border | Corner radius + optional colored border with configurable width |
| Advanced CSS | Raw CSS passthrough for anything else |

All changes are serialised to `card_mod` YAML and saved with the card config through HA's normal save flow.

### Card-type awareness

The panel adapts to the card type:

- **Container cards** (`grid`, `vertical-stack`, `horizontal-stack`, `sections`, `conditional`) — shows a redirect banner explaining that styles should be applied to child cards individually
- **Heading cards** — replaces icon/accent controls with the dedicated Heading Style module
- **Light cards** — Icon Color gains an automatic mode that reads the light's actual `rgb_color` attribute
- **Data-viz / media cards** — hides Animation and Icon Color modules where they have no effect
- **Picture / iframe cards** — hides Background module

### Style presets

Save the current style configuration as a named preset and restore it on any card. Presets are stored in HA's backend per-user (`frontend/get_user_data`) so they are available on every device logged in as the same HA user. localStorage is also written as an instant local fallback.

---

## Requirements

- Home Assistant 2024.4.0 or newer
- [card-mod](https://github.com/thomasloven/lovelace-card-mod) must be installed and working
- HACS (for installation)

Card-Mod Studio **generates** the card-mod YAML. card-mod **applies** it. Both are required.

---

## Installation

### Via HACS (recommended — not yet in public listing)

1. Open HACS → Dashboard
2. Click ⋮ → Custom Repositories
3. Add `https://github.com/dertrolli/card-mod-visual-editor` as **Dashboard** type
4. Install "Card-Mod Studio"
5. Add the resource to Home Assistant (HACS does this automatically on modern versions)

### Manual

1. Download `card-mod-studio.js` from the [latest release](../../releases/latest)
2. Copy to `config/www/card-mod-studio.js` in your HA config directory
3. Go to **Settings → Dashboards → ⋮ → Resources → + Add Resource**
   - URL: `/local/card-mod-studio.js?v=0.3.14`
   - Type: JavaScript Module
4. Reload the browser (Ctrl+Shift+R)

---

## Usage

1. Open any card in edit mode (click the pencil icon)
2. The card editor opens — look for the **🎨 Style** button in the footer
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

> **Note on HA updates:** Card-Mod Studio injects into the card editor using the `hui-dialog-edit-card` element. If a HA update renames this element, the Style button will not appear and a console warning will be shown. Check [GitHub Issues](../../issues) for status after major HA releases.

---

## Development

### Prerequisites

```bash
node --version   # 18+ required
npm --version
```

### Setup

```bash
git clone https://github.com/dertrolli/card-mod-visual-editor
cd card-mod-visual-editor
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

### Dev loop

```
edit .ts file → Vite rebuilds (~200ms) → copy to config/www/ → Ctrl+Shift+R in HA
```

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
├── generator/              StudioState → CSS → card_mod YAML
├── parser/                 card_mod YAML → CSS → StudioState
├── utils/                  DOM helpers, preset storage
└── types/                  Shared TypeScript interfaces
test/
├── parser.test.ts          Parser pipeline unit tests
└── generator.test.ts       Generator pipeline unit tests
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
| 6 | Entities card per-row styling (icon color + text color per entity) | ✅ v0.3.14 |

---

## Limitations

- **card-mod required** — this plugin generates YAML for card-mod; it does not apply CSS itself
- **Common card types prioritised** — standard HA cards are fully supported; custom cards (Mushroom, Bubble) have varying shadow DOM paths and may need the Advanced CSS editor
- **Entity-state conditionals only** — the UI supports on/off entity state conditions and numeric threshold rules; complex Jinja2 logic goes in the Advanced CSS editor

---

## License

MIT — see [LICENSE](LICENSE)

---

## Credits

- [card-mod](https://github.com/thomasloven/lovelace-card-mod) by thomasloven — the engine that applies the generated YAML
- [Lit](https://lit.dev) — the web components library used for the editor UI
- [custom-cards boilerplate](https://github.com/custom-cards/boilerplate-card) — project structure inspiration
