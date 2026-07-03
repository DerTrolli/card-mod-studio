# Development Guide

This document explains how to set up a local development environment and test Card-Mod Studio against a real Home Assistant instance.

---

## Prerequisites

| Tool | Minimum version | Notes |
|---|---|---|
| Node.js | 18 | 20 LTS recommended |
| npm | 9 | Comes with Node |
| Home Assistant | 2024.4.0 | Any install method works |
| card-mod **or** UIX | card-mod 4.x / [UIX](https://uix.lf.technology/) 7.x | One of the two must be installed in HA — see [README's UIX section](../README.md#uix-support) |

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

Unit tests live in `test/`. Run with:

```bash
npm test
```

Tests use Vitest and cover the pure logic layer: the CSS/YAML generator, the
parser, the card-mod/UIX detection probes, and the card_mod:/uix:
cross-compatibility checks. UI injection and real-DOM rendering are **not**
covered by Vitest (no jsdom/happy-dom in this project) — they're verified
against a real Home Assistant + real card-mod/UIX instance in Docker instead.
See [`tools/sandbox/README.md`](../tools/sandbox/README.md) — `run.sh` for
card-mod, `run-uix.sh` for UIX. Both produce real computed-style measurements
and screenshots, not simulated ones.

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

### Data flow

```
User adjusts UI control in cms-panel
  → module emits state-changed event
  → cms-panel collects all module states
  → css-generator.ts builds CSS string
  → dom-helpers.ts: isCardModInstalled() / isUixInstalled() probe the environment
  → yaml-generator.ts: pickOutputKey() picks card_mod (default) or uix
      (only when UIX is installed and card-mod is not)
  → yaml-generator.ts: applyCardModStyle() wraps the CSS in that key,
      and clears the *other* key's .style — not syncs it — since the state
      it was built from was already merged from both keys on open (below),
      so the other key is redundant by the time this runs. Left untouched
      instead if it's a uix: block using macros/billets, which can't be
      safely parsed or determined redundant.
  → cms-panel fires config-changed CustomEvent
  → HA's editor picks this up → marks card as modified
  → User clicks Save → HA saves the config
  → card-mod/UIX reads card_mod.style or uix.style → applies CSS
```

Reading works the other way: `yaml-parser.ts`'s `parseCardModConfig()` reads
`config.uix?.style ?? config.card_mod?.style` (`resolveStyle()`, the same
precedence UIX itself uses) for the *single-key* case. But cms-panel.ts's
`_buildMergedState`/`_buildMergedRowStyle` go further — when **both** keys
carry real content (e.g. left over from switching card-mod ↔ UIX, or edited
separately under each), they parse both independently and merge them
(`mergeStudioStates`/`mergeEntityRowStyles` in `state-mapper.ts`): the active
key (per `pickOutputKey()`) wins per-module on conflicts, a module only
enabled under the *inactive* key fills the gap. This is what lets the next
save consolidate to one key without losing a setting that only lived under
the other one.

A related parser subtlety worth knowing when touching `css-parser.ts`: the
same selector can legally appear in more than one block in a single style
(e.g. a static default in one `ha-card { }`, later overridden by a
conditional value in a second `ha-card { }`) — real CSS treats the later
declaration of a repeated property as the one that renders. `parseCss`
coalesces same-selector blocks (and de-dupes repeated properties within one
block) this way *before* any module recognizer sees them, so `findTarget`
picking "the" target for a selector is always looking at the fully-merged,
actually-live view — not just the first block that happened to match.

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

### `position: fixed` popovers inside the dialog

Any UI that pops out of normal flow with `position: fixed` (like
`cms-color-picker`'s compact-mode popover) has to account for two properties
of HA's card-edit dialog that a component's own shadow DOM doesn't shield it
from:

1. **The native `<dialog>` (nested `ha-dialog` → `wa-dialog` → `<dialog>`,
   two shadow roots deep) carries a CSS `transform`.** It's an identity
   matrix with no visible effect, but per the CSS spec *any* transform
   value other than `none` still establishes a new containing block for
   `position: fixed` descendants — so `top`/`left` computed from
   viewport-relative `getBoundingClientRect()` coordinates get applied
   relative to the dialog's own top-left corner instead, and get clipped
   by its `overflow: hidden`.
2. **The dialog is shown via `showModal()`**, which promotes it to the
   browser's "top layer" — nothing outside that layer can paint above it,
   regardless of z-index. Escaping #1 by rendering into a portal on
   `document.body` fixes the positioning but makes the popover invisible,
   hidden behind the modal.

`cms-color-picker.ts`'s `_ensurePortal`/`findModalDialogAncestor` is the
reference implementation: find the nearest open modal `<dialog>` ancestor by
walking the *flattened* tree (piercing shadow hosts and `<slot>`
assignments — a plain `parentElement`/`closest()` walk misses both), append
the popover portal as that dialog's direct child when found (keeping it in
the top layer), and compute position relative to the dialog's own rect
instead of the viewport's. Falls back to `document.body` +
viewport-relative positioning when there's no dialog ancestor (e.g. a
component mounted standalone, as in the sandbox's `palette_check.mjs`).

**This is untestable with a standalone-mounted panel.** Any check that does
`document.createElement('cms-panel')` straight onto `document.body` has no
`<dialog>` ancestor at all, so it can't exercise either problem above —
`tools/sandbox/harness/dialog_popover_check.mjs` opens the *real* HA dialog
(overflow menu → Edit dashboard → a card's Edit link → Style tab) instead,
and verifies the popover is genuinely clickable at its rendered position
(piercing shadow roots via nested `elementFromPoint` calls), not just
present in the DOM — a purely positional/`getBoundingClientRect()` check
can't tell "on-screen" apart from "on-screen but painted behind the modal".

### `<ha-entity-picker>` needs a real ancestor, not just `.hass`

Every entity field in the panel (`cms-entity-picker.ts`) wraps HA's own
`<ha-entity-picker>`. As of HA 2026.6/2026.7, that component no longer reads
`hass`/registries/i18n off a plain `.hass` property internally — it consumes
them via `@lit/context` (`@consume({ context: statesContext, subscribe: true })`
and similar for registries/i18n/config). Context-request events bubble up
the DOM looking for a provider; HA's provider lives on `<home-assistant>`
itself. Setting `.hass` is still required (it's a real, separate property
the component also reads directly), but it's no longer sufficient on its
own — the element also has to be a genuine DOM descendant of
`<home-assistant>` for those `consume()` calls to resolve at all.

Mount a bare `<ha-entity-picker>` (or anything containing one) directly on
`document.body` — the pattern every check script in this directory used
before v0.7.0 — and its own `render()` throws (`_i18n`/`_registries` stay
`undefined`) on the very first paint; Lit doesn't clear old content on a
failed render, and there is no old content yet, so it renders as an empty
shadow root: present in the DOM, completely invisible, no error surfaced
anywhere except the browser console. Confirmed by mounting the same bare
element both ways in a throwaway script — identical `.hass`, only the
ancestor differed. This doesn't affect the real product (`cms-injector.ts`
always injects into HA's own dialog element, itself already a descendant of
`<home-assistant>`) — it's purely a test-mounting concern.
`tools/sandbox/harness/entity_binding_check.mjs` appends its mount host to
`document.querySelector('home-assistant')` instead of `document.body` for
exactly this reason; any future check exercising an entity/device/area
picker needs the same.

### Real card-mod silently drops a whole style block if a `{`/`}` appears in *any* declaration's value — even a quoted string

Gradient mode (`v0.7.0-beta.3`) needed to smuggle its real anchor points
through the generated CSS so reopening the editor could recover them —
see `encodeGradientStops` in `css-generator.ts`. The first attempt encoded
them as JSON in a custom property: `--cms-gradient-stops: '[{"v":0,...}]';`.
This is entirely valid CSS — the braces sit safely inside a single-quoted
string, which a spec-compliant CSS tokenizer treats as opaque text, exactly
like this project's own `css-parser.ts` already does (see its
brace-depth-counting note in `splitIntoBlocks`).

