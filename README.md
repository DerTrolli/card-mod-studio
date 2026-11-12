# Card-Mod Studio

[![hacs_badge](https://img.shields.io/badge/HACS-Default-blue.svg)](https://github.com/hacs/integration)
[![GitHub Release](https://img.shields.io/github/v/release/dertrolli/card-mod-studio)](https://github.com/dertrolli/card-mod-studio/releases)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-☕-ff5e5b?logo=ko-fi&logoColor=white)](https://ko-fi.com/dertrolli)

A visual GUI editor for [card-mod](https://github.com/thomasloven/lovelace-card-mod) CSS styles in Home Assistant. Also works with [UIX](https://uix.lf.technology/), card-mod's integration-based successor.

Instead of hand-writing YAML + CSS + Jinja2 templates, Card-Mod Studio gives you color pickers, sliders, and animation presets — and generates the correct `card_mod`/`uix` YAML automatically.

<img src="images/01%20Style%20button.png" alt="Style button in the card editor" width="1024">

📖 **Detailed documentation lives in the [Wiki](../../wiki)** — module-by-module
reference, per-card support details, and troubleshooting. This README is the
overview.

> **Enjoying Card-Mod Studio?** A ⭐ on GitHub helps others find it — and if it
> saved you an evening of CSS frustration, you can
> [☕ buy me a coffee](https://ko-fi.com/dertrolli). It's built with a lot of
> paid AI tooling, so coffees go straight back into development.
> Bug or feature wish? [Open an issue](../../issues) — requests are just as
> welcome as bug reports. [More ways to help ↓](#support-the-project)

---

## What it does

Card-Mod Studio adds a **🎨 Style button** to the Home Assistant card editor. Clicking it opens a two-column style panel alongside the native editor — no separate page, no copy-pasting YAML.

- **Left column** — scrollable list of style modules, each collapsible
- **Right column** — always-visible live card preview that updates as you change settings, shown on your theme's own dashboard background

The panel follows your theme in light and dark mode and works on phones: below ~720px panel width the preview stacks under the controls, and the Style button turns icon-only on narrow screens so HA's dialog footer fits. Every control has a name for screen readers, every collapsible section and switch works from the keyboard (Tab, then Enter/Space; a colour swatch row is one Tab stop, moved with the arrow keys), and touch targets are larger on touch screens.

**Not sure which control styles what?** Just point at it: hovering any part
of the preview shows a highlight box naming the control that styles that
element ("Icon Color", "Font", "Entity Rows — Living room lamp", …), and
clicking jumps straight to it. A part that nothing styles names the card's
Background (or Border or Visual Filters where Background is hidden). The
preview stays safe — clicks and keys never reach your real entities.

<img src="images/02%20Card-Mod%20Studio.png" alt="Card-Mod Studio panel" width="1024">

All changes are serialised to `card_mod` YAML and saved with the card config through HA's normal save flow. If you open a card that already has hand-written `card_mod` (or `uix`) CSS, the panel reads it back and pre-fills the controls.

### UIX support

[UIX](https://uix.lf.technology/) is a card-mod-derived Home Assistant integration built by card-mod's own current maintainer. It reads a `uix:` key in preference to `card_mod:`, but fully supports `card_mod:` as a fallback — so **Card-Mod Studio writes `card_mod:` by default even when UIX is installed**, and it just works. The only time it writes `uix:` instead is when UIX is detected and card-mod is not (UIX's own installer refuses to run alongside a `card-mod.js` resource, so this is the common "UIX-only" case). Either way, the panel reads back whichever of `uix:`/`card_mod:` is actually present — including cards you styled by hand — and the "not detected" warning only shows when neither engine is found.

If you switch back from UIX to card-mod-only, card-mod never reads `uix:` at all, so a card styled only under `uix:` would otherwise go silently unstyled. The panel warns about that specific card and offers a one-click "copy to `card_mod:`" fix for plain CSS. `uix:` blocks using UIX-only macros/billets get a clear incompatibility warning instead — card-mod can't run those under any key, so there's no fix to offer, just a heads-up.

---

## Style modules

### Icon Color & Accent Color

Set a static color for the card's icon or accent, choose separate colors for when the entity is **on** vs **off**, or — on light cards — let the icon automatically reflect the light's actual `rgb_color` attribute.

The on/off condition doesn't have to come from the card's own entity: a **"Controlled by"** picker lets any toggleable entity drive the colors — e.g. a button card's icon reflecting a separate status sensor.

On tile, entity, sensor, and picture-glance cards (and on Mushroom and Bubble Card — see below) the module also offers an **icon size** slider — static, or reacting to a state/value condition with a fallback size (icon grows while the alarm is armed). It's only offered where the size variables verifiably reach the main state icon.

The Accent Color override targets the correct CSS variable per card type: `--tile-color` for tile cards, `--gauge-color` for gauges (including needle mode), and `--state-icon-color` for everything else (calendar and history-graph cards get the variables HA 2026.10 reads there; **Mushroom** takes it as the card's active colour and **Bubble's slider button** as the slider fill — see [Mushroom](../../wiki/Mushroom-Cards) and [Bubble Card](../../wiki/Bubble-Card)). It's only offered on cards that actually use the accent colour (see [Card-type awareness](#card-type-awareness)).

<img src="images/03%20Accent%20and%20Icon%20Color.png" alt="Icon and accent color controls" width="618">

### Background

Apply a **solid color** or a **gradient** (with configurable angle) as the card background. Optionally restrict the background to only show when the entity is **on** or **off** — useful for making a card visually "glow" when a device is active.

<img src="images/04%20Background%20Color.png" alt="Background color module" width="618">

### Threshold Colors

The most powerful module. Define numeric rules that change visual properties based on a sensor's live value — no coding required.

Each rule has three parts:
- **Operator** — `<` `<=` `>` `>=` `==` `!=`
- **Value** — the numeric threshold to compare against
- **Color** — the color to apply when the rule matches

You can add as many rules as you need, plus a **default color** that applies when no rule matches. At runtime, card-mod/UIX evaluates the rules as a Jinja2 ternary chain against the live sensor state.

Beyond the basics:
- **Any entity** — the rules can read a different entity than the card's own.
- **Any numeric attribute** — a "Value read from" selector switches the source from the entity's state to one of its numeric attributes (e.g. `battery_level`, `current_temperature`).
- **One rule set, several properties** — tick multiple target properties and they all follow the same rules (e.g. icon *and* accent color changing together).
- **Fade mode** — instead of discrete steps, define value→color points and the color blends smoothly between them, clamped at the ends. Your actual points are restored when you reopen the editor.

<img src="images/07%20Threshold%20Fade.png" alt="Threshold Colors in Fade mode" width="630">

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
- **Opacity** — fade the whole card
- **Transition duration** — control how smoothly state changes animate (milliseconds; lower is faster)

Brightness/blur/opacity can also **react to a state or value condition** — e.g. blur + fade a camera card only while it's off, or while a sensor crosses a threshold.

### Animation

Add a looping CSS animation to the card. Available presets:

| Animation | Effect |
|---|---|
| Pulse | Scale up and down rhythmically |
| Breathe | Soft opacity fade in and out |
| Gradient-shift | Slowly shift the background gradient colors |
| Bounce | Periodic vertical bounce |
| Blink | Abrupt on/off flash |
| Shake | Quick horizontal shake |
| Spin | Continuous rotation (constant speed) |
| Glow | Pulsing glow around the card |
| Heartbeat | Double-beat scale, like a heartbeat |

Animation is offered on nearly every built-in card. A preset that cannot work on a card is left out of its list: Spin on the thermostat, humidifier, light and map (it makes the handle or the map drift away from the pointer), Gradient Shift where there is no card background to shift (picture cards, iframe, map, media control, Bubble Card, the Mushroom title card). The **Duration** slider is seconds per cycle — lower is faster.

Each animation can run **always**, only while the entity is **on**/**off**, while **another entity** is on — or only **while a value matches** (entity or numeric attribute + operator + threshold): *pulse while the freezer is above -10°, glow while `battery_level` < 15*.

### Border

Round the card corners with a configurable **corner radius**, and optionally add a colored **border** with adjustable width. The border can also **react to a state or value condition** — e.g. a 3px red border only while the freezer is above -10°, with an optional thinner fallback border otherwise. Works well combined with Threshold Colors targeting border color.

### Font

Text size, weight, family (including a custom free-text family), and color for almost any card — closing the gap for cards that aren't headings. Where a card overrides fonts internally, the module emits the card-specific companion selectors/variables needed so the setting actually lands: the light card's name/brightness text, the button card's label, the sensor/entity card's name *and* value (the value scales proportionally), the gauge and thermostat titles, tile-card text, and the card **title** of list-style cards (entities, glance, calendar, …).

**Number size** (v0.11): on gauge and thermostat cards the Font module also sizes the big number HA draws deep inside the card — the gauge's value (50–130 % of HA's own size, 100 % being exactly what Home Assistant draws) and the thermostat's temperature (24–96px). It has its own switch inside the Font module and is written only while Font is on; it is written as a shadow-piercing (dictionary-form) style that the Studio keeps editable. On cards that size their own text (area, humidifier, picture-entity, picture-glance, weather, date, alert) the text-size slider is hidden, and the weight row is hidden on area, date and alert; the rest stay. A Font control you leave alone writes nothing — each starts as "Default" showing the card's own value.

<img src="images/12%20Gauge%20Number%20Size.png" alt="Number size on a gauge card" width="1024">

*Gauge card: the Font module's Number size row makes the value number bigger.*

<img src="images/09%20Font%20and%20Palette.png" alt="Font module and the Color Palette Manager" width="618">

### Heading Style

For `heading` type cards: control text size, weight, font family (with the same Custom… option as the Font module), text color, icon size, icon color, and text alignment — all from one module. Works on both **Title** and **Subtitle** headings, and on HA 2026.10's new heading markup (heading styles written by older versions are migrated the first time you open and save the card).

### Advanced CSS

A raw CSS editor for anything the visual modules don't cover. Your CSS is appended after the generated styles and supports full `card_mod`/`uix` syntax including sub-element selectors and Jinja2 templates. A line under the editor warns when the text would break the card: an unbalanced brace, a Jinja block that is never closed, an unterminated tag, comment or string, each with its line number. Nothing is blocked.

### Style presets

Save the full style configuration of any card as a **named preset** and restore it on any other card in one click. Presets are stored per-user in HA's backend (`frontend/get_user_data`) so they sync automatically across every device and browser logged in as the same HA user. localStorage is also written as an instant local fallback.

### My Color Palette

Define named custom colors once and they appear as extra swatches in **every** color picker — card-level modules, threshold rules, and per-row controls alike. You can also override the built-in default ON/OFF colors that a freshly-enabled Icon Color/Accent Color module (and every new threshold rule) starts from. Stored per HA user, same cross-device sync as presets. Cards keep the colour they were given: changing or removing an entry doesn't restyle cards that already use it. A change made while Home Assistant can't be reached is kept and sent later.

---

## Styling the cards inside a stack

Vertical-stack, horizontal-stack, and grid cards show **one styling section per child card**, each with the full module set for that child's card type — a gauge child gets the gauge treatment, a tile child the tile treatment, and an entities-card child even gets its per-row section. Changes are written into that child's own `card_mod:`/`uix:` block inside the stack config — exactly the YAML you'd get styling it standalone — and the live preview shows the whole stack update as you edit.

<img src="images/08%20Stack%20Children.png" alt="Per-child styling sections on a vertical stack" width="1024">

Not covered yet: containers nested inside containers, and `conditional` cards.

---

## Entities card per-row styling

For `type: entities` cards, Card-Mod Studio adds a dedicated section for each entity row in the list.

<img src="images/05%20Entities%20Card.png" alt="Entities card styling" width="618">

Each row can be styled independently:
- **Icon color** — static color, or threshold rules based on the row entity's numeric value
- **Text color** — static color, or threshold rules
- **Font** — a per-row text size/weight override, layered on top of the card-level Font module

The threshold rules per row work identically to the card-level Threshold Colors module: define operators, values, and colors, set a default, and card-mod/UIX evaluates the Jinja2 at runtime against that specific entity's state.

Row headers are labelled the way HA labels the row itself (on HA 2026.11 and newer: device name + entity name; older HA falls back to the row's `name:`, the friendly name, then the entity id).

Both row forms work — `- entity: sensor.x` and the plain-string shorthand `- sensor.x` (a string row is converted to the object form only when it actually gains styling). The same rows section also appears for an entities card nested inside a stack.

<img src="images/06%20Entities%20Card%20Modifications.png" alt="Per-entity modifications" width="630">

---

## Card-type awareness

The panel adapts to the card type so you never see irrelevant controls:

- **Container cards** (`grid`, `vertical-stack`, `horizontal-stack`) — per-child styling sections (see above); other containers (`sections`, `conditional`) show an explanatory banner
- **Heading cards** — replaces icon/accent controls with the Heading Style module
- **Light cards** — Icon Color gains an automatic mode that mirrors the light's actual color
- **Entities cards** — hides card-level Icon Color and Accent Color, and offers Threshold Colors for the card frame only (Background, Text Color, Border Color); icon and text colours per row live in the rows section
- **Mushroom and Bubble Card (new in 0.11, beta)** — the 14 Mushroom state cards, the template, chips and title cards (the empty card has nothing to style, so it offers no controls), and Bubble's button (incl. slider button), separator and cover get controls that reach their own parts (Font → primary/secondary text or name/state, icon size, Accent → the active colour, or a Bubble slider's fill); controls with nothing to reach are hidden, and the card's own Bubble `styles:` is preserved untouched. Other Bubble card types and unknown custom cards still show every module, with a notice that some controls may not reach the card. Per-card guides: [Mushroom](../../wiki/Mushroom-Cards) · [Bubble Card](../../wiki/Bubble-Card)
- **Data-viz / media cards** — hides Icon Color where it has no effect; Animation is offered on nearly every built-in card, with the presets that cannot work left out (Spin on thermostat, humidifier, light and map; Gradient Shift where the card has no background)
- **ON/OFF choices** — not offered on cards without an entity, or for entities that are never on or off (lock, cover, alarm panel, person, timer, input button); climate and water heater offer OFF only
- **Picture / iframe cards** — hides Background and Font modules
- **Accent Color** is only offered where a card actually draws with the accent colour (tile, gauge, entity, sensor, thermostat, media, calendar, history graph, …) — not on button, light, glance, markdown, picture, date, alert and similar cards; **Font's text colour** is hidden where a card colours its own text (HA 2026.11's date and alert cards included)
- **Threshold Colors** offers exactly the colours the matching modules offer on that card

<img src="images/10%20Mushroom%20Card.png" alt="Card-Mod Studio on a Mushroom light card" width="1024">

*Mushroom light card: Font, Icon Color and Accent each change the preview.*

<img src="images/11%20Bubble%20Card.png" alt="Card-Mod Studio on a Bubble slider button" width="1024">

*Bubble slider button: Accent colors the slider fill.*

Every module was checked on every built-in card type, with card-mod and with UIX, by switching it on and comparing the rendered card pixel by pixel — anything that changed nothing is hidden on that card (full table: [`docs/CARD_SUPPORT_MATRIX.md`](docs/CARD_SUPPORT_MATRIX.md)).

---

## Requirements

- Home Assistant **2025.9 or newer**, 2026.2 or newer recommended — fully tested on 2026.9 and 2026.10, also tested on 2026.11 (see [Compatibility](#compatibility))
- [card-mod](https://github.com/thomasloven/lovelace-card-mod) or [UIX](https://uix.lf.technology/) must be installed and working
- The Marketplace (HA 2026.11 or newer) or HACS (older HA), for installation

Card-Mod Studio **generates** the YAML. card-mod/UIX **applies** it. One of the two is required.

---

## Installation

### Via the Marketplace (HA 2026.11 and newer)

Home Assistant 2026.11 folds HACS into core as the **Marketplace**; a separate
HACS install is no longer possible there, and existing HACS installs migrate
automatically (custom repositories and update entities carry over).

1. Open the Marketplace → search for **Card-Mod Studio**
2. Click it → install
3. The Marketplace installs the plugin into `www/community/card-mod-studio/`
   and adds it as a dashboard resource
4. Reload the browser (Ctrl+Shift+R)

> If your dashboard resources are in **YAML mode**, add the resource manually
> (see [Manual](#manual)).

### Via HACS (HA before 2026.11)

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
   - URL: `/local/card-mod-studio.js?v=0.11.0`
   - Type: JavaScript Module
4. Reload the browser (Ctrl+Shift+R)

> **Cards unstyled after a reload?** If styled cards show up unstyled after a
> page reload and come right after you navigate away and back, card-mod is
> loading after the first cards (as a plain dashboard resource it can).
> card-mod's own installation advice avoids this: load it through
> `frontend: extra_module_url` in `configuration.yaml` and restart Home
> Assistant, for example for a HACS install:
>
> ```yaml
> frontend:
>   extra_module_url:
>     - /hacsfiles/lovelace-card-mod/card-mod.js
> ```
>
> (`/local/card-mod.js` for a copy in `config/www/`; remove card-mod from the
> dashboard resources, and update the URL by hand when card-mod updates.) See
> [Installation](../../wiki/Installation) and the
> [FAQ](../../wiki/Troubleshooting-FAQ).

---

## Usage

1. Open any card in edit mode (click the pencil icon)
2. Look for the **🎨 Style** button in the card editor footer (icon-only on narrow screens)
3. Click it to open the style panel
4. Adjust controls — changes are previewed live on the right
5. Click **Save** as normal in the HA editor

---

## Compatibility

| HA Version | Engine | Status |
|---|---|---|
| 2026.11 | card-mod 4.2.1, UIX 9.0.0 | ✅ **Tested** — v0.10.2 targets **2026.11.0** (the first release with the Marketplace); the test rigs run HA 2026.11.0 with UIX v9.0.0 (UIX 9.0 requires HA ≥ 2026.11.0), and v0.11.0-beta.2 was verified there with card-mod and with UIX, including Mushroom 5.2.3 and Bubble Card 3.4.3 (module-effect audit: 0 controls without effect; click-to-edit 24/24). **v0.11.0-beta.3** was verified on HA 2026.11.0 with card-mod 4.2.1 and with UIX 9.0.0 (Mushroom 5.2.3, Bubble Card 3.4.3) with real mouse, keyboard and touch input through the real card editor: card-mod rig 21 of 21 checks, UIX rig 19 of 19; functional UI check 489 of 489 on the card-mod rig and 491 of 491 on the UIX rig; click-to-edit 24 of 24 on both; module-effect audit on card-mod: built-in cards 0 controls without effect (1 inconclusive), Mushroom and Bubble Card 0; on UIX: Mushroom and Bubble Card 0, built-in cards 1 (the history-graph line-colour timing, see the [wiki](../../wiki/Graph-and-Data-Cards)); visual check in light and dark at six screen sizes (360 px to 1920 px) found no clipped element, no touch target under 24 px on phones and no low-contrast text **v0.11.0** was verified there with the release build on both engines: read-back check 6/6, check suite 21/21 (card-mod) and 19/19 (UIX), every control 489/489 and 491/491. |
| 2026.9 – 2026.10 | card-mod 4.2.1, UIX 8.3.1 | ✅ **Fully tested** — v0.10.0 was live-verified on **2026.9.4** and **2026.10.0b0**, each with card-mod and with UIX (v0.10.1 re-checked on the **2026.10.4** release): every control in the real card editor, every module on every built-in card type, light and dark mode, six screen sizes from phone to desktop |
| 2026.2 – 2026.8 | card-mod 4.2.1 | 🟡 **Partially tested** — quick checks on **2026.2.3** and **2026.6.4**: every module's controls in the real card editor (397/397 checks each), the scripted live checks, and a light/dark × desktop/phone visual pass (all clean). v0.11.0-beta.3 was additionally verified on **2026.2.3** with real input (Enter no longer saves and closes the dialog there; tile, gauge, entities rows, thresholds, Mushroom, Bubble Card, conditional Background and Animation apply, survive a reload and read back; sliders are laid out and named correctly). UIX 8.x itself needs HA ≥ 2026.8, so UIX was only tested on the versions above **v0.11.0** on 2026.2.3: read-back check 6/6; the functional check passes 470 of 489 (18 misses are a page error this HA version raises from its own page transitions, 1 is the Save button being enabled on a mixed-form card whose config is unchanged; both the same with beta.3). |
| 2025.9 – 2026.1 | card-mod 3.4.5 | 🟡 **Partially tested** — quick checks on **2025.9.4**: the Style button, live preview, colour pickers, entity pickers, presets and saving work (392/397 functional checks — the 5 misses are the gap below), the scripted live checks pass apart from the gaps below and the visual pass is clean. Known gap: on tile cards the Font module doesn't change the tile's name/state text there (HA added the tile text variables Studio uses after 2025.9) — everything else on the tile, and Font on other cards, works. **Correction:** earlier versions of this table also said the gauge Accent colour doesn't recolour the arc on 2025.9.4; that was wrong — it does (`ha-gauge { --gauge-color: … !important }`), the threshold gradient recolours it live, and so does the needle (confirmed again with v0.11.0-beta.3, verified on 2025.9.4 with card-mod 3.4.5, Mushroom 5.2.3 and Bubble Card 3.4.2 with real input: Enter no longer saves and closes the dialog there; tile, gauge, entities rows, thresholds, Mushroom, Bubble Card, conditional Background and Animation apply, survive a reload and read back; sliders are laid out and named correctly) **v0.11.0** on 2025.9.4: read-back check 6/6; functional check 458 of 466 (the 5 tile Font misses of the gap above, the Save button on a mixed-form card as on 2026.2.3, and 2 steps the check itself cannot drive reliably there). |
| Older than 2025.9 | — | ❌ **Not supported** — on 2025.3 the Style button doesn't appear (HA's older card-editor dialog), so Card-Mod Studio is only offered from 2025.9 (`hacs.json` declares 2025.9.0 as the minimum) |

Card-mod compatibility follows card-mod's own compatibility table. See [card-mod releases](https://github.com/thomasloven/lovelace-card-mod/releases).

| Engine | Version tested | Status |
|---|---|---|
| card-mod | 4.2.1 (3.4.5 on HA before 2026.2) | ✅ Fully tested on HA 2026.9.4 and 2026.10.0b0, and tested on 2026.11.0; quick-checked on 2026.6.4 and 2026.2.3 (4.2.1) and 2025.9.4 (3.4.5 — card-mod 4.2.1 needs HA ≥ 2026.2). 4.2.1 is still the newest card-mod release, but it is effectively unmaintained — see the caveat below. See [`docs/COMPATIBILITY_AUDIT.md`](docs/COMPATIBILITY_AUDIT.md) |
| Mushroom | 5.2.3 | 🧪 **Beta** — v0.11.0-beta.2 verified on HA 2026.11.0 with card-mod 4.2.1 and UIX 9.0.0: all 18 Mushroom card types audited, 0 controls without effect. v0.11.0-beta.3 re-verified on HA 2026.11.0 with both engines (module-effect audit: all 18 types, 0 controls without effect) and with real input on HA 2026.2.3 and 2025.9.4 **v0.11.0:** audit repeated with the release build, 0 controls without effect on both engines. |
| Bubble Card | 3.4.3 | 🧪 **Beta** — v0.11.0-beta.2 verified on HA 2026.11.0 with card-mod 4.2.1 and UIX 9.0.0: button, slider button, separator and cover audited, 0 controls without effect. v0.11.0-beta.3 re-verified on HA 2026.11.0 with both engines (module-effect audit: the 4 kinds, 0 controls without effect; Bubble Card 3.4.2 on HA 2025.9.4) and with real input on HA 2026.2.3 and 2025.9.4 **v0.11.0:** audit repeated with the release build, 0 controls without effect on both engines. |
| UIX | 8.3.1, 8.4.0, 9.0.0 | ✅ Tested against a real running integration in Docker — v0.10 with UIX 8.3.1 on HA 2026.9.4 and 2026.10.0b0, v0.11.0-beta.1 with UIX 8.4.0 on HA 2026.10.4, and v0.10.2 and v0.11.0-beta.2 with UIX 9.0.0 on HA 2026.11.0 (note: UIX 8.x itself requires HA ≥ 2026.8.0, UIX 8.4.0 requires HA ≥ 2026.10.0 and UIX 9.0.0 requires HA ≥ 2026.11.0; the `uix:`/`card_mod:` styling contract is unchanged from 7.x), see [`docs/COMPATIBILITY_AUDIT.md` §9](docs/COMPATIBILITY_AUDIT.md) and [`tools/sandbox/run-uix.sh`](tools/sandbox/run-uix.sh). v0.11.0-beta.3 was verified with UIX 9.0.0 on HA 2026.11.0: check suite 19 of 19, functional UI check 491 of 491, click-to-edit 24 of 24; module-effect audit 0 controls without effect on Mushroom and Bubble Card, and 1 on the built-in cards (Threshold "Accent Color" on the history graph — the line-colour timing, not a dead control) **v0.11.0** was verified with UIX 9.0.0 on HA 2026.11.0 (suite 19/19, every control 491/491, read-back check 6/6). |

> **card-mod caveat — consider UIX:** card-mod 4.2.1 still works with Card-Mod Studio on the HA versions above, but it is effectively unmaintained: on HA ≥ 2026.8 it hangs if your active *theme* defines `card-mod-*-yaml` variables ([card-mod #606](https://github.com/thomasloven/lovelace-card-mod/issues/606), [#617](https://github.com/thomasloven/lovelace-card-mod/issues/617)). If your theme does, [UIX](https://uix.lf.technology/) is a drop-in replacement for card-mod, and Card-Mod Studio supports both equally.

> **Note on HA updates:** Card-Mod Studio injects into the card editor using the `hui-dialog-edit-card` element. If a HA update renames this element, the Style button will not appear and a console warning will be shown. Check [GitHub Issues](../../issues) for status after major HA releases.

> **YAML-mode dashboards (HA 2026.8+):** HA 2026.8 removed the ability to enter edit mode on `mode: yaml` dashboards entirely — the visual card editor (and therefore the Style button) can only be opened on normal storage-mode dashboards there. Cards on YAML dashboards keep rendering their existing `card_mod:`/`uix:` styling unchanged.

---

## Limitations

- **card-mod or UIX required** — this plugin generates YAML; it does not apply CSS itself
- **Common card types prioritised** — standard HA cards are fully supported; Mushroom (5.2.3) and Bubble Card (3.x: button incl. slider button, separator, cover) are supported in beta; other Bubble card types and other custom cards have varying shadow DOM paths, still show every module (with a notice) and may need the Advanced CSS editor
- **Mushroom and Bubble specifics** — Mushroom's Accent needs an exact colour (hex, rgb, hsl, a colour name or a palette colour) and is hidden while the card sets its own `icon_color`; an Accent picked from the palette is stored as a fixed colour and doesn't follow a later theme change. Details: [Mushroom](../../wiki/Mushroom-Cards) · [Bubble Card](../../wiki/Bubble-Card)
- **Entity-state conditionals only** — the UI supports on/off entity state conditions and numeric threshold rules; complex Jinja2 logic goes in the Advanced CSS editor
- **Pierced entries are preserved, not visually edited** — on a dictionary-form (`$` shadow-piercing) style, the `.` entry is fully editable through the visual controls (since v0.10.0), while every other entry (pierced `selector$` chains, nested dicts, UIX `$$`/`&` keys) is shown read-only in Advanced CSS and preserved byte-identically on every save. Only *mixed-form* styling — a plain style on one key plus a *different* dictionary on the other, or a dictionary whose `.` entry isn't plain CSS — stays frozen behind a lock banner (preserved exactly, just not editable here). Dict-form entities rows are editable too. See [ROADMAP.md](docs/ROADMAP.md).
- **Glance icon color** can't be changed at all: HA colors it inline from entity state inside a nested shadow root, and even shadow-piercing styles don't reach it.
- **No UIX-exclusive features** — macros, billets, and Forge (UIX's own visual template builder) aren't generated by this tool; see [ROADMAP.md](docs/ROADMAP.md) for why and what's planned

---

## Support the project

Card-Mod Studio is free and always will be. If it saves you time, two
things genuinely help:

- **⭐ Star the repo** — stars are how people discover HACS projects, and
  the clearest signal that this is worth continuing.
- **☕ [Buy me a coffee on Ko-fi](https://ko-fi.com/dertrolli)** — this
  project is built and live-tested with a lot of (paid) AI tooling against
  real Home Assistant instances, so a coffee quite literally goes right
  back into development.

  [![Ko-fi](https://img.shields.io/badge/Ko--fi-Support%20development-ff5e5b?logo=ko-fi&logoColor=white)](https://ko-fi.com/dertrolli)

**💡 Found a bug — or wishing for a feature?** Both belong in the same
place: [open a GitHub issue](../../issues). Feature requests are just as
welcome as bug reports (a lot of what's in the Studio today — the Font
module, styling cards inside stacks, per-row fonts — started as someone's
issue), and I'll get right on it.

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
│   │                       card_mod:/uix: cross-compatibility checks,
│   │                       per-card capability lookup (card-caps.ts)
│   └── profiles/           Mushroom and Bubble Card profile data
└── types/                  Shared TypeScript interfaces
test/                       Vitest unit tests, e.g.
├── parser.test.ts          Parser pipeline
├── generator.test.ts       Generator pipeline
├── dom-helpers.test.ts     card-mod/UIX detection probes
├── style-compat.test.ts    Cross-compatibility checks
└── …                       card gating, Mushroom/Bubble profiles, audits
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
| 15 | Stack child styling — per-child styling sections (full module set) for vertical-stack/horizontal-stack/grid, written into each child's own config | ✅ v0.8.0 |
| 16 | Font module — text size, weight, family, and color for most cards (not just headings), with per-card companion selectors for light/button/sensor/gauge/thermostat/list-card titles + per-row fonts | ✅ v0.8.0 |
| 17 | Color Palette Manager (custom colors in every picker + ON/OFF default overrides) + attribute-based thresholds + form-editor "Key 'uix' not expected" shim + bare-string row styling | ✅ v0.8.0 |
| 18 | UX consistency pass — identical controls/labels/behavior for the same concept everywhere (Heading ↔ Font parity, row-font sliders, unified threshold builders, one styled-dot) | ✅ v0.8.0 |
| 19 | Migration robustness — "custom CSS is overriding this control" warnings (card + row level), safe adoption of equivalent hand-written/legacy phrasings, audited old-version round-trips, verified card-mod→UIX switch | ✅ v0.8.1 |
| 20 | Click-to-edit preview picker (hover-highlight any element, jump to its control) + 4 new animation presets + value-conditional animations ("pulse while sensor.x > 30") | ✅ v0.9.0 |
| 21 | Correctness release — dict-form data-loss guard + full-codebase audit (14 reproduced bugs fixed, ~2,900 fuzzed round-trips) | ✅ v0.9.1 |
| 22 | Dict-form (`$` shadow-piercing) styles editable — `.` entry through the full module pipeline, every pierced entry preserved byte-identically (cards, stack children, entities rows) | ✅ v0.10.0 |
| 23 | Release polish — light/dark/phone-ready editor UI, HA 2026.10 heading compatibility (Heading Style on HA's `--ha-heading-card-*` variables, Subtitle headings), hand-written-CSS audit (20 reproduced bugs fixed), real-dialog functional + visual QA of every control (entity-row icon colours while on, HA YAML-editor sync, and more), a per-card audit that hides every control without a visible effect, re-verified on HA 2026.9.4/2026.10.0b0 with card-mod 4.2.1 and UIX 8.3.1, quick-checked back to HA 2025.9 | ✅ v0.10.0 |
| 24 | Font → Number size for the gauge value (50–130 %; the betas before beta.3 went up to 150 %) and the thermostat big number (Studio-owned shadow-piercing entries); HA 2026.10 fixes for filter transitions and calendar/history-graph accent | ✅ v0.11.0 (beta.1, beta.2) |
| 25 | Mushroom (5.2.3) and Bubble Card (3.x: button, slider button, separator, cover) support via per-card profiles, click-to-edit for their parts, entities-card row labels follow HA 2026.11 naming, Alert card gating | ✅ v0.11.0 (beta.2; Mushroom and Bubble Card support stays a beta) |
| 26 | Release-review round: controls you switch on but don't touch write nothing (Heading Style, Font, Icon Color incl. a "Keep the card's colour" mode); a conditional Background/Border keeps the card's own look while off; no entity-based conditions on entity-less cards or for entities that are never on/off; gauge Number size 50–130 % with 100 % = Home Assistant's size; Animation on nearly every built-in card (presets left out where they can't work), card-level Threshold Colors on the entities card, Icon Color on the statistic card, a per-card maximum icon size; Font reaches more text; a notice on custom cards without a profile; Advanced CSS, colour and number input checks; keyboard, screen-reader and touch work; click-to-edit for more card parts; palette and presets keep changes made while Home Assistant is unreachable; Enter no longer saves the dialog on HA 2025.9–2026.2 | ✅ v0.11.0 (beta.3; verified on four rigs, see Compatibility) |
| 27 | Read-back fixes found by replaying 217,000 styles of every release since v0.8.1 and by fuzzing: a Font without a size next to Threshold Colors and Threshold rules pointing both ways are read back into their modules; hand-written `!important`, `border-radius: 0px`, `border: 0px solid …` and heading-card selectors on other cards are no longer rewritten on save (cards and entities rows); repeatable checks in `tools/continuity/` | ✅ v0.11.0 |

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
