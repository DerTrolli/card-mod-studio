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
git clone https://github.com/dertrolli/card-mod-visual-editor
cd card-mod-visual-editor
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
   - `Waiting for hui-card-element-editor...` — plugin loaded, waiting for HA to define the element
   - `hui-card-element-editor patched successfully.` — injection worked
   - `Could not find action container` — HA's internal structure changed, see below
3. If you see the warning about `action container`, inspect the shadow DOM of `hui-card-element-editor` to find the current structure and update `cms-injector.ts`

### Inspecting the shadow DOM

In DevTools Console:
```javascript
// Find the editor element
const ed = document.querySelector('hui-card-element-editor');

// Inspect its shadow root
ed.shadowRoot.innerHTML;

// Or list child elements
Array.from(ed.shadowRoot.children).map(el => el.tagName + '.' + el.className);
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

The plugin patches the `updated()` lifecycle method on `hui-card-element-editor`'s prototype. This is the same technique used by card-mod and other injection-based HA plugins.

```
Browser loads card-mod-studio.js
  → registers cms-panel and cms-tab-button custom elements
  → calls startInjector()
    → customElements.whenDefined('hui-card-element-editor')
    → patches HuiCardElementEditor.prototype.updated()

User opens card editor
  → HA creates hui-card-element-editor
  → HA calls updated() → our patch runs
  → requestAnimationFrame defers by one paint
  → injectButton() adds <cms-tab-button> to the shadow root
  → User clicks button → togglePanel() creates/shows <cms-panel>
```

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

### hui-card-element-editor

This is an internal HA element name. If HA renames it:
1. The warning `Could not find action container` will appear
2. Update the constant `HA_CARD_EDITOR_ELEMENT` in `src/utils/dom-helpers.ts`
3. Update the selector list in `injectButton()` in `src/editor/cms-injector.ts`

### Shadow DOM selectors

The selector list in `injectButton()` tries multiple fallback targets:
```typescript
const actionContainer =
  root.querySelector('div.action-items') ??    // primary target
  root.querySelector('.header') ??             // fallback 1
  root.querySelector('ha-card') ??             // fallback 2
  root.querySelector(':first-child');          // last resort
```

If HA renames or restructures these containers, update this list. Always inspect the live shadow DOM first (see Debugging section).