Real card-mod doesn't care that it's spec-valid. Its own style-string
parsing (not the browser's CSS parser — this happens before the string
ever reaches a `<style>` tag) silently failed to apply *any* declaration in
the block the moment that property was present — not just the malformed
one, the `color: {{ ... }}` declaration right next to it too. No console
error, no warning, nothing — `card_mod`/`uix` info logs still show
"detected", the config still validates, the dialog still shows a preview
pane; the only symptom is the icon/background/whatever just never changes
color, which reads exactly like a logic bug in the generated Jinja rather
than a parsing failure two layers away.

**This is invisible from source reading and even from this project's own
unit tests** — `parseCss`/round-trip tests only exercise *this project's*
parser, which correctly tolerates the braces (that's what made the bug
look safe). It only shows up by mounting a real `<hui-card>` with the
generated style and reading `getComputedStyle` — and even then, reliably
seeing it requires `await customElements.whenDefined('hui-card')` before
creating the element and *polling* for the computed color to settle
(card-mod's Jinja render is an async server round-trip with real latency
variance) rather than a fixed `setTimeout` — a fixed sleep produces
inconsistent pass/fail noise that looks like flakiness and masks the real,
fully-reproducible signal underneath it. Isolating the exact trigger took
bisecting single-character-class variants (`'#fff'` alone vs `'a:b'` vs
`'50:#fff,100:#000'` vs the full JSON) against a live instance —
`tools/sandbox/harness/gradient_uix_compat_check.mjs` is the permanent
regression check, and it verifies the full real pipeline (Studio UI →
generated CSS → real `<hui-card>` render → `getComputedStyle`), not just
that `parseCss` can read the marker back.

