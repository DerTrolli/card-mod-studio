# Card × Setting Support Matrix (empirical)

**Generated:** 2026-06-25 · **Against:** Home Assistant 2026.x + card-mod 4.2.1
**Version note (v0.10.0, 2026-10-04):** the *current* per-card gating is the
module-effect audit section right below (re-measured 2026-10-04, every card ×
every module, both engines). The older single-property cells further down
were measured in 2026-06 and are kept for their findings. The v0.10.0 release was
live-verified on HA 2026.9.4 and HA 2026.10.0b0, each with card-mod 4.2.1 and
with UIX 8.3.1 (full live-check suite + real-dialog visual QA) — see
[COMPATIBILITY_AUDIT.md §11](COMPATIBILITY_AUDIT.md). The one HA 2026.10 change
that affects this table's subject matter is the heading card's new markup
(note under finding #2). **Later changes** (v0.10.2 → v0.11.0-beta.3: Font size
gating, the date and alert cards, Mushroom and Bubble Card, and the beta.3
changes to Animation, Threshold, Icon Color and Font) are summarised in
[Changes since v0.10.0](#changes-since-v0100-v0102--v0110-beta2) and
[Modules per card after beta.3](#modules-per-card-after-v0110-beta3) below.
In the table directly below, the ⚠️ Animation cells, the entities card's
Threshold cells and the statistic Icon Color cell are **out of date**: those
modules are offered now.
**Method:** real cards rendered in a real HA instance, each `card_mod` setting
applied by real card-mod, verdict = did the target element's **computed style**
actually change vs baseline. Reproduce with [`tools/sandbox`](../tools/sandbox/README.md).

> ⚠️ **Methodology caveat — standalone mount vs real dashboard.** The bulk of
> this matrix mounts each card standalone via `document.createElement('hui-card')`,
> which is fast but can diverge from a real dashboard: the `button` card *errors*
> standalone yet renders fine in a view. **Treat standalone results as a lead, not
> a verdict.** Decisions that changed code were re-verified in a real
> `sections`/`grid` dashboard (`tools/sandbox/harness/dash_verify.mjs`); those are
> marked ✔︎ verified below. Single-property measurements can also mislead — see
> the accent-color correction.

This is the current, empirically-measured source of truth for per-card-type
support — earlier speculative planning docs it superseded have been retired.

## v0.10.0 module-effect audit (2026-10-04) — the current gating

`tools/sandbox/harness/module_effect_audit.mjs` re-measured **every module on
every built-in card type** (31 types, card-mod 4.2.1 AND UIX 8.3.1, HA
2026.9.4): it mounts the real panel, switches each module on through the
panel's own state → generator path, and compares the rendered preview
**pixel by pixel** (computed styles are recorded for diagnosis; pixels that
change on their own — graphs, camera images — are masked). Chart/list cards
carry a title, as real ones usually do (their graph labels are drawn on a
canvas, so the title is the text a colour can reach).

Result after the v0.10.0 gating changes: **0 controls shown without a visible
effect on either engine.** `font:color` = Font's colour picker alone (Font
already on); `thr:*` = each Threshold "Apply to" option.

✅ shown + works · ⚠️ hidden but would change pixels · `·` hidden, no effect
(the module/option isn't offered there)

| card | font | filter | accent-color | icon-color | background | animation | border | heading-style | thr:icon-color | thr:accent-color | thr:background | thr:text-color | thr:border-color | font:color |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| alarm-panel | ✅ | ✅ | · | ✅ | ✅ | ⚠️ | ✅ | · | ✅ | · | ✅ | · | ✅ | · |
| area | ✅ | ✅ | · | · | ✅ | ✅ | ✅ | · | · | · | ✅ | · | ✅ | · |
| button | ✅ | ✅ | · | ✅ | ✅ | ✅ | ✅ | · | ✅ | · | ✅ | ✅ | ✅ | ✅ |
| calendar | ✅ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ |
| entities | ✅ | ✅ | ⚠️ | · | ✅ | ✅ | ✅ | · | · | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ |
| entity | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | · | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| gauge | ✅ | ✅ | ✅ | · | ✅ | ⚠️ | ✅ | · | · | ✅ | ✅ | ✅ | ✅ | ✅ |
| glance | ✅ | ✅ | · | · | ✅ | ✅ | ✅ | · | · | · | ✅ | ✅ | ✅ | ✅ |
| heading | ⚠️ | ✅ | · | · | · | ⚠️ | · | ✅ | · | · | · | · | · | · |
| history-graph | ✅ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ |
| humidifier | ✅ | ✅ | · | · | ✅ | ⚠️ | ✅ | · | · | · | ✅ | ✅ | ✅ | ✅ |
| iframe | · | ✅ | · | · | ⚠️ | ⚠️ | ✅ | · | · | · | ⚠️ | · | ✅ | · |
| light | ✅ | ✅ | · | ✅ | ✅ | ⚠️ | ✅ | · | ✅ | · | ✅ | ✅ | ✅ | ✅ |
| logbook | ✅ | ✅ | · | · | ✅ | ⚠️ | ✅ | · | · | · | ✅ | ✅ | ✅ | ✅ |
| map | ⚠️ | ✅ | · | · | ⚠️ | ⚠️ | ✅ | · | · | · | ⚠️ | · | ✅ | · |
| markdown | ✅ | ✅ | · | · | ✅ | ✅ | ✅ | · | · | · | ✅ | ✅ | ✅ | ✅ |
| media-control | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | · | ✅ | ✅ | ✅ | · | ✅ | · |
| picture | · | ✅ | · | · | ⚠️ | ⚠️ | ✅ | · | · | · | ⚠️ | · | ✅ | · |
| picture-elements | ✅ | ✅ | · | · | ⚠️ | ⚠️ | ✅ | · | · | · | ⚠️ | · | ✅ | · |
| picture-entity | ✅ | ✅ | · | ⚠️ | ⚠️ | ⚠️ | ✅ | ⚠️ | ⚠️ | · | ⚠️ | · | ✅ | · |
| picture-glance | ✅ | ✅ | · | ✅ | ⚠️ | ⚠️ | ✅ | ⚠️ | ✅ | · | ⚠️ | ⚠️ | ✅ | · |
| sensor | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | · | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| statistic | ✅ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | · | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ |
| statistics-graph | ✅ | ✅ | · | · | ✅ | ⚠️ | ✅ | · | · | · | ✅ | ✅ | ✅ | ✅ |
| thermostat | ✅ | ✅ | ✅ | · | ✅ | ⚠️ | ✅ | · | · | ✅ | ✅ | ✅ | ✅ | ✅ |
| tile | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | · | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| todo-list | ✅ | ✅ | · | · | ✅ | ⚠️ | ✅ | · | · | · | ✅ | ✅ | ✅ | ✅ |
| weather-forecast | ✅ | ✅ | · | · | ✅ | ⚠️ | ✅ | · | · | · | ✅ | ✅ | ✅ | ✅ |
| entity-filter | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| vertical-stack | · | · | · | · | · | · | · | · | · | · | · | · | · | · |
| grid | · | · | · | · | · | · | · | · | · | · | · | · | · | · |

The ⚠️ cells are deliberate: **Animation** stays hidden on chart, dial,
gauge, keypad and picture cards (it interferes with their own rendering —
see the per-card wiki pages); **Font on heading** is covered by Heading
Style; **Background on picture/map/iframe** only shows at the image's edges;
the **entities card's** colours live in its per-row sections; Heading Style
is heading-only by design. Icon Color on `statistic`/`calendar`/
`history-graph` is a candidate for a later release.

Gating changes this produced (all in `src/utils/card-caps.ts`): Accent Color
hidden where nothing reads the accent colour (`NO_ACCENT_TYPES`), Font's
colour picker hidden where a card colours its own text
(`NO_TEXT_COLOR_TYPES`), Icon Color hidden on `area` / `picture-elements`,
Font hidden on `picture`, Threshold's options following the matching
module (`thresholdPropertyAllowed`), `entity-filter` treated as a container,
and Threshold Text Color gained the tile/title colour companions.

## Changes since v0.10.0 (v0.10.2 → v0.11.0-beta.2)

The tables above and below were measured for v0.10.0 (HA 2026.9.4 / 2026.10.0b0,
card-mod 4.2.1, UIX 8.3.1). Where later releases changed a gate, the **current**
answer is the code in `src/utils/card-caps.ts` (`capsFor` and the sets next to
it), summarised here. Verified on HA 2026.11.0 with card-mod 4.2.1 and UIX 9.0.0
unless noted.

| Card / control | Now | Since | Evidence |
|---|---|---|---|
| **Font → text size** on alarm-panel, area, humidifier, picture-entity, picture-glance, weather-forecast | hidden (`NO_FONT_SIZE_TYPES`); weight, family and, where allowed, colour stay | v0.10.2 (also listed under 0.11.0-beta.1) | module-effect audit `font:size` slice on HA 2026.6 and 2026.10.4 |
| **date** (new in HA 2026.11) | Icon Color, Accent Color, Font size, Font text colour hidden, and Threshold's icon / accent / text targets with them; Background, Border, Filters, Animation and Font weight/family stay | v0.10.2 | module-effect audit, UIX 9 |
| **alert** (HA 2026.11) | Accent Color, Font text colour and Threshold's accent / text targets hidden | v0.11.0-beta.2 | module-effect audit, HA 2026.11.0 + UIX 9.0.0 |
| **picture-glance** | no longer a header-title card: Font's header size/colour did nothing there | v0.10.2 | module-effect audit |
| **Filters → transition** | written with `!important` on tile, sensor, entity and area (`TRANSITION_IMPORTANT_TYPES`) | v0.10.2 | HA 2026.10 cards override a plain `transition` |
| **Accent on calendar / history-graph** | also writes `--primary-color` (calendar) / `--graph-color-1` (history-graph), which HA 2026.10 reads; the old variable stays for older HA | v0.10.2 | live check on HA 2026.10.4 |
| **gauge → Font → Number size** | 50–130 % since beta.3 (100 % = Home Assistant's own size; beta.1 and beta.2 went to 150 %); **thermostat → Temperature size** 24–96px; both written as Studio-owned shadow-piercing entries, only while Font is on | beta.1 / beta.2 / beta.3 | `pierce_check.mjs` |

The matrix at the top of this file is a dated measurement (v0.10.0): it has no
`date` or `alert` rows. A re-run of the full audit on the 2026.11 rig is in
`tools/sandbox/harness/module-effect-audit-{card-mod,uix}-2026.11.0.md`.

## Modules per card after v0.11.0-beta.3

The release-review round re-measured individual cells with real input on HA
2026.11 (card-mod 4.2.1 and UIX 9.0.0, per card against an unstyled twin). The
current answer is always `capsFor` in `src/utils/card-caps.ts` and the profiles
in `src/utils/profiles/`. <!-- QA-PENDING: beta.3 verification result -->

| Card / control | Now (beta.3) | Evidence |
|---|---|---|
| **Animation** | Offered on every built-in card except heading (no painted box), energy-distribution, energy-usage-graph, activity, webpage and shopping-list (never measured). Newly offered: alarm-panel, calendar, gauge, history-graph, humidifier, iframe, light, logbook, map, media-control, picture, picture-elements, picture-entity, picture-glance, statistic, statistics-graph, thermostat, todo-list, weather-forecast | real pointer input while every preset ran: keypad, calendar, more-info dialogs, tooltips, logbook, to-do tick, media buttons all still work |
| Animation presets left out per card (`noAnimationPresets`) | **Spin** on thermostat, humidifier, light (the handle drifts ~40° from the pointer) and map (it pans the map); **Gradient Shift** wherever Background is hidden (picture, picture-entity, picture-glance, picture-elements, iframe, map) and, for custom cards, on every Bubble profile (the painting element isn't the animated one) and the Mushroom title card | measured; a stored preset stays listed, and loading a preset drops one the card can't use |
| **entities** → Threshold Colors | offered for the card frame: Background, Text Color, Border Color (source entity picked by the user); Icon Color and Accent stay off | both engines |
| **statistic** → Icon Color | offered: colour and size 12–64px (its one icon, `ha-state-icon`); Accent still works too, Icon Color's colour wins | measured, 2026.11 |
| Icon size slider maximum (`iconSizeMax`) | tile 36px; picture-glance 40px; Mushroom classic and template 56px; Bubble button/slider/cover 50px (56px with a large layout), separator 40px (33px); everything else 64px | measured; a larger stored size stays visible |
| Icon Color mode **Keep the card's colour** | offered on cards with an Icon size slider (tile, entity, sensor, statistic, picture-glance, Mushroom, Bubble); the default for a newly enabled module there | design note `docs/research/2026-11-unset-controls-design.md` |
| **ON / OFF conditions** | not offered without an entity of its own, and never for lock, cover, alarm_control_panel, person, timer, input_button; OFF-only for climate and water_heater; humidifier, siren, remote count as on/off (`NEVER_ON_OFF_DOMAINS`, `OwnStateKind`) | HA state lists |
| **Font → weight** | hidden on area, date and alert (`NO_FONT_WEIGHT_TYPES`); on glance, todo-list, shopping-list, logbook, history-graph, statistics-graph, calendar, alarm-panel and markdown it reaches the title through `--ha-font-weight-normal`, which also changes other text of those cards | measured: logbook +73 elements, graphs +24, calendar +360, alarm-panel +20 |
| **Font → text size** | hidden on area, humidifier, picture-entity, picture-glance, weather-forecast, date and alert (alarm-panel offers it again: its title follows the header variables) | module-effect audit |
| **Font** on button, statistic, humidifier, picture-glance | button: the state line follows size (0.7875×) and colour; statistic: name/value/unit like sensor; humidifier: mode label weight; picture-glance: title weight | measured per row |
| **Threshold → Text Color** on markdown and alarm-panel | also writes `--ha-card-header-color` (the title); alarm-panel's Text Color target stays hidden | `css-generator.ts` threshold `text-color` |
| **markdown** with `text_only` | Background, Border and Threshold background / border colour written `!important` (HA's `.text-only` rule outranks a plain one) | both engines, sections and masonry |
| **alert** → Filters transition | needs `!important` (`TRANSITION_IMPORTANT_TYPES`); Font text size hidden | measured |
| **tile** → Icon size | a glyph above 24px also writes the circle (`--tile-icon-size`, 1.5×) | measured |
| **media-control** → Background / Threshold background | to be confirmed by QA: with a `playing` player the artwork covered the card and changed no pixel; check with a paused or idle one | test-rig audit finding |
| Mushroom → Icon Color / Accent / Font | hidden where the card's own options remove the target (`icon_type: none`, `hide_icon`, both text lines none, `icon_color` for Accent); a stored Accent is kept and re-written | measured on both engines |
| Mushroom → Text size | writes matching line heights (primary 20/14×size, secondary 1.17×size, title 32/24×size, `--chip-height` above 36px); never below the native lines | measured |
| Bubble → Background / Border | Background on `.bubble-container` for a slider (under the fill), Border and radius on the container for button, slider, cover (radius `!important` so the large layouts obey); Font hidden when neither name nor a state line shows; Icon Color hidden with `show_icon: false` | measured on Bubble 3.4.3 |

### Custom cards (v0.11.0-beta.2, beta)

Per-card profiles in `src/utils/profiles/mushroom.ts` and `bubble.ts`, answered
through the same `capsFor` lookup. Measured on **Mushroom 5.2.3** and
**Bubble Card 3.4.3** (HA 2026.11.0, card-mod 4.2.1 and UIX 9.0.0, identical);
evidence in `docs/research/2026-10-v0.11.md` §3.3.1 and
`tools/sandbox/harness/module-effect-audit-custom-*-2026.11.0.md` (0 dead
controls, 0 hidden-but-working). ✅ shown · `·` hidden. Filters are shown on
all of them except Mushroom's empty card.

| card (profile key) | font | icon color | accent | threshold | background | border | animation | notes |
|---|---|---|---|---|---|---|---|---|
| Mushroom classic ×14 (`custom:mushroom-<type>-card`: alarm-control-panel, climate, cover, entity, fan, humidifier, light, lock, media-player, number, person, select, update, vacuum) | ✅ primary + secondary text | ✅ colour + size | ✅ — hidden when the card config sets `icon_color` | ✅ (Accent target follows Accent) | ✅ | ✅ | ✅ | Accent writes `--rgb-state-*` triples; off/idle/unknown left alone |
| `custom:mushroom-template-card` | ✅ (as tile) | ✅ colour + size | ✅ (as tile) | ✅ | ✅ | ✅ | ✅ | styled like a tile (`emitAs: 'tile'`); icon size rides on `ha-tile-icon` |
| `custom:mushroom-chips-card` | ✅ size/weight/family, no text colour | size only | · | background / border targets only | ✅ chip background | ✅ chip border | ✅ | chip icons can't take a colour |
| `custom:mushroom-title-card` | ✅ title only, with colour | · | · | text colour only | · | · | ✅ | no painted box, no icon |
| `custom:mushroom-empty-card` | · | · | · | · | · | · | · | renders no `ha-card`; every module hidden |
| `custom:bubble-card/button` | ✅ name + state | ✅ colour + size | · | · | ✅ `.bubble-button-background` (+ opacity 1) | ✅ on the same box | ✅ | `ha-card` is transparent |
| `custom:bubble-card/button/slider` (`button_type: slider`) | ✅ | ✅ | ✅ slider fill only | · | ✅ | ✅ | ✅ | click on the fill opens Background (known limit) |
| `custom:bubble-card/separator` | ✅ name only | ✅ | · | · | ✅ `.bubble-separator` | ✅ | ✅ | no entity; radius written with `!important` |
| `custom:bubble-card/cover` | ✅ | ✅ | · | · | ✅ `.bubble-background` | ✅ | ✅ | buttons only, no slider |
| any other Bubble `card_type`, or no `card_type`; any other custom card | all modules | | | | | | | no profile: every module stays offered, with a notice in the panel since beta.3 |

Precedence against a Bubble card's own `styles:` (probe B3, both engines): at
equal specificity the Studio's rule wins (card-mod's `<style>` comes later);
a user `!important` beats a plain Studio rule; a more specific user selector
with `!important` beats the Studio's `!important`; a plain user rule loses to
the Studio's `!important`. The `styles:` key itself is never written.

> **UIX note (v0.6.0):** this matrix was measured against card-mod, but the CSS
> the Studio generates is identical either way — UIX applies the same
> `ha-card`/`ha-state-icon` targets the same way card-mod does. These results
> hold for UIX installs too. See [COMPATIBILITY_AUDIT.md §9](COMPATIBILITY_AUDIT.md)
> and `tools/sandbox/run-uix.sh` for UIX-specific verification (detection,
> precedence, fallback).

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

**Caveats:** the `icon_color` and `accent_color` columns are measured **only on the
icon** (`ha-state-icon` `color`). So `—` means "no icon element," and the
`accent_color` column answers *only* "does accent recolor the icon" — **not**
"does accent do anything." That distinction broke finding #1 below.

---

## Findings & recommended changes

### 1. ~~Accent color is broadly broken~~ — RETRACTED (the column was measuring the wrong thing)
The `accent_color` column shows ❌ for many cards, but that only means **accent
doesn't recolor the icon** — which is mostly *not what accent is for*. On a
`sensor` card the accent colours the **graph line**; on a `tile` it themes the
`--tile-color`. Verified against a real production dashboard: accent-coloured
sensor graphs render correctly with the current (no-`!important`) output.

An earlier attempt to "fix" this by stamping `!important` on the accent vars was
**reverted** because it is net-harmful: it only changes the icon on `tile`, does
nothing for entity/light/alarm/media (their icons live in a nested `state-badge`
shadow root card-mod can't reach), and it would **break the common dynamic-accent
pattern** — a static `--accent-color: X !important` block would override a later
threshold-driven `--accent-color: {{ … }}` block that has no `!important`.
→ **No generator change.** If static accent on tiles is ever wanted, it must also
make the threshold accent block `!important` so the dynamic value still wins.

### 2. `heading` doesn't honor background or border ✔︎ verified (real dashboard)
A heading card's `ha-card` has no painted box: background stays `rgba(0,0,0,0)` and
`border-top-width` stays `0px` when styled (`dash_verify.mjs`). The panel used to
show Background (and Border) for headings — dead controls.
→ **Done:** `heading` added to `NO_BACKGROUND_TYPES` and a new `NO_BORDER_TYPES`.
Heading styling stays available via the dedicated Heading Style module.

> **HA 2026.10 note (v0.10.0):** HA 2026.10 changed the heading title from
> `<p>` to `<h2 class="heading">` (`<h3>` for `heading_style: subtitle`), which
> broke the `.title p` selector the Heading Style module used. The module now
> drives size / color / weight through HA's `--ha-heading-card-*` variables on
> `.container` (family via `.content p, .content .heading`, icon via
> `.content ha-icon`), which work on HA 2026.9 and 2026.10 under both card-mod
> and UIX, and it now also reaches Subtitle-style headings. The
> background/border measurements above concern the card box and were not
> re-measured.

### 3. `glance` icon color doesn't work ✔︎ verified (real dashboard)
Glance renders its icon inside a nested `<state-badge>` shadow root, coloured
inline from state; six candidate selectors (`ha-state-icon`, `state-badge`,
`.entity`, `--state-icon-color`, `--paper-item-icon-color`, `--mdc-icon-color`) all
left it unchanged, and so did a real-dashboard re-test.
→ **Done:** `glance` added to `NO_ICON_COLOR_TYPES`. (Update, v0.10 cycle:
card-mod's nested shadow-piercing syntax was probed for glance on both engines
and does not reach the icon either — HA colors it with an inline per-state
style inside the badge's shadow root — so it stays a documented limitation.)

### 4. `alarm-panel` and `media-control` icon color *do* work, but were hidden ✔︎ verified
Both went white→red in a real dashboard, yet both were in `NO_ICON_COLOR_TYPES`.
→ **Done:** removed both from `NO_ICON_COLOR_TYPES` (plain mode is used for the
non-state `media-control`).

### 5. `entities` card-level icon color = ❌ (confirms design)
Card-level `ha-state-icon { color }` doesn't reach entity rows — which is exactly
why the tool styles entities **per-row**. No change; validation of the approach.

### 6. ha-card-level styling is the reliable foundation
`background` / `border_radius` / `border` / `filter` work on essentially every
card (heading excepted, per #2). These are safe defaults across card types.

---

## What changed in the tool from these findings

Only **panel module visibility** changed (which controls are shown per card type);
**no generated CSS changed**, so existing dashboards are unaffected:
- `heading`: Background + Border modules hidden (Heading Style remains).
- `glance`: Icon Color hidden.
- `alarm-panel`, `media-control`: Icon Color now shown.

## Notes for re-running

- 15 card types mount cleanly standalone and are measured programmatically; the
  `button` card needs a real dashboard (`button_matrix.mjs`). Use `dash_verify.mjs`
  to re-confirm any contested cell in a real `sections`/`grid` view.
- To extend: measure accent on the **graph line / gauge arc / thermostat ring**
  (not the icon), and add `threshold` / `animation` / `heading-style` settings.
