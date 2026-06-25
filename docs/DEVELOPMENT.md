# Development Guide

This document explains how to set up a local development environment and test Card-Mod Studio against a real Home Assistant instance.

---

## Prerequisites

| Tool | Minimum version | Notes |
|---|---|---|
| Node.js | 18 | 20 LTS recommended |
| npm | 9 | Comes with Node |
| Home Assistant | 2024.4.0 | Any install method works |
| card-mod | 4.x | Must be installed in HA |

---

## First-time setup

```bash
git clone https://github.com/dertrolli/card-mod-studio
cd card-mod-studio
npm install
```

---

## Building

```bash
# Single build — output goes to dist/card-mod-studio.js
npm run build

# Watch mode — rebuilds on every .ts file change
npm run dev

# Type check only (no output)
npm run typecheck
```

The Vite config produces a single ES module bundle. No chunking.

---

## Deploying to Home Assistant

### Option A — Manual copy

After each build, copy the output:

```bash
cp dist/card-mod-studio.js /path/to/ha/config/www/
```

Then in HA's browser: `Ctrl + Shift + R` (hard refresh).

If styles seem stale, bump the `?v=` in the resource URL:

```
/local/card-mod-studio.js?v=0.1.1
```

### Option B — Automated copy (watch + copy)

You can wire up a simple shell one-liner to auto-copy on rebuild:

```bash
# In one terminal: watch for changes
npm run dev

# In another terminal: watch dist/ and copy on change
while inotifywait -e close_write dist/card-mod-studio.js; do
  cp dist/card-mod-studio.js /path/to/ha/config/www/
  echo "Copied at $(date +%H:%M:%S)"
done
```

Or if you have `fswatch` (macOS):
```bash
fswatch dist/card-mod-studio.js | xargs -I{} cp {} /path/to/ha/config/www/
```

### Option C — n8n automation

If you have n8n running alongside HA, you can create a workflow that watches the `dist/` folder via the filesystem node and copies to `www/` automatically.

---

## Registering the resource in HA

1. Go to **Settings → Dashboards → ⋮ (top right) → Resources**
2. Click **+ Add Resource**
3. Set:
   - **URL:** `/local/card-mod-studio.js?v=0.1.0`
   - **Resource type:** JavaScript Module
4. Click Create
5. Hard-refresh the browser

> You only need to do this once. On subsequent rebuilds, just hard-refresh the browser (update `?v=` if caching is a problem).

---

## Dev workflow

```
1. Open VS Code with the project
2. Run: npm run dev   (watch mode)
3. In HA: open any card editor
4. Open browser DevTools → Console tab
5. Edit a .ts file → Vite rebuilds → copy dist file → Ctrl+Shift+R in HA
6. Check console for "[Card-Mod Studio]" log messages
7. Verify the 🎨 Style button appears in the editor header
```

---

## Debugging injection issues

If the Style button doesn't appear:

1. Open browser DevTools (F12) → Console
2. Look for `[Card-Mod Studio]` messages:
   - `Waiting for hui-dialog-edit-card...` — plugin loaded, waiting for HA to define the element
   - `hui-dialog-edit-card patched successfully.` — injection worked
   - `Could not find ha-button[slot=secondaryAction]...` — HA's internal structure changed, see below
3. If you see that warning, inspect the shadow DOM of `hui-dialog-edit-card` to find the current structure and update `cms-injector.ts`

### Inspecting the shadow DOM

In DevTools Console (with a card editor open):
```javascript
// Find the dialog element
const dlg = document.querySelector('hui-dialog-edit-card');

// Inspect its shadow root
dlg.shadowRoot.innerHTML;

// Or list child elements
Array.from(dlg.shadowRoot.children).map(el => el.tagName + '.' + el.className);

// Confirm the footer button selector still resolves
dlg.shadowRoot.querySelector('ha-button[slot=secondaryAction]');
```

This tells you what selectors to update in `injectButton()` inside `cms-injector.ts`.

---

## Testing

Unit tests (Phase 3+) live in `test/`. Run with:

```bash
npm test
```

Tests use Vitest and are for the CSS/YAML generator and parser logic only. UI injection is tested manually against a live HA instance.

---

## Project architecture

### Injection mechanism

The plugin patches the `updated()` lifecycle method on `hui-dialog-edit-card`'s prototype (the card-editor dialog). This is the same element and technique card-mod itself patches for its brush-icon indicator.

```
Browser loads card-mod-studio.js
  → registers cms-panel and cms-tab-button custom elements
  → calls startInjector()
    → customElements.whenDefined('hui-dialog-edit-card')
    → patches the dialog class prototype's updated()

User opens card editor
  → HA creates hui-dialog-edit-card
  → HA calls updated() → our patch runs
  → requestAnimationFrame defers by one paint
  → injectButton() inserts <cms-tab-button> next to
    ha-button[slot=secondaryAction] (the Cancel/Save footer)
  → User clicks button → togglePanel() creates/shows <cms-panel>
    inside hui-card-element-editor's shadow root
```

The card config is read from the dialog's `_cardConfig` property and the
`hass` object from the dialog; changes are emitted back via a `config-changed`
CustomEvent that HA's normal save flow picks up.

### Data flow (planned, Phases 2–4)

```
User adjusts UI control in cms-panel
  → module emits style-changed event
  → cms-panel collects all module states
  → css-generator.ts builds CSS string
  → yaml-generator.ts wraps in card_mod block
  → cms-panel fires config-changed CustomEvent
  → HA's editor picks this up → marks card as modified
  → User clicks Save → HA saves the config
  → card-mod reads card_mod.style → applies CSS
```

---

## Compatibility notes

### hui-dialog-edit-card

This is an internal HA element name. If HA renames it:
1. The warning `Could not find ha-button[slot=secondaryAction]` will appear
   in the console
2. Update the constant `HA_DIALOG_ELEMENT` in `src/utils/dom-helpers.ts`
3. Update the `SECONDARY_ACTION_SELECTOR` and panel-host lookup in
   `src/editor/cms-injector.ts`

### Shadow DOM selectors

`injectButton()` finds the dialog footer via a single confirmed selector:
```typescript
const SECONDARY_ACTION_SELECTOR = 'ha-button[slot=secondaryAction]';
```

The `<cms-tab-button>` is inserted before the existing Cancel/Save button and
carries `slot="secondaryAction"` so it lands in the same footer area. The panel
itself is hosted in `hui-card-element-editor`'s shadow root (see `getPanelHost`),
falling back to the dialog's own shadow root. If HA restructures the dialog,
update these in `cms-injector.ts`. Always inspect the live shadow DOM first
(see Debugging section).
