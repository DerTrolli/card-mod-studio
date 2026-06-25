# Card × Setting Support Matrix (empirical)

**Generated:** 2026-06-25 · **Against:** Home Assistant 2026.x + card-mod 4.2.1
**Method:** real cards rendered in a real HA instance, each `card_mod` setting
applied by real card-mod, verdict = did the target element's **computed style**
actually change vs baseline. Reproduce with [`tools/sandbox`](../tools/sandbox/README.md).

This is ground truth measured by the testing sandbox — it supersedes the
hand-authored assumptions in `CARD_TYPE_PLAN.md` where they disagree.

---

## Matrix

| card | icon_color | accent_color | background | border_radius | border | filter |
|---|---|---|---|---|---|---|
| tile | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| entity | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| glance | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| sensor | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| gauge | — | — | ✅ | ✅ | ✅ | ✅ |
| light | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| thermostat | — | — | ✅ | ✅ | ✅ | ✅ |
| humidifier | — | — | ✅ | ✅ | ✅ | ✅ |
| alarm-panel | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| media-control | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| weather-forecast | — | — | ✅ | ✅ | ✅ | ✅ |
| history-graph | — | — | ✅ | ✅ | ✅ | ✅ |
| markdown | — | — | ✅ | ✅ | ✅ | ✅ |
| heading | — | — | ❌ | ✅ | ❌ | ✅ |
| entities | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| button | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |

**Legend:** ✅ measurably changed · ❌ applied but no effect · — no such element to measure.

### What each column applies (the CSS the tool emits)

| setting | CSS | measured on |
|---|---|---|
| `icon_color` | `ha-state-icon { color: … !important }` | `ha-state-icon` `color` |
| `accent_color` | `ha-card { --accent-color/--tile-color/--gauge-color/--state-icon-color/--paper-item-icon-active-color: … }` (no `!important`) | `ha-state-icon` `color` |
| `background` | `ha-card { background: … }` | `ha-card` `background-color` |
| `border_radius` | `ha-card { border-radius: … }` | `ha-card` `border-top-left-radius` |
| `border` | `ha-card { border: …px solid … }` | `ha-card` `border-top-width` |
| `filter` | `ha-card { filter: grayscale(100%) }` | `ha-card` `filter` |

**Caveats:** `icon_color`/`accent_color` are measured **on the icon**. So `—` means
"no icon element," and `accent_color` specifically measures *"does accent reach the
icon."* For gauge/thermostat, accent still colors the arc/ring — not captured here.

---

## Findings & recommended changes

### 1. Accent color is broadly ineffective as shipped (HIGH)
`accent_color` = ❌ on tile, entity, glance, light, alarm-panel, media-control,
button. The tool emits `--tile-color` / `--state-icon-color` etc. **without
`!important`**, and these cards set those variables **inline** from entity state,
so card-mod's stylesheet rule loses. Verified fix: with `!important` the tile icon
goes orange→red (`rgb(255,164,82)`→`rgb(255,0,0)`).
→ **`accentColorDecls()` in `css-generator.ts` should emit `!important`** on the
color variables.

### 2. `heading` doesn't honor background or border (MEDIUM)
`heading` = ❌ for `background` and `border` (only `border_radius` and `filter`
work). But `CARD_TYPE_PLAN.md` lists heading as "Keep: Background, Border," and the
panel still shows the Background module for heading cards.
→ **Hide Background/Border for `heading`** (add to the relevant `NO_*` sets), or
re-target a real heading element.

### 3. `glance` icon color doesn't work (MEDIUM)
`ha-state-icon { color: … !important }` does not recolor glance icons, yet the
panel offers Icon Color for glance (not in `NO_ICON_COLOR_TYPES`).
→ **Hide icon color for `glance`, or re-target** the glance icon element/variable.

### 4. `media-control` icon color *does* work, but the tool hides it (LOW)
`media-control` is in `NO_ICON_COLOR_TYPES` yet `icon_color` = ✅.
→ Consider **allowing** icon color for `media-control`.

### 5. `entities` card-level icon color = ❌ (confirms design)
Card-level `ha-state-icon { color }` doesn't reach entity rows — which is exactly
why the tool styles entities **per-row**. No change; validation of the approach.

### 6. ha-card-level styling is the reliable foundation
`background` / `border_radius` / `border` / `filter` work on essentially every
card (heading bg/border excepted). These are safe defaults across card types.

---

## Notes for re-running

- 15 card types mount cleanly standalone and are measured programmatically; the
  `button` card needs a real dashboard (see `tools/sandbox/harness/button_matrix.mjs`).
- To extend: measure accent on the gauge arc / thermostat ring, and add
  `threshold` / `animation` / `heading-style` settings. See the sandbox README.
