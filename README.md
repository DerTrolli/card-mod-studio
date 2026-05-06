# Card-Mod Studio

A visual GUI editor for [card-mod](https://github.com/thomasloven/lovelace-card-mod) CSS styles in Home Assistant.

Instead of hand-writing YAML + CSS + Jinja2 templates, Card-Mod Studio gives you color pickers, sliders, and animation presets — and generates the correct `card_mod` YAML automatically.

> **Status: Phase 1 — Scaffold & Injection (in development)**
> The tab injection mechanism is built. Visual style controls are coming in Phase 3.

---

## What it does

Card-Mod Studio adds a **"Style" button** to the Home Assistant card editor. Clicking it opens a style panel alongside the native editor where you can visually configure:

| Module | Controls |
|---|---|
| Visual Filters | Grayscale when off, brightness, blur, transition speed |
| Icon Color | Color picker for on/off states |
| Background | Solid color or gradient + angle |
| Animation | Pulse, breathe, gradient shift, color fade, blink |
| Border | Radius slider + optional colored border |
| Advanced | Raw CSS editor (CodeMirror) for anything else |

All changes are serialized to `card_mod` YAML and saved with the card config through Home Assistant's normal save flow.

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
   - URL: `/local/card-mod-studio.js?v=0.1.0`
   - Type: JavaScript Module
4. Reload the browser (Ctrl+Shift+R)

---

## Usage

1. Open any card in edit mode (click the pencil icon)
2. The card editor opens — look for the **🎨 Style** button in the editor header
3. Click it to open the style panel
4. Adjust controls — the YAML is generated and applied on save
5. Click **Save** as normal in the HA editor

---

## Compatibility

| HA Version | Status |
|---|---|
| 2026.x | Tested |
| 2025.x | Expected compatible |
| 2024.4+ | Minimum supported |

Card-mod compatibility follows card-mod's own compatibility table. See [card-mod releases](https://github.com/thomasloven/lovelace-card-mod/releases).

> **Note on HA updates:** Card-Mod Studio injects into the card editor using the `hui-card-element-editor` element name. If a HA update renames this element, the Style button will not appear. A console warning will be shown. Check [GitHub Issues](../../issues) for status after major HA releases.

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

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for a detailed walkthrough.

---

## Project structure

```
src/
├── card-mod-studio.ts      Entry point — loaded by HA
├── editor/
│   ├── cms-injector.ts     Patches hui-card-element-editor to inject our UI
│   ├── cms-panel.ts        The Lit-based style panel component
│   └── cms-tab.ts          The "Style" button component
├── modules/                Visual style modules (Phase 3)
├── generator/              CSS → YAML generation (Phase 4)
├── parser/                 YAML → internal state parsing (Phase 2)
├── utils/                  DOM helpers, debounce, HA helpers
└── types/                  TypeScript interfaces
```

---

## Implementation phases

| Phase | Goal | Status |
|---|---|---|
| 1 | Project scaffold + injection | ✅ In progress |
| 2 | YAML parser (read existing card-mod config) | Planned |
| 3 | Visual modules (filter, color, background, animation) | Planned |
| 4 | Config integration (save changes to card) | Planned |
| 5 | Polish + HACS public submission | Planned |

---

## Limitations (v1)

- **No live preview** — changes are visible after save and browser refresh (v2 feature)
- **card-mod required** — this plugin generates YAML for card-mod, it does not apply CSS itself
- **Common card types only** — light, button, sensor, tile cards are prioritized; custom cards (Mushroom, Bubble) have varying shadow DOM paths
- **Conditional CSS only for entity state** — complex Jinja2 logic goes in the Advanced raw CSS editor

---

## License

MIT — see [LICENSE](LICENSE)

---

## Credits

- [card-mod](https://github.com/thomasloven/lovelace-card-mod) by thomasloven — the engine that applies the generated YAML
- [Lit](https://lit.dev) — the web components library used for the editor UI
- [custom-cards boilerplate](https://github.com/custom-cards/boilerplate-card) — project structure inspiration