The bug was specific to card-mod's own parsing, but the fix was also
independently verified against a real UIX install
(`gradient_uix_only_compat_check.mjs`, against `run-uix.sh`'s rig) rather
than assumed safe by similarity — UIX is a separate reimplementation, not
literally card-mod's code, so passing against one doesn't guarantee the
other.

Fixed by encoding the marker as a brace-free `value:color,value:color,...`
string instead of JSON — same information, no braces anywhere. **Any
future marker/metadata smuggled through generated CSS must avoid `{` and
`}` in its encoding entirely**, regardless of how safely quoted it looks.

### A raw `<hui-card>` test only applies style under the key the *installed engine* actually reads — get it wrong and everything "silently fails"

`run.sh`'s sandbox has card-mod installed, not UIX. `run-uix.sh`'s has UIX,
not card-mod (they can't coexist — UIX's own config flow aborts setup if it
detects a `card-mod.js` resource). A raw `card.config = { ..., uix: { style
} }` on `run.sh`'s rig is never read by anything — card-mod only looks at
`card_mod:`. This produces exactly the same *symptom* as the JSON-braces
bug above (icon never changes color, no error anywhere) for a completely
unrelated reason, and it's easy to fall into while iterating quickly on a
debug script, since `cms-panel` itself parses *either* key regardless of
which engine is installed (that's it correctly supporting both card-mod
and UIX users) — so state built through the Studio's own UI still looks
completely correct, and only the final real-render check silently no-ops.
**A trivial `color: red !important` under the wrong key fails to render
too** — if even that doesn't show up, suspect the config key before
suspecting the generated CSS. `preset_stale_state_check.mjs` was itself
written with this exact mistake mid-investigation and briefly "confirmed" a
product bug that didn't exist — caught by noticing a completely inert
sanity-check style also failed, which a *real* bug in gradient generation
specifically could never cause.
