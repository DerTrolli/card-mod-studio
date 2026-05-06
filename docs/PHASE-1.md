# Phase 1 — Project Scaffold & HA Injection

**Goal:** A "Style" button appears in the Home Assistant card editor. Clicking it opens a blank panel. Nothing else works yet, but the injection mechanism is proven.

**Status:** ✅ Complete

---

## What was built

### Project infrastructure

| File | Purpose |
|---|---|
| `package.json` | npm project definition, scripts, deps |
| `tsconfig.json` | TypeScript compiler config (ES2022, strict) |
| `vite.config.ts` | Single-bundle ES module build to `dist/` |
| `.eslintrc.json` | Linting rules (TypeScript + recommended) |
| `.gitignore` | Ignores node_modules, dist, sourcemaps |
| `hacs.json` | HACS plugin metadata |
| `.github/workflows/validate.yml` | CI: typecheck + build on every push/PR |
| `.github/workflows/release.yml` | CD: build + attach to GitHub release on tag push |

### Source code

| File | Purpose |
|---|---|
| `src/types/index.ts` | All shared TypeScript interfaces |
| `src/types/card-mod.d.ts` | Ambient declarations for HA and our elements |
| `src/utils/debounce.ts` | Generic debounce utility |
| `src/utils/dom-helpers.ts` | Shadow DOM traversal, injection helpers |
| `src/utils/hass-helpers.ts` | Entity state helpers |
| `src/editor/cms-tab.ts` | The 🎨 Style toggle button (Lit component) |
| `src/editor/cms-panel.ts` | The main style panel (Lit component, placeholder) |
| `src/editor/cms-injector.ts` | Patches `hui-card-element-editor` prototype |
| `src/card-mod-studio.ts` | Plugin entry point |

---

## How injection works

The core challenge of Phase 1 is getting our UI *inside* the HA card editor, which lives inside multiple layers of Shadow DOM.

### The approach: prototype patching

We wait for `hui-card-element-editor` to be defined by HA (using `customElements.whenDefined()`), then override its `updated()` lifecycle method on the prototype. Every time HA re-renders the editor, our override runs and ensures our button is present.

```
customElements.whenDefined('hui-card-element-editor')
  → patch HuiCardElementEditor.prototype.updated()
  → each time updated() fires:
      → requestAnimationFrame (waits one paint for DOM to settle)
      → injectButton() checks if our button is already there
      → if not: creates <cms-tab-button>, appends to shadow root
```

### Why prototype patching, not MutationObserver?

MutationObserver cannot cross shadow DOM boundaries without explicitly observing each shadow root individually. Prototype patching is simpler and more reliable here because:

1. We hook into the exact lifecycle that HA uses to render
2. No timing races — `updated()` fires after rendering completes
3. The `requestAnimationFrame` delay handles any edge cases where the DOM isn't fully settled

This is the same technique used by `lovelace-card-mod` itself.

### Guard against double-injection

```typescript
// On the window
window.cardModStudio = { version, injected }

// On the prototype
proto._cmsPatched = true
```

If the plugin loads twice (e.g. two resource URLs), the second load detects `window.cardModStudio` and skips. If two CMS versions try to patch the prototype, `_cmsPatched` prevents double-patching.

---

## What the milestone looks like

When Phase 1 is complete:
1. Install `card-mod-studio.js` as a Lovelace resource
2. Open any card in edit mode
3. The card editor appears with a **🎨 Style** button in its header area
4. Clicking the button opens a panel showing:
   - "Card-Mod Studio v0.1.0 — Phase 1" header
   - Warning banner if card-mod is not installed
   - The current card config (JSON, for debugging)
   - A list of planned features (placeholder)
5. Clicking the button again hides the panel
6. The native editor still works normally — our button does not break anything

---

## Known limitations in Phase 1

- **No visual controls yet** — the panel is a placeholder. Controls come in Phase 3.
- **No config round-trip** — reading or writing card_mod YAML is Phase 2 and 4.
- **Injection point may need tuning** — the fallback selector list covers common HA layouts. After testing on a real instance, the primary selector (`div.action-items`) may need to be updated based on what's actually in the shadow DOM. See [docs/DEVELOPMENT.md](DEVELOPMENT.md#debugging-injection-issues).
- **Card type coverage** — Phase 1 does not distinguish between card types. The button appears on all card editors.

---

## Testing checklist

Manual testing steps to verify Phase 1 on a real HA instance:

- [ ] Build succeeds: `npm run build` → `dist/card-mod-studio.js` exists
- [ ] No TypeScript errors: `npm run typecheck`
- [ ] Resource loads: browser console shows `[Card-Mod Studio] v0.1.0 loaded`
- [ ] card-mod detection works: console shows either detected or warning
- [ ] Injection fires: console shows `hui-card-element-editor patched successfully`
- [ ] Style button appears on light card editor
- [ ] Style button appears on button card editor
- [ ] Style button appears on sensor card editor
- [ ] Style button appears on tile card editor
- [ ] Clicking button shows the panel
- [ ] Clicking button again hides the panel
- [ ] Panel shows current card config JSON
- [ ] Native editor still functions (YAML mode, save, cancel all work)
- [ ] No JS errors in console during normal editing

---

## Next: Phase 2

Phase 2 adds the YAML parser — when you open the style panel on a card that already has a `card_mod` block, the parser reads it and populates the internal state. This is the foundation for the visual modules in Phase 3.

See the full plan in [card-mod-visual-editor.md](../card-mod-visual-editor.md).
