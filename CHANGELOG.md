# Changelog

All notable changes to Card-Mod Studio are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.11.0-beta.4] — 2026-11-11

Fourth beta of v0.11 "Reach": seven fixes to how the Studio reads a style
back when you open a card. Two of them concern styles the Studio wrote
itself (a module came back switched off, with its CSS under Advanced CSS);
five concern CSS you wrote by hand, which could change when the card was
saved. Only the first one is new in beta.3; the others are older (see each
entry). Styles the Studio wrote itself and read back correctly before are
read exactly as before.

They were found by three checks that do not go through the browser: styles
written by each released version's own generator (v0.8.1 to v0.11.0-beta.3,
217,000 of them) loaded and saved by this build; 92,000 random setting
combinations written and read back; and 30,000 random hand-written styles
loaded and saved untouched, comparing what the browser would apply before
and after. The checks are in `tools/continuity/` and can be re-run before
every release.

Verified on this build in the real card editor on Home Assistant 2026.11.0
with card-mod 4.2.1 and with UIX 9.0.0: a new check that opens cards carrying
each of the styles below, makes an unrelated change, saves and reads the
stored config passes 6 of 6 on both (on the beta.3 build it fails 5 of 6);
the automated check suite passes 21 of 21 (card-mod) and 19 of 19 (UIX); the
functional check of every control passes 489 of 489 (card-mod) and 490 of
491 (UIX: one step read Home Assistant's preset storage before the write had
arrived; that section passed four repeat runs and the step now waits). Not
repeated for this build, because only the reading of styles changed: the
module-effect audit, the visual checks and screenshots, and the runs on Home
Assistant 2025.9.4 and 2026.2.3. Unit tests: 3,178.

### Fixed

- **Font with only a family, weight or colour, next to Threshold Colors.**
  With Threshold Colors on the card's background, text or border, a Font that
  had no size set came back switched off after saving and reopening, its
  declarations listed under Advanced CSS. The card looked the same, but the
  Font controls were empty. New in beta.3, where an untouched Font size is no
  longer written. Opening such a card with this version reads the Font back.
- **Threshold Colors with rules pointing both ways** (for example
  "<= 10" together with ">= 1", where the second rule sorts in front of the
  first) came back switched off after saving and reopening, the expression
  kept under Advanced CSS, so the rules could no longer be edited. Since
  v0.10.0; v0.8 and v0.9 instead reordered such rules on the next save, which
  changed which rule matched first. The rules are now read back and written
  in the same order. The same applies to an entities-card row's icon and text
  thresholds.
- **Your own `!important` is no longer removed.** A hand-written declaration
  such as `ha-card { background: none !important; }` was taken over by the
  matching module and written back without `!important` on the next save.
  It now stays under Advanced CSS exactly as written whenever the module
  would write it back without the flag; the rest of the rule is still read
  into the modules. This applies to Background, Border & Radius, Visual
  Filters, Accent Color, Animation and Font on the built-in cards (the
  Mushroom and Bubble Card profiles already did this), and to the icon colour,
  text colour, size and weight of an entities-card row. A card that still
  has such a declaration now opens with that module switched off and the
  declaration under Advanced CSS; remove the `!important` there if you want
  the module to take it over. If you set the same property with a control
  instead, the module (or the row) shows the existing warning that your own
  CSS overrides it.
- **Heading Style no longer takes over rules on other cards.** A rule on
  `.title p`, `.container` or `.content ha-icon` was read as Heading Style on
  any card type and rewritten into the heading card's variables, where it had
  no effect: the styling was lost on the next save. Such rules are now read on
  the heading card only.
- **`! important` and `!IMPORTANT` are recognised.** CSS allows both. When
  the same property appeared twice for a selector, once with such a flag and
  once without, the Studio kept the plain one, which the browser ignores, and
  dropped the one it applies. Both spellings are saved as ` !important`.
- **`border-radius: 0px` and `border: 0px solid …` are kept.** Border &
  Radius read them but never writes a zero, so square corners or a removed
  outline disappeared on the next save; a border next to a zero radius got
  the 12px default radius. They now stay under Advanced CSS.
- **`background-size: 200% auto` is kept** next to an animation other than
  Gradient Shift. It was removed as if it were Gradient Shift's own
  declaration.

### Changed

- A markdown card writes its Background and Border with `!important` only
  while `text_only` is set. On a markdown card without `text_only`, such a
  declaration is therefore treated as your own and stays under Advanced CSS
  (it is written back unchanged and looks the same).

### Verified, nothing to fix

- Styles written by v0.8.1, v0.9.1, v0.10.0, v0.10.1, v0.10.2 and the three
  earlier betas load without an error; every difference after saving is one
  of the upgrades listed in the earlier changelog sections. Entities-card row
  styles of all those versions are written back byte-identically.
- No random hand-written style made the Studio fail or lose a referenced
  `@keyframes`; every style is stable after at most two saves.
- About 100 fast module switches, several hundred slider steps and fast
  typing in Advanced CSS in one session log no error and leave a valid style.
- Memory: with UIX 9.0.0, opening and closing the card editor 25 times leaves
  no growing number of Studio panels behind. With card-mod 4.2.1 on Home
  Assistant 2026.11, every opened card editor stays in memory together with
  its preview (about 0.5 MB each time) until the page is reloaded; this also
  happens with the Studio blocked from loading, so it is not caused by the
  Studio.
- Reading and writing takes 16 ms for a style of 100 rules and 0.4 s for
  1,000 rules; it grows quadratically, 5,000 rules take about 10 s.

## [0.11.0-beta.3] — 2026-11-11

Third beta of v0.11 "Reach" (plan: `docs/V0.11_PLAN.md`), the result of a
hands-on review of every card type with real mouse, keyboard and touch input.
Its biggest changes: a control you switch on but never touch no longer
overrides the card's own look, a conditional Background or Border no longer
strips the card while its condition is off, a style with an "Only while
entity is ON/OFF" choice no longer wipes itself on cards that have no
entity, and the Studio shows a notice on custom cards it has no profile for.
Animation, Threshold Colors and Icon Color reach more cards, Font reaches more
of the text, and the panel works with keyboard and screen reader. Read
**Changed** below before updating: a few styles saved with beta.2 or earlier
look or save differently now.

Verified with real mouse, keyboard and touch input through the real card
editor on four rigs: Home Assistant 2026.11.0 with card-mod 4.2.1 and with
UIX 9.0.0 (Mushroom 5.2.3 and Bubble Card 3.4.3 on both), Home Assistant
2026.2.3 with card-mod 4.2.1, and Home Assistant 2025.9.4 with card-mod 3.4.5.
The automated check suite passes (card-mod rig 21 of 21, UIX rig 19 of 19),
as does the functional check of every control (489 of 489 and 491 of 491);
the module-effect audit finds 0 controls without effect on the card-mod rig
(1 inconclusive) and, on the UIX rig, 0 on the Mushroom and Bubble cards and
1 on the built-in cards (see the history-graph note below).

### Added

- **A notice for custom cards the Studio has no profile for.** On a custom
  card other than the supported Mushroom and Bubble Card types (and on a
  Bubble card whose `card_type` is missing or not one of button, separator
  or cover), the panel says that some controls may not reach the card and
  that Advanced CSS always works. It also shows on such a card inside a
  stack. No control is hidden.
- **Icon Color: "Keep the card's colour".** A new colour mode that writes no
  colour, so you can change only the icon size. It is what a newly switched-on
  Icon Color starts in on cards that have an Icon size slider (tile, entity,
  sensor, statistic, picture-glance, Mushroom, Bubble Card).
- **Icon Color (colour and size) on the statistic card.** The card's one icon
  takes a fixed colour, and a size from 12 to 64px.
- **A maximum icon size that fits each card.** The Icon size slider stops
  where the card still fits the icon: 36px on the tile card (the icon's
  circle grows with it), 40px on picture-glance, 56px on Mushroom cards, and
  50px (56px with the large layout; 40px and 33px on a separator) on Bubble
  Card. Other cards keep 64px. A larger size already stored on a card stays
  visible, so you can see and reset it.
- **Animation on many more built-in cards:** alarm panel, calendar, gauge,
  history graph, humidifier, iframe, light, logbook, map, media control,
  picture, picture elements, picture entity, picture glance, statistic,
  statistics graph, thermostat, to-do list and weather forecast. The presets
  that cannot work are left out per card: Spin on the dial cards (thermostat,
  humidifier, light) and the map, where it makes the handle or the map drift
  away from your finger or pointer, and Gradient Shift wherever there is no
  card background to shift (the picture cards, iframe, map, media control, Bubble Card and
  the Mushroom title card). Loading a preset no longer brings back a preset
  the card cannot use. Animation stays hidden on heading, the energy cards,
  activity, webpage and shopping list.
- **Threshold Colors on the entities card, for the card as a whole:**
  Background, Text Color and Border Color, driven by an entity you pick. Icon
  Color and Accent stay off there; the per-row thresholds are unchanged.
- **Advanced CSS warns about text that would break the card:** an unbalanced
  `{` or `}`, an `{% if %}` (or `for`, `macro`, `set` …) block that is never
  closed or has no start, an unterminated `{{`, `{%` or `{#`, and an
  unterminated comment or string, each with its line number. Nothing is
  blocked or rewritten. When a style contains a top-level `{% … %}`
  statement, the panel now explains why every module is switched off: the
  whole style is kept as written in Advanced CSS.
- **Colour and number fields check what you type.** A colour field accepts one
  valid CSS colour (the Background value field also accepts an image or a
  list, a gradient stop a colour with positions) and tells you when what you
  typed is not valid, instead of saving it. Numeric fields in Threshold
  rules, fade points, value-triggered Animation and entity-row rules accept a
  decimal comma (`2,5`), refuse `1,000` instead of reading it as 1, and no
  longer turn an empty or invalid entry into 0: the previous value comes back
  when you leave the field.
- **Keyboard and screen reader.** Every switch, slider, selection list,
  colour field and the Advanced CSS editor now has a name a screen reader
  reads out. A module header is a button (it reads "Font", not the chevron
  and emoji) with its enable switch next to it. A colour swatch row is one
  Tab stop; use the arrow keys, Home and End to move along it. The live
  preview announces itself as not interactive and can no longer be reached
  with Tab. On touch screens, buttons, selection lists, fields and switches
  are at least 40px tall, and a vertical swipe that starts on a slider
  scrolls the panel instead of moving the slider. On Home Assistant 2025.9
  each slider is announced by its label rather than by its value. The compact
  colour popover takes keyboard focus when it opens (on the selected swatch,
  else the first), Tab and Shift+Tab move through its own controls, and
  tabbing out of either end closes it and returns focus to the swatch that
  opened it (a typed hex value is committed first); Escape, picking a swatch
  or committing a value also return focus there, while clicking elsewhere
  closes it without moving focus. Screen readers get it as a dialog named
  "<label>: Color picker". After Escape, Cancel or a save in the preset name
  field, focus returns to "Save preset", and the Save / Overwrite buttons are
  announced without their emoji. On touch screens "+ Add Rule" and
  "+ Add Point" are 40px high.
- **Click-to-edit covers more of the built-in cards.** Pointing at the text of
  the date, statistic, area, media control and picture cards now names the
  right control, a block of several text lines is hit per line, the
  picture-glance entity buttons name Icon Color, and the statistic icon names
  Icon Color. A part that nothing styles names the card's Background — or
  Border, or Visual Filters, where Background is hidden. In the entities card
  the hover label shows the row's own label ("Entity Rows — Living room
  lamp"), and a row that has no controls says so. Click-to-edit also follows
  what a Bubble Card shows: the slider fill names Accent, text only names
  Font over the words, and an empty part of the pill names Background.
- **Palette and presets keep a change made while Home Assistant is
  unreachable** (or before the page has connected) and send it later; if this
  browser's storage is full too, a note says the change will be lost on
  reload. The palette manager has a hex field next to every colour (and the
  ON/OFF defaults), and its help line says that cards keep the colour they
  were given — changing an entry does not restyle them.
- **Font: a hint when Threshold Colors is setting the text colour**, as other
  modules already did.
- **Stack children are named by what they are** ("Bubble slider", "Mushroom
  light") instead of `custom:bubble-card`.
- **Entities card row labels** are numbered when two rows share a name
  ("Lamp (1)", "Lamp (2)"), and section, divider and link rows say they have
  no styling controls.

### Changed

- **A control you switch on but do not touch writes nothing** (Heading Style,
  Font, Icon Color). Switching on Heading Style used to write every setting
  at the panel's defaults (24px, normal weight, primary colour, left
  alignment), which changed a heading card's own look at once; Font wrote
  16px, normal weight and the primary text colour; Icon Color wrote an
  ON/OFF colour even when you only wanted another icon size. Now each control
  starts as "Default" showing the card's own value, and only what you set is
  written; every control has a way back to "not set". Styles you already saved
  keep every value they contain — nothing changes for them. What does change:
  a module that is switched on with nothing set is not saved, so it opens
  switched off next time; and Mushroom and Bubble Card text that you resize
  with only a size set no longer also forces the weight to "normal".
- **"Only while entity is ON/OFF" no longer strips the card in the other
  state.** A conditional Background or Border used to say `none` when the
  condition was not met, so the card turned transparent or lost its border;
  now it keeps the card's own look (the Border's "Width otherwise" 0 means
  "card default"). An older style is recognised and written in the new form
  the next time you save the card. Filters and Animation are unchanged.
  A hand-written `else 'none'` in a Background or Border is read as the
  Studio's own and saved in the new form; the Studio can no longer express
  "no border while off".
- **Cards without an entity never get an entity-based condition.** On entities,
  glance, markdown, heading, picture, area, date and other cards that have
  no `entity:`, an "Only while entity is ON/OFF" choice (Background, Border,
  Animation, Filters including the Grayscale default) made the whole style
  disappear. Those choices are no longer offered; a style that was saved
  that way becomes "Always" the next time you save, and an ON/OFF icon or
  accent colour with no entity picked writes no colour until you pick one.
  Until you change something and save, an already broken card stays broken.
  (If you remove a card's entity in Home Assistant's own editor, its stored
  ON/OFF style stays broken in the same way until you change something in
  the Studio.)
- **ON/OFF choices follow what the entity can be.** They are not offered for
  entities that are never on or off (lock, cover, alarm panel, person, timer,
  input button) and only the OFF choice is offered for climate and water
  heater, whose state can be `off` but never `on`; a hint says so in Icon
  Color and Accent. Grayscale starts as "Always" where "only while OFF" can
  never match (for example sensor, gauge, input number and the entities listed
  above). A stored
  ON/OFF condition still shows and is not rewritten. Humidifier, siren and
  remote are now treated as on/off entities.
- **Gauge: Number size is 50–130 %, and 100 % is exactly the size Home
  Assistant draws.** It used to go up to 150 %, but past about 120 % a wide
  value reached the arc, and 100 % was about 10 % bigger than Home
  Assistant's own number. A beta.2 style loads at the same percentage and is
  rewritten the next time you save, so a number you set to 100 % looks about
  10 % smaller for wide values such as "123 °C", and anything above 130 %
  becomes 130 %. The control also follows the Font switch now: Number size
  (and the thermostat's Temperature size) is written only while Font is
  on; a style that already has one opens with Font switched on, and
  switching Number size on switches Font on. A preset with Font off keeps the
  card's own Number size.
- **Font reaches more of the text, so some existing Font styles look
  different after the next save.** Font now also reaches: the state line of
  the button card (sized at 0.7875 of the name, as Home Assistant does) and
  its colour; the name, value and unit of the statistic card; the title
  weight on glance, calendar, logbook, history graph, statistics graph,
  to-do list, shopping list, markdown and alarm panel; the humidifier's mode
  label weight; and the picture-glance title weight. Because an older Font
  style — or a hand-written `ha-card { color: … }`, `font-weight` or
  `font-family` that looks exactly like one — is loaded into the Font module,
  the next save adds these extra declarations. This is a known trade-off:
  for example the state line of a button card now takes the Font colour too,
  and the weight on the calendar, logbook and alarm panel changes more than
  the title (the calendar grid and events, the logbook entries, the alarm
  panel's state label and buttons). Text size and colour reach the title of
  markdown and alarm panel, as on the other list cards. Font's weight row is
  hidden on the area, date and alert cards and its Text size row on the
  alert card, where they changed nothing; a stored value stays visible so you
  can reset it. Threshold Colors' "Text Color" on markdown and alarm panel
  now recolours the card title as well.
- **Tile icon size and its circle.** A tile draws the icon in a circle; a
  size above 24px now enlarges the circle with it (three halves of the icon
  size), so a big icon no longer overflows. A tile you saved at a size above
  24px looks bigger after the next save.
- **Mushroom text size keeps the native line height.** A Mushroom card with a
  larger Text size no longer clips or overlaps its two lines, and a size at or
  below Mushroom's own (14px) leaves the card at its normal height. An older
  Text size style gets the new line heights when saved. Icon Color, Accent
  and Font are hidden on Mushroom cards whose options remove their target
  (`icon_type: none`, both text lines set to none, and so on), and an Accent
  you stored is kept when its control is hidden, where it used to be dropped
  on the next save.
- **Bubble Card.** Border radius now also works with the large layouts
  (`card_layout: large`, `large-2-rows`, and sections views). On a slider
  button, Background now sits under the fill so the fill stays visible, and
  the border is drawn around the whole card, where only a sliver of it
  showed; styles written by beta.2 are recognised and re-saved in the new
  form. Font is hidden only when neither the name nor a state line is shown
  (a card with `show_name: false` but a visible state line keeps it), and
  Icon Color and Icon size are hidden when `show_icon` is `false`.
- **Animation's "Speed" slider is now called "Duration"**, with the line
  "Seconds per cycle — lower is faster." Visual Filters' "Transition speed"
  slider is now "Transition duration" ("Milliseconds — lower is faster.").
  Nothing is stored differently.
- **Hand-written animations keep their keyframes.** An animation the
  Animation module does not recognise (for example an iteration count typed by
  hand) used to lose its `@keyframes cms-…` block on save, so the animation
  stopped. The block now stays with the style (also for entities rows and
  stack children).
- **Palette manager and presets.** Removing a palette colour or deleting a
  preset asks you to press the same button a second time, and disarms itself
  after a few seconds or on a click elsewhere. A preset is saved under an
  explicit "Overwrite" when its name already exists, and a new preset name is
  limited to 60 characters. The preset bar is not shown on a card that renders
  nothing.
- **Media control: Background is no longer offered.** The card paints its
  own colour block (the theme's primary colour, or the artwork; greyed while
  off) over its whole face in every player state (playing with and without
  artwork, paused, idle, off, unavailable), so a card background only ever
  showed as a hairline rim. Threshold Colors' "Background" target and the
  Animation preset "Gradient Shift" are not offered there either, and
  clicking a blank part of the card in the preview now leads to Border. A
  Background already stored in a card's style is kept and written back
  unchanged. Border and Radius work in every state.
- **Markdown card with `text_only` (what a sections view's "Add title"
  creates):** Background, Border and Threshold's background and border colour
  now show; Home Assistant's own text-only rule used to override them.
- **UIX note.** The note about UIX macros and billets appears only when the
  style really calls one, and says that the part that calls it stays in
  Advanced CSS.
- Dev: the click driver's section listing no longer counts a module header
  twice; the module-effect audit tests Font weight with a value that differs from the
  card's own, counts a changed custom property on a noisy canvas card as
  inconclusive, and gained a `media-control (off)` row and `AUDIT_CARDS` /
  `AUDIT_BUNDLE` options; the README screenshots were regenerated; the release workflow now refuses a tag that does not match
  `package.json`'s version and publishes `-beta` tags as pre-releases (the
  first v0.11.0-beta.2 release was created on the wrong branch); the test rig
  loads card-mod through `frontend: extra_module_url`; a real-input click
  driver and a less noisy module-effect audit joined `tools/sandbox`.

### Known limit

- **History-graph line colour can arrive late.** The history graph reads the
  line colour (the Accent) only at the moment the chart draws. A colour that
  arrives after the chart's first draw is used at the next redraw, which
  happens when the sensor's state next changes. The colour is stored and
  applied correctly; only the chart's own drawing is late. This is how the
  card has behaved since Accent was added to it in v0.11.0-beta.1.

### Fixed

- **Enter in a Studio field no longer saves and closes the card dialog on
  Home Assistant 2025.9 – 2026.2.** Those versions treat Enter anywhere in the
  dialog as Save, so typing a colour or a threshold number and pressing Enter
  saved the card with the old value. Enter in a field, on a module header, a
  switch, a slider, the colour popover or "+ Add Rule" now stays in the Studio.
- **A value with a quote no longer breaks the whole style.** A Background such
  as `url('/local/x.png')` with "Only while entity is ON/OFF" ended the template
  early, so the card lost every rule. Quotes and backslashes are now escaped
  in every template value the Studio writes (entity ids, attribute names,
  colours) and read back unchanged; a hand-written template with other
  escapes is left alone in Advanced CSS. A Background list accepts a colour
  only as its last layer, and switching a Background from solid to gradient
  no longer carries an image into a gradient colour.
- **Entities card: rows you did not touch are written back unchanged.** Saving
  another control used to rewrite every row — turning
  `--paper-item-icon-color` into another variable, adding `state_color: false`
  and reflowing your CSS.
- **Loading a preset no longer adds settings the card cannot use** (Font rows
  the card hides, an animation preset the card leaves out), and presets
  saved with text instead of numbers in a threshold rule or fade point load.
- **An "Always" Background with an image reloads into the module.** A
  Background such as `url('/local/x.png')` or `url(/local/x.png), red` used to
  show up under Advanced CSS when the card was reopened; it now loads back
  into the Background module. Values with a position or size
  (`url(x.png) center / cover no-repeat`), a `background-size` beside them,
  `!important`, a data URI, or a markdown card stay under Advanced CSS,
  unchanged.
- **A hand-written declaration that a Studio rule overrides with
  `!important` is kept.** For example your own `.name { font-size: 20px; }` on
  a sensor card while the Font module sets a size: it stays under Advanced CSS
  and is written back on every save. Before, it survived the first save and was
  dropped on the next.
- **Cards Home Assistant can only show in its code editor** (their config has
  an error: an unknown custom card type, an entities or glance card without
  entities, a stack without cards): the Style button now opens the Studio
  there too; before, the panel closed itself again a moment later. Switching to
  "Show code editor" yourself still closes the Studio.
- **The italic "Default (14px)" label** next to an unset slider is no longer
  dimmed (it was slightly under the contrast guideline).
- **Font no longer takes over a plain hand-written rule.** A rule without
  `!important`, such as `.name { font-size: 20px; }` on a sensor card, is no
  longer adopted by the Font module and rewritten with `!important`.
- **An older picture-glance Font style loads.** One that has only a colour or
  only a family (written with `--ha-card-header-color` /
  `--ha-card-header-font-family`) opens in the Font module; the next save
  drops those two variables, which have no effect on that card.
- **A value containing `}}` no longer breaks the style** when the card is
  reopened.
- **Icon Color in light mode:** an empty "off" colour is kept as written
  (it was replaced by a grey), and a template whose fallback the Studio
  cannot read is left alone.
- **Click-to-edit follows the card's settings** the way the panel does (a
  Mushroom template card without an icon no longer shows "Icon Color"), a
  locked entities card (style in dict form) only offers its rows, and on the
  Mushroom classic cards only the words of the name and state lines name Font
  — the blank beside them names the card's Background.
- **The preset name field** no longer closes the dialog on Escape while an
  input method is composing, and no longer saves a half-typed name on Enter.
- **Palette and presets:** when both the browser's storage and Home
  Assistant are unavailable, the lists keep showing what the page already knew
  plus the change (the palette manager used to show only the colour just
  changed). Nothing was lost in Home Assistant; it was a display problem. A
  colour added in that state stays visible until it can be saved.
- **Threshold hints** ("Threshold Colors is setting the …") no longer show
  on custom cards where Threshold Colors is not offered.
- **Old presets:** text values in threshold rules load only when they are
  plain decimal numbers; anything else in such a rule is dropped.
- **Hand-written icon sizes survive a save.** A `0px` icon size (a way to
  hide the icon) on any card, and a hand-written `--tile-icon-size` next to a
  small tile icon, are no longer taken for the Studio's own and deleted.
- **Font:** an older Font style with only a weight, colour or family opens in
  the Font module again on cards that gained text (button, glance, logbook,
  calendar, markdown and others), and hand-written font declarations the
  Studio does not write for that card are no longer removed on save. The
  "Custom…" font family starts empty and no longer jumps to `monospace`.
- **Palette:** an edit is no longer lost when you close the tab straight
  after it, when Home Assistant cannot be read, or when another browser changed
  the palette meanwhile (the palette is re-read before it is written).
- **Presets:** a read failure no longer lets a stale list overwrite your
  presets in Home Assistant; a preset saved while it was unreachable is added
  to the list when it comes back; pressing Enter to confirm an IME
  composition in the name field no longer saves the preset; a preset under a
  long name can be overwritten.
- **The preview card can no longer be operated with the keyboard**, which
  toggled a real entity or opened its dialog.
- **"Show code editor" in the card dialog now works while the Studio is open:**
  the Studio closes when the dialog switches between the visual and the code
  editor.
- **The "Some existing styles weren't recognised" note** no longer appears on
  container cards and other cards that have no modules, and a card that
  renders nothing (Mushroom's empty card) says so.
- **Filters:** the transition setting works on the alert card.
- **Preview:** the entities hover label shows the row's label instead of the
  entity id.

## [0.11.0-beta.2] — 2026-11-08

Second beta of v0.11 "Reach" (plan: `docs/V0.11_PLAN.md`): **Mushroom** and
**Bubble Card** support, a gauge Number size that really reaches 150 %, and
row labels that follow HA 2026.11's naming. Includes all of v0.10.2.
Verified on **HA 2026.11.0** with **card-mod 4.2.1** and **UIX 9.0.0**:
the module-effect audit finds 0 controls without effect on all built-in
cards, all 18 Mushroom card types and 4 Bubble kinds; click-to-edit 24/24.

### Added

- **Mushroom support (5.2.3).** The 14 state cards get Font (→ primary and
  secondary text), icon size, Accent (→ the card's active colour) and
  Threshold; the template card is styled like a tile; chips and the title
  card get the controls that reach them. The empty card has nothing to
  style, so no controls are offered. Accent is hidden when the card's own
  `icon_color` is set (it would do nothing), and HA palette swatches and
  named colours convert.
- **Bubble Card support (3.x, measured on 3.4.3).** Button (including
  slider buttons, where Accent colours the slider fill), separator and
  cover. The card's own `styles:` is preserved untouched. Threshold and
  Accent are hidden where nothing is reached. Other Bubble card types keep
  all modules for now.
- **Click-to-edit in the preview for Mushroom and Bubble parts.** Known
  limit: a click on a Bubble slider's fill opens Background.
- Hand-written `!important` rules on custom cards stay in Advanced CSS.
- Foundation for custom cards: one shared profile lookup (internal).

### Fixed

- **Gauge Number size now really grows to 150 %.** It stopped at about
  118–125 % because HA anchors the value box at 50 %; the Studio now
  re-centres the box. Beta.1 entries are recognised and upgraded on the
  next save.
- **Entities-card row labels follow HA 2026.11's naming** (device + entity
  name, via `hass.formatEntityName`); older HA keeps the previous fallback.
- **Alert card:** Accent, Font text colour and Threshold accent / text
  colour are hidden (they had no effect).
- **Webpage card:** Accent is hidden, as it already was on the iframe card
  it replaces — it had no effect.
- **Docs:** README and wiki screenshots regenerated on HA 2026.11, plus new
  ones for Mushroom, Bubble Card and the gauge's Number size; new wiki pages
  for Mushroom and Bubble Card.

### Known limits

- Mushroom and Bubble support is new in this beta. Unknown custom cards
  still show every module (a notice is planned for v0.11.0).
- Dedicated Mushroom and Bubble wiki pages come with v0.11.0.

## [0.11.0-beta.1] — 2026-10-27

First beta of v0.11 "Reach" (plan: `docs/V0.11_PLAN.md`): the two big
numbers HA draws deep inside the gauge and the thermostat can be sized, and
four controls that stopped doing anything on Home Assistant 2026.10 work
again or are hidden. Tested live on **HA 2026.10.4** with **card-mod 4.2.1**
and with **UIX 8.4.0**.

### Added

- **Font → Number size on gauge cards** (50–150 %) and **Temperature size
  on thermostat cards** (24–96px). The gauge fits its value into a box of
  its own, so the control scales that box — the number grows until the dial
  leaves no room. Each has its own switch, so it works with or without the
  rest of the Font module. The Studio writes it as a shadow-piercing
  (dictionary-form) style and keeps it editable; if the card already has
  your own CSS for that number, the control is locked and your CSS is left
  as it is. Checked live on HA 2025.9, 2026.2 and 2026.10.

### Fixed — Home Assistant 2026.10

- **Visual Filters' transition speed** works again on sensor, entity and
  area cards (HA 2026.10 made them override it, as the tile card already
  did).
- **Accent Color on calendar and history-graph cards** works again: HA
  2026.10 colours them with different variables, which the Studio now
  writes too (older HA keeps working).

### Fixed — controls that do nothing

- Font's **text size** slider is hidden on cards that size their own text —
  alarm panel, area, humidifier, picture-entity, picture-glance and weather
  (measured on HA 2026.6 and 2026.10); weight, family and colour stay.

## [0.10.2] — 2026-11-07

A maintenance release for **Home Assistant 2026.11.0**, which folds HACS
into core as the **Marketplace**. Tested on HA 2026.11.0 with card-mod
4.2.1 and UIX 9.0.0 (UIX 9.0 requires HA 2026.11.0 or newer). It also fixes
four styling regressions that appear on HA 2026.10 and newer.

### Fixed

- **Smooth filter transitions on tile, sensor, entity and area cards.**
  The Background/Filters "transition" setting wrote a plain `transition`,
  but on HA 2026.10 and newer those cards' own transition wins, so filter
  changes snapped instead of fading. The transition now gets `!important`
  on those cards (as it already did on tile cards for HA 2026.9). Hand-written
  `transition` in Advanced CSS still wins.
- **Accent colour reaches the calendar card and history-graph lines.**
  HA 2026.10 stopped reading the old accent variables on these two cards:
  the calendar now takes `--primary-color` and the history graph's first
  line `--graph-color-1`. The old variable is still written for older HA.
- **picture-glance is no longer treated as a header-title card.** Its title
  isn't a card header, so the header size/colour settings did nothing there.
- **Font hides its text-size row on cards that size their own text** —
  alarm-panel, area, humidifier, picture-entity, picture-glance and
  weather-forecast — where the slider changed nothing. Weight, family and
  colour are still offered where they work.
- **The new Date card (HA 2026.11) only offers controls that work on it.**
  Icon colour, Accent colour, Font size and Font text colour (and the
  matching Threshold targets) did nothing there and are now hidden;
  Background, Border, Filters, Animation and Font weight/family stay.

### Changed

- **Marketplace install docs.** README and wiki now describe installing
  from the Marketplace on HA 2026.11 and newer, and from HACS on older HA.
  No change to the plugin itself is needed: `hacs.json` is unchanged.
- Dev: the test harness now mounts test cards inside `<home-assistant>`
  (needed on HA 2026.11); the sandbox rigs pin HA 2026.11.0 and UIX v9.0.0.

## [0.10.1] — 2026-10-27

### Fixed

- **The Studio is readable on translucent ("glass") themes.** While the
  Studio is open it sits on top of HA's own card editor and preview. With a
  theme whose card or dialog background is see-through, HA's editor —
  especially the YAML code editor, which cards without a visual editor
  (e.g. `custom:button-card`) always show — and HA's preview card showed
  through the panel, making it very hard to read
  ([#36](https://github.com/DerTrolli/card-mod-studio/issues/36)). HA's
  editor and preview are now hidden while the Studio is open and come back
  as soon as you close it, so the panel sits on your theme's own dialog
  background. Keyboard Tab also no longer wanders into the hidden editor.

## [0.10.0] — 2026-10-04

The "Piercing + polish" release — the v0.10 cycle consolidated (beta.1,
field-tested since 2026-08-17) plus a full release-readiness pass:
re-verification against the newest engines, an HA 2026.10 compatibility
fix, a 20-bug audit of how hand-written CSS survives an edit, and a
light-mode / dark-mode / phone overhaul of the editor UI.

Verified live on **four** Home Assistant instances — **HA 2026.9.4** (the
current stable) and **HA 2026.10.0b0** (2026.10.0 ships 2026-10-07), each
with **card-mod 4.2.1** and with **UIX 8.3.1** separately: the full
live-check suite, a new real-dialog functional test of every control,
and a visual QA sweep in light and dark mode at six screen sizes (360px
phone → 1920px desktop) with automated contrast, clipping and touch-target
measurements.

### Added

- **Dict-form (`$` shadow-piercing) styles are editable.** The `.` entry
  of a dictionary style — the CSS for the card itself — runs through the
  normal visual modules, exactly like a plain style. Every *other* entry
  (pierced `selector$` chains, nested dicts, UIX `$$`/`&` extensions) is
  preserved **byte-identically, in original key order**, through every
  edit and save; an edit on a dict that had no `.` yet inserts one first.
  Works for top-level cards, stack children and entities-card rows. A
  dictionary that is the card's only style is editable whichever key
  holds it; a `uix:` dictionary using UIX-only features stays under
  `uix:`.
- The **Advanced CSS module lists a dict card's pierced entries
  read-only**, so hand-written shadow-piercing styling is visible in the
  panel.
- **Heading Style now also styles "Subtitle" headings**
  (`heading_style: subtitle`), which it never reached before.
- **Keyboard access**: every collapsible section (modules, stack
  children, entity rows) is reachable with Tab and toggles with
  Enter/Space; colour swatches are real buttons with accessible names;
  visible focus rings throughout.

### Fixed — Home Assistant 2026.10

- **Heading Style stopped working on HA 2026.10.** HA 2026.10 changes the
  heading card's title from `<p>` to `<h2 class="heading">`, so the
  `.title p` rule the module wrote no longer matched anything. The module
  now uses HA's own `--ha-heading-card-*` variables (size / colour /
  weight — verified on 2026.9 and 2026.10, card-mod and UIX) plus a font
  family rule that matches both versions. **Existing heading styles are
  migrated automatically**: open the card in the Studio and save once.

### Fixed — hand-written CSS is never rewritten or lost

Found by a dedicated audit (every item reproduced first, now covered by
134 regression tests, including seeded fuzz suites):

- **Jinja statements** (`{% if %}`, `{% set %}`, `{# … #}`) are kept
  exactly as written — an `{% endif %}` used to be dropped (breaking the
  whole style) and an `{% if %}` wrapper could vanish, making a
  conditional style unconditional.
- **`@media` / `@supports` blocks keep their position**, so responsive
  overrides keep working (they used to be moved above the rules they
  override). Nested rules (CSS nesting, nested `@media`) are no longer
  corrupted.
- **Threshold colours are only adopted when the Studio would write them
  back identically** — expressions with extra conditions
  (`and is_state(…)`), a non-colour fallback, several entities,
  arithmetic, or a rule order the Studio would re-sort now stay in
  Advanced CSS instead of being silently simplified.
- A **`uix:` style using macros, billets or a theme is never deleted**
  when the Studio saves to `card_mod:` (including "clear all styling").
- **Entity rows** keep their hand-written CSS from *both* `card_mod:` and
  `uix:` after an edit; a row rule aimed at part of the row
  (`state-badge`, `hui-generic-entity-row`, …) is no longer turned into a
  whole-row rule; a row style that is only an `@media` block no longer
  gains a corrupt duplicate.
- **Border**: only `solid` borders are adopted — `dashed`, `dotted`,
  `none` etc. stay as written instead of becoming solid.
- **Filter transition**: lists, custom easing and delays are kept
  (only a plain `transition: filter <duration>` is adopted).
- **`!important` wins over source order** when the same selector appears
  twice, as in the browser.
- **Dictionary styles**: a dict under only one key, or the identical dict
  under both keys (what "Copy to card_mod" produces), is no longer frozen
  behind a wrong "Mixed-form" banner; an empty `style: {}` no longer
  freezes the card; a dict whose `.` isn't plain CSS is preserved behind
  an accurate banner instead of silently discarding edits; presets on a
  dict card apply correctly and never carry another card's pierced
  entries.
- **Rows that can't be rewritten** (mixed-form) show a lock note instead
  of controls whose edits were silently dropped; a mixed-form stack child
  keeps its entity rows editable.
- **"Copy to card_mod"** keeps existing `card_mod: class:` / `debug:`.
- A row-level `uix:` dictionary with `$$`/`&` keys gets the UIX-only
  warning instead of a "Copy to card_mod" offer that couldn't work.
- A `null` entry in `entities:` no longer breaks the panel.
- The "custom CSS is overriding this control" warning also sees rules
  that come after an `@media` or nested block.

### Fixed — light mode, dark mode and phones

- **Readable in light mode.** Warning/info banners, the mixed-form and
  stack banners, "+ Add" / delete / preset buttons, override hints and
  the "no on/off state" hint used coloured text on a tint of the same
  colour — down to 1.4:1 contrast on light themes. Everything now meets
  WCAG AA (4.5:1) in light AND dark mode, measured on the real dialog.
- **Turning on Font or Heading Style no longer paints the card's text
  near-white** on light themes — new text colours default to the theme's
  own text colour (`var(--primary-text-color)`), and colour swatches show
  what a `var()` colour really resolves to.
- **The preview sits on your theme's dashboard background** instead of a
  black box.
- **Phones**: the panel never gets wider than the screen — on a 360px
  phone a thermostat (or any card with a wide preview) used to push every
  module's right edge, toggles included, off-screen; rule rows, colour
  grids and control rows wrap instead of clipping their buttons;
  scrolling past the end of the panel no longer drags HA's dialog along;
  the side-by-side preview only appears from 720px panel width; the Style
  button is icon-only on narrow screens so HA's dialog footer fits; touch
  targets grow on touch screens (no target under 24px anywhere in the
  panel).
- Native inputs and selects follow the theme (no white boxes in dark
  mode) and use HA's font; scrollbars, dropdown lists and other
  browser-drawn parts follow HA's dark mode too (HA's own setting, not
  the operating system's) and use HA's scrollbar colour; round colour
  inputs are actually round; the selected colour swatch is visible on
  every colour (it disappeared on blue/cyan); light swatches have an
  outline; swatches wrap as two even rows on narrow screens.
- Click-to-edit works on the whole preview of a tall card — on a long
  entities card the lower rows weren't clickable once the preview was
  scrolled.
- The colour popover is placed using its real height (it could run off
  the bottom with custom colours) and never past the screen edge on
  phones; the click-to-edit preview label is readable on any card and
  stays inside the preview.
- Entity pickers no longer show HA's large floating label next to the
  row's own label.
- Entity rows are labelled with the entity's friendly name ("Outside
  Temperature"), like HA does, instead of its object id
  (`outside_temperature`).
- **Tidier layout.** Every control in a module starts at the same left
  edge (labels share one column instead of pushing each control to a
  different spot); sliders use the full width. The side-by-side preview is
  wider, so entity names no longer get cut off ("Outside Te…"), and its box
  fits the card instead of filling the whole column.
- The **Style button** looks like a button before you open it (an outlined
  pill — on phones it used to be a bare 🎨), the preset button says
  **Save preset** (it sat right above HA's own Save), and the Visual
  Filters / Border & Radius / Advanced CSS icons are visible on dark and
  light themes (⬛ disappeared on dark cards).
- A card the Studio can't edit (🔒 preserved as-is) no longer offers
  presets or "click the preview" — neither could do anything there.

### Fixed — working alongside HA's card editor

- Styling a card while HA's editor is in YAML mode ("Show code editor")
  now updates the YAML text too. It used to keep showing the old YAML, and
  typing anything in it afterwards silently undid the Studio's changes.
- HA's "Show code editor" button no longer greys out after switching on a
  module that doesn't change anything yet (e.g. Visual Filters at its
  defaults).
- Clearing all text in **Advanced CSS** no longer collapses the editor
  mid-edit — the next keystrokes used to land on the page and open HA's
  quick bar over the dialog. The "some existing styles weren't recognised"
  note now only appears for CSS the card already had, not for CSS you type.
- **Presets are named in the panel** instead of a browser pop-up, which
  doesn't work reliably in the Home Assistant app.
- **Colour pop-ups work on older Home Assistant versions** (e.g. 2026.2,
  before HA's current dialogs): the swatch pop-up of compact colour pickers
  (threshold rules, entity rows) showed but couldn't be clicked — HA made
  everything outside its dialog inert.
- **Escape closes just the colour pop-up.** It used to close the whole card
  editor on current HA (and did nothing on older versions); focus now
  returns to the colour swatch.

### Fixed — modules

- Switching on **Threshold Colors** before it's set up (no entity or no
  rules yet) no longer silently disables another module: on a thermostat
  the Background switch did nothing, on a gauge the Accent Color switch did
  nothing. Once Threshold Colors *is* driving a property, the module it
  takes over now says so instead of looking broken.
- **Font on a gauge in dark mode**: with the default (theme) text colour,
  the gauge's value turned black — unreadable on a dark card.
- **Font on a gauge reaches the gauge's name on older Home Assistant**
  (2026.2 and older, where the name is a different element).
- **Font family "Custom…"** (Font and Heading Style) now shows its text
  field — choosing it did nothing, so a custom family could only be typed
  in YAML.
- **Visual Filters "Transition speed" works on tile cards** (the tile's own
  styles overrode it, so filter changes snapped instead of fading).
- **My Color Palette** ON/OFF defaults apply as soon as you change them,
  not only after reopening the editor.
- **Click-to-edit on an entities card opens the row you clicked** —
  anywhere on the row (icon, name, state); it used to open no row at all,
  or the card-level Font module.
- **Threshold Colors is no longer offered on heading cards**, where none of
  its colours had any visible effect (use Heading Style's text colour).
- **No more controls that do nothing.** Every module was switched on, one
  at a time, on every built-in card type — with card-mod and with UIX — and
  the rendered card compared pixel by pixel. What changed nothing is now
  hidden on that card: Accent Color on cards that never use the accent
  colour (button, light, glance, markdown, humidifier, alarm panel, area,
  picture cards, map, iframe, to-do list, logbook, statistics graph,
  weather), Font's text colour where the card colours its own text, Icon
  Color on area and picture-elements cards, Font on plain picture cards.
  Threshold Colors' "Apply to" list now offers exactly the colours the
  matching modules offer on that card, and presets drop what a card hides.
  An `entity-filter` card is treated as a container — a style on the filter
  itself never reached the card it shows.
- **Threshold Colors → Text Color now works on tile cards and on card
  titles** (tile text and titles use their own colour variables; Font
  already handled them).
- **Entity row icon colours now show while the entity is on.** HA colours
  an active entity's icon itself (lights always do), which beat the row
  colour, so it only showed while the entity was off. Setting a row icon
  colour now also sets HA's own `state_color: false` on that row (and
  removing the colour removes it); rows you don't touch are left as they
  are — a row coloured with an earlier version shows an **Always use this
  color** button that adds it.

### Changed

- **Mixed-form styling still freezes** — a card or row carrying a plain
  style on one key and a *different* dictionary style on the other has no
  faithful single-key rewrite, so both keys stay preserved verbatim
  behind a lock banner. This is the only remaining frozen case.
- The macro/billet info banners no longer fire for dict styles with
  `$$`/`&` keys (those are never overwritten under the new model).
- The heading icon rule no longer emits the inert `--ha-icon-size` twin
  (HA never read it); older output that has it is still recognised.

### Compatibility notes

- **Minimum Home Assistant is now 2025.9** (`hacs.json` said 2024.4, which
  was never true). Fully tested: HA 2026.9.4 and 2026.10.0b0 with card-mod
  4.2.1 and with UIX 8.3.1. Partially tested (quick checks): HA 2026.6.4
  and 2026.2.3 with card-mod 4.2.1 — every functional check passes — and
  HA 2025.9.4 with card-mod 3.4.5, where everything works except Font on a
  tile card's name/state text. On HA 2025.3 the Style button doesn't
  appear. Details: README → Compatibility.
- **card-mod 4.2.1** (still the newest release) works, but is
  effectively unmaintained: on HA ≥ 2026.8 it hangs if your *theme*
  defines `card-mod-*-yaml` variables (card-mod issues #606/#617). UIX is
  a drop-in replacement and the Studio fully supports it.
- **UIX 8.4** (in beta) will require HA 2026.10 or newer.

### Not in this release

- The planned Font-module size controls for the gauge value number and
  the thermostat big number moved to **v0.11** — they need a new
  generated-dictionary path in the save logic, which deserves its own
  beta round (see `docs/ROADMAP.md`).

## [0.9.1] — 2026-08-07

A pure correctness release: the v0.10 planning audit plus a full-codebase
bug hunt (two audit passes with ~2,900 fuzzed round-trips and empirical
repros; every fix below inverts a REPRODUCED bug). 46 new unit tests, a
new live check, and the full live suite green on card-mod 4.2.1 AND
UIX 8.0.0, both on HA 2026.8.0.

### Fixed — data loss

- **Dictionary-form (`$` shadow-piercing) styles are now preserved
  verbatim.** Hand-written dict styles were badly mishandled on the first
  Studio edit: a *nested* dict deleted the entire `card_mod:` key, a
  pierce-key dict was corrupted into invalid flat CSS, a flat dict was
  silently flattened, and a dict-form `uix.style` was cleared by the save
  path. The save path now freezes both style keys untouched whenever
  either is dictionary-form, and the panel shows a dedicated "preserved
  as-is" banner instead of dead controls (per-row styling on entities
  cards stays fully editable). Visual editing of this form is the v0.10
  cycle (see `docs/V0.10_PLAN.md`).
- **A `}` inside a CSS comment (or a stray brace) wiped the entire
  hand-written style on save** — the block splitter now tracks comments
  and floors its depth counter.
- **Semicolons inside `url(data:…)` or quoted strings corrupted the
  declaration on save** — declarations now split with a paren/quote-aware
  scanner.
- **`card_mod: class:` / `debug:` were deleted by any Studio edit** (and
  by clear-all, and by switching the output key to `uix:`) — non-style
  card_mod keys are now preserved everywhere, including the reverse-compat
  "copy to card_mod" fix button.

### Fixed — wrong output (silent behavior changes)

- **Hand-written conditionals bound to another entity's OFF state were
  claimed and INVERTED on save** (filter/background) or rebound to the
  card's own entity (animation) — such shapes now stay verbatim in
  Advanced CSS; the modules genuinely can't express "while another entity
  is off".
- **Filter adoption over-claimed non-equivalent filters**:
  `grayscale(50%)` was rewritten to 100%, ride-along effects were dropped
  from conditional branches, `transition: all` was narrowed to
  `transition: filter`, and a no-op `brightness(100%)` was
  claimed-then-deleted. All now stay untouched unless exactly
  expressible.
- **Icon size was destroyed when Threshold drove icon color**: reopening
  disabled the Icon Color module, lost the size slider, and leaked the
  size variables into Advanced CSS.
- **Gradient thresholds driving multiple properties accreted orphan
  `--cms-gradient-stops` blocks** in Advanced CSS on every reopen.
- **Accent-color thresholds gained a phantom `icon-color` property** on
  reopen (the accent module's own companion variable was re-adopted as a
  hand-written icon threshold).
- **Palette `var(--x-color)` and `rgb()` colors broke recognition** in
  borders (control lost to Advanced CSS) and gradients (whole gradient
  string mis-parsed as a solid color) — both now round-trip.
- **Half-filled conditions generated a DIFFERENT condition**: background's
  "another entity" mode with no entity picked yet inverted to while-OFF
  (and rewrote the choice on reopen), grayscale's fell to while-ON, and an
  animation with an incomplete trigger emitted an orphan `@keyframes` that
  reset the whole module on reopen. Incomplete conditions now emit the
  unconditional form.
- **Loading a preset onto a card type that hides some of its modules**
  saved styling that could never be seen or disabled again from the UI —
  hidden modules now reset to defaults on preset load.
- **Threshold property blocks now emit in a canonical order** so
  multi-property thresholds round-trip byte-stably.

### Fixed — UI

- Re-opening the Style panel after toggling it off broke the column
  layout (content below the fold became unreachable — an inline
  `display:block` beat the panel's flex layout).
- A race between the palette cache's initial load and an immediate first
  save could permanently revert the save.
- An external edit-and-revert of the card config could leave the panel
  showing stale state (own-echo guard baseline now advances correctly).
- The preview picker's tap-without-hover fallback (mobile) was dead code.
- Override warnings now also cover the thermostat accent variables and
  the tile-secondary/thermostat/gauge font variables.

### Notes

- Deferred (cosmetic/nuance, recorded as roadmap item #29): `!important`
  dropped from claimed hand-written declarations; off-first binary
  conditionals normalizing to on-first (third-state nuance); half-picked
  conditions flattening to "Always" on reopen.

## [0.9.0] — 2026-08-06

The "make styling discoverable + state-aware" release — the v0.9 cycle
consolidated (beta.1–beta.3, field-tested since 2026-07-18). Every feature
was verified live on real card-mod AND real UIX renders (computed-style
assertions, not source reading), and the final release was re-verified
end-to-end against the newest engines: **card-mod 4.2.1 and UIX 8.0.0,
both on Home Assistant 2026.8.0** — the full live-check suite is green on
both. (UIX 8.0.0 itself requires HA ≥ 2026.8.0; its styling contract is
unchanged, so cards styled by the Studio behave identically across
UIX 7.x and 8.x.)

### Added — click-to-edit preview picker

Hover any part of the live preview and a highlight box names the control
that styles it ("Icon Color", "Font", "Entity Rows: sensor.x", …); click,
and the panel scrolls to that module, opens it, and flashes it briefly.
Works per entity row on entities cards — clicking a row opens exactly that
row's section. The overlay never forwards events to the live card, so you
can point at a light card's toggle without switching anything on. Coverage
was probed card-by-card across all 17 supported card types on both
engines: button name/state, entity/sensor names, gauge/thermostat/
humidifier titles, markdown body, glance columns, media-control titles,
and picture-card footers resolve to Font; the sensor graph line, tile
feature rows, and the thermostat dial resolve to Accent Color; things the
Studio genuinely can't style (more-info buttons, keypads, raw images)
honestly fall back to the card surface instead of pointing at a dead
control. (Under the hood: a geometric hit-test over the card's composed
tree — HA cards hide their content from browser hit-testing behind a
full-card tap layer, so rect math is the only reliable route.)

### Added — state-driven styling depth

- **Four new animation presets** — Shake, Spin (linear timing), Glow,
  Heartbeat — alongside the existing five.
- **Value-conditional animations** — "While a value matches…": entity (or
  one of its numeric attributes) + operator + threshold; the animation
  runs only while the condition holds. Pulse while the freezer is above
  -10°, glow while battery_level < 15.
- **One shared "Reacts to" condition control** (always / entity ON / OFF /
  another entity ON / while a value matches) now also drives three numeric
  controls:
  - **Border width** — appears only while the condition matches, with an
    optional fallback width.
  - **Filter effects** — brightness/blur/**opacity (new control)** apply
    only while the condition matches (grayscale keeps its own condition).
  - **Icon size (new control)** — static or conditional with a fallback
    size; offered exactly where live probing shows the size variables
    reach the main state icon: tile, entity, sensor, picture-glance.

All conditional forms generate anchored single-branch Jinja ternaries that
round-trip byte-stably; hand-written conditions the modules can't express
exactly stay untouched in Advanced CSS.

### Fixed

- **Two entities-card rows with the same entity no longer share one style
  slot** — per-row styles are keyed by row position, so duplicate-entity
  rows hold independent styling.
- **`rgb()`/`rgba()` threshold colors survive reopen** as editable rules;
  and multi-rule thresholds no longer mis-read their default color from an
  intermediate branch of the rule chain.
- **Hand-written filters are no longer flattened**: a conditional or
  combined `filter:` the module can't express exactly (e.g. containing
  `hue-rotate(…)`) stays verbatim in Advanced CSS instead of losing parts
  on save.
- **UIX Forge safety**: cards carrying UIX 8's `forge:` / `foundry:` /
  `uix.macros` config keep them byte-identical through every Studio edit
  (now locked in by regression tests).

### Changed

- The Accent Color module no longer emits the legacy
  `--paper-item-icon-active-color` companion — nothing in current HA reads
  it; old configs upgrade cleanly on the next save.
- README compatibility table pins the live-verification baseline
  (HA 2026.8.0, card-mod 4.2.1, UIX 8.0.0), and documents an HA 2026.8
  platform change: YAML-mode dashboards can no longer enter edit mode, so
  the visual card editor (and the Style button) is only reachable on
  normal storage-mode dashboards.

## [0.8.1] — 2026-07-14

A robustness release for everyone arriving with **existing styles** — from
older Card-Mod Studio versions, from hand-written card-mod, or mid-switch
between card-mod and UIX. Verified with a legacy-output audit across the
generator's full git history, 14 new unit tests, and live checks against a
real UIX instance.

### Added — "Custom CSS is currently overriding this control"

- Every module (and every entities-card row) now detects when hand-written
  CSS in Advanced CSS (or a row's preserved custom CSS) sets the same
  property the module drives, and shows a ⚠️ badge plus an explanation of
  exactly which declaration is winning and why — custom CSS is applied
  last *by design* (hand-written styles always take priority), and until
  now the only symptom was "I drag the color picker and nothing happens".
  The warning names the offending selector/property so it's a ten-second
  fix instead of a mystery.

### Added — safe adoption of equivalent hand-written phrasings

The Studio now recognises well-known *equivalent* ways of writing what its
modules generate, and takes them over cleanly — open the card, the matching
control is pre-filled; change it, and the hand-written line is replaced by
the Studio's own syntax:

- `ha-card { --state-icon-color: … }` and `--paper-item-icon-color`
  (incl. the `:host { … }` form Card-Mod Studio v0.3.1–v0.3.8 itself
  generated on sensor/entity cards) → Icon Color — plain, ON/OFF
  conditional, and value-threshold forms.
- `ha-icon { color: … }` → Icon Color (equivalent via inheritance).
- `ha-card { background-color: … }` → Background (solid).

**Adoption is deliberately conservative**: it only happens on card types
where the regenerated form is verifiably equivalent (never on entities
cards or cards without a reachable icon), only for values the module can
express *exactly*, and never next to contradicting declarations (a
`background-color` beside a `background-image` stays untouched; a
multi-branch Jinja expression the modules can't represent stays untouched).
Everything not adopted is preserved verbatim in Advanced CSS, exactly as
before — with the new override warning pointing at it when relevant.

### Verified — migration paths

- **Old-version configs**: every CSS shape any released Card-Mod Studio
  version ever generated was audited against today's parser; all either
  round-trip into module state or are preserved harmlessly. The one
  genuinely dangerous legacy shape (v0.3.x icon variables, which could
  silently override a newly picked icon color forever) is the one now
  adopted and cleaned up.
- **card-mod → UIX switch**: styling everything with card-mod, deleting
  card-mod and installing UIX keeps every card working with no action
  (UIX reads `card_mod:` natively); the first Studio edit after the switch
  reads the `card_mod:` styling and rewrites it under `uix:` — covered by
  a new permanent live check against a real UIX install. (The reverse
  switch keeps its existing per-card warnings and one-click fix.)

## [0.8.0] — 2026-07-14

The "structure + color system" release — the v0.8 roadmap cycle, developed
and live-tested through four pre-releases (beta.1–beta.4, consolidated
here). Every per-card behavior below was verified against a live Home
Assistant render on both card-mod and UIX, not just source reading.

### Added

- **Style the cards inside a stack — directly from the stack's editor.**
  Vertical-stack, horizontal-stack, and grid cards show one styling section
  per child card instead of a dead-end banner. Each section carries the
  full module set for that child's card type — a gauge child gets the gauge
  treatment (dial/needle/Fade), a tile child the tile treatment,
  thresholds, animations, everything — running through exactly the same
  parse → modules → generate pipeline as a top-level card (shared code:
  `src/editor/studio-state.ts`). Changes are written into the child's own
  `card_mod:`/`uix:` block inside the stack config, applied natively by
  both engines; the live preview shows the whole stack update as you edit.
  An entities-card child even gets the per-entity rows section. Not
  covered yet: containers nested inside containers, `conditional` cards.
- **A new Font module** — text size, weight, family (incl. custom
  free-text), and color for any card not already covered by Heading Style
  (closes [#25](https://github.com/dertrolli/card-mod-studio/issues/25)).
  Cards that override fonts internally get the card-specific companion
  selectors/variables they need: light name/brightness text, button label
  (`!important` vs its adopted-stylesheet cascade), sensor/entity name +
  value (value scales at its native 1.75× ratio) + unit, gauge and
  thermostat titles, tile text (`--ha-tile-info-*` variables), and the
  card **title** of list-style cards (entities, glance, calendar, … via
  `--ha-card-header-*`). Two documented unreachables: the gauge value
  number and the thermostat's big temperature number can't change *size*
  (HA hard-codes them out of reach) — weight and color still work there.
- **Color Palette Manager** — a "My Color Palette" section: define named
  custom colors once and they appear as extra swatches in every color
  picker (card-level and per-row); plus overrides for the default ON/OFF
  colors every freshly-enabled control starts from (Icon/Accent Color,
  row colors, new threshold rules and fade points). Stored per HA user
  (same cross-device storage as presets), with localStorage fallback.
- **Attribute-based thresholds** — Threshold Colors can read an entity
  **attribute** (e.g. `battery_level`, `current_temperature`) instead of
  the state: a "Value read from" selector lists the picked entity's
  numeric attributes. Works in Step and Fade modes, round-trips on reopen,
  and generates standard `state_attr(...)` Jinja both engines render.
- **Per-row font settings on entities cards** — each entity row gets an
  optional text size/weight override, layered on top of the card-level
  Font module; heading cards gained the missing **weight** and **family**
  options in Heading Style.

### Fixed

- **"Visual editor not supported" on cards with a `uix:`/`card_mod:`
  block.** HA is migrating simple cards to schema-driven form editors
  (`getConfigForm()`) whose strict validation neither card-mod nor UIX
  patches — opening e.g. an entity card styled under `uix:` kicked the
  editor into YAML-only mode with "Key 'uix' is not expected". The Studio
  now shims that form editor's validation to ignore both keys (they're
  preserved untouched through edits). Engine-level gap, reported upstream.
- **Plain-string entity rows couldn't be styled at all** (silently): the
  common YAML shorthand `entities: [sensor.a]` produced rows the per-row
  editor didn't recognise and the save path skipped. String rows now
  appear in the rows section and are promoted to `- entity: sensor.a`
  object form the moment they gain styling (unstyled rows stay plain
  strings — no YAML churn).

### Changed

- **UX consistency pass across the whole panel** — the same concept now
  uses the same control, labels, and behavior everywhere: Heading Style
  mirrors the Font module (order, wording, Custom… family — a
  hand-authored family now round-trips into the visible control); per-row
  font uses the same slider controls; the row-level threshold builder
  matches the card-level one (its "top to bottom" label was factually
  wrong — rows auto-sort too); Threshold's border width is a slider like
  the Border module; one "this is styled" indicator dot (size and color)
  for stack children and entity rows; Advanced CSS opens via the standard
  chevron header; unified hint styles, button metrics/labels, and round
  color swatches; palette ON-defaults seed every fresh control, not just
  card-level modules.
- The container-level Border module (which had no visual effect — stacks
  paint no `ha-card` box of their own) is no longer offered; container
  Advanced CSS remains available.

### Docs

- **README overhauled**: all screenshots regenerated from v0.8.0 through a
  real HA edit dialog, cropped per section and annotated with callout
  arrows; new sections for the Font module, Color Palette Manager, stack
  child styling, per-row fonts, and the expanded Threshold capabilities.
  The screenshot set is reproducible via
  `tools/sandbox/harness/readme_shots.mjs`.
- **A full GitHub Wiki** — 14 user-facing pages (module-by-module reference,
  per-card support & limitations, card-mod vs UIX, troubleshooting/FAQ,
  recipes) with navigation sidebar. Sources are maintained in `docs/wiki/`
  (the wiki is a separate git repo GitHub attaches to the project — see
  `docs/wiki/README.md` for how it's published).

## [0.7.1] — 2026-07-06

A pure correctness release, from a full audit of the codebase (every module
round-trip re-derived from first principles, plus live verification against
real card-mod and real UIX instances) and two rounds of live beta testing
on a real dashboard. No new features — a long list of bugs found and
fixed, several of them silent data loss.

### Fixed — gauge & tile cards

- **Accent Color on a gauge card never actually applied.** HA's
  `hui-gauge-card` writes its severity-computed color as an *inline style*
  on `<ha-gauge>` on every render, so the `--gauge-color` variable the
  Studio set on `ha-card` was always overridden — silently. The Studio now
  targets `ha-gauge` directly with `!important` (the one thing that beats a
  non-important inline style), verified against a live gauge card. The same
  applies to the Threshold module's accent-color property, so threshold
  rules — including Fade mode — can now genuinely drive a gauge's dial
  color (e.g. a temperature gauge fading smoothly blue→red, something the
  gauge's own discrete `severity` segments can't do).
- **Needle gauges (`needle: true`) color the needle and value text**
  instead of doing nothing — in needle mode there's no value arc, and the
  needle's fill is `var(--primary-text-color)` inside `ha-gauge`, which the
  accent value now drives the same way. The dial keeps showing the
  configured segments; the panel hint explains this.
- **Tile cards: the accent color now actually wins — including tile
  features like the bar gauge.** Same root cause, one card over:
  `hui-tile-card` writes its state-computed color as an *inline style* on
  `ha-card` (`--tile-color`), so the Studio's plain declaration silently
  lost whenever the tile computed a color (active/state-colored entities —
  exactly the interesting cases). Now emitted with `!important`, which also
  cascades into `hui-card-features` (`--feature-color` derives from
  `--tile-color`), so bar-gauge/toggle feature rows follow the accent color
  too.
- The Threshold module no longer offers **Icon Color on cards with no
  reachable icon** (gauge, glance, thermostat, …) — it was a dead checkbox
  generating CSS that matched nothing. On those cards, enabling Threshold
  now starts from a property that's actually visible there, and on gauges
  the property is labelled "Gauge / Accent Color".

### Fixed — "the color won't change" (stale-override class)

- **The companion variables Accent Color emits per card type**
  (`--tile-color`, `--state-icon-color`, climate variables, …) **were never
  re-recognised on reopen** — every edit session dumped them into Advanced
  CSS as stale copies, and since Advanced CSS is emitted last, *the old
  color kept winning over any new one you picked*. They're now claimed
  back into the module when they match; a hand-written companion with a
  deliberately different value still survives in Advanced CSS untouched.
- **Threshold's accent-color property was invisible on tile, thermostat,
  and gauge cards** — it emitted only `--accent-color`, which those cards
  don't read. It now emits the same card-type companions the Accent Color
  module does, sharing one code path.
- Heading's forward-compatible `--ha-icon-size` twin and gradient-shift's
  `background-size: 200% auto` companion had the same leak-into-Advanced
  problem — both are now claimed with their module.

### Fixed — silent data loss

- **Editing anything in the panel destroyed hand-authored styling on
  entities-card rows.** Every save rewrote every row's style from only what
  the Studio recognises (icon/text color), deleting anything else — a
  `font-weight: bold`, an extra selector, everything. Rows now carry their
  unrecognised CSS through edits verbatim (a row-level counterpart of the
  Advanced CSS passthrough), and rows styled in dictionary form (which the
  Studio can't parse yet) are left completely untouched instead of wiped.
- **A hand-authored `@keyframes` or `@media` block was deleted on the first
  save** — the parser skipped @-blocks as unmodelable but nothing preserved
  them. They now pass through to Advanced CSS verbatim (the Studio's own
  `@keyframes cms-*` are excluded — the Animation module regenerates
  those).
- **A standalone hand-authored `transition:` on ha-card was eaten on save**
  when the Filter module was off — claimed by the filter recogniser but
  only ever re-emitted alongside filter declarations. It's now only claimed
  when a filter is actually recognised.
- **`!important` was silently stripped from preserved-but-unrecognised
  CSS** on every round-trip, weakening its specificity. It's preserved now.
- **When `card_mod:` and `uix:` both carried different unrecognised CSS,
  an edit permanently destroyed the inactive key's copy** (the merge kept
  only one, then the save cleared the other key). Differing leftovers are
  now concatenated (active key's last, so it wins conflicts); identical
  mirrored content is kept once.

### Fixed — crashes & presets

- **A preset saved by v0.6.x crashed the panel when loaded** (the threshold
  model changed shape in 0.7.0: singular `property` → `properties[]`, new
  gradient fields; accent colors gained modes). Stored presets are now
  migrated to the current schema on every load, with defaults for anything
  missing — and garbage input can't throw.
- **Loading a preset wiped the card's own preserved Advanced CSS**,
  replacing it with whatever the preset happened to capture. A preset now
  keeps the current card's Advanced CSS unless the preset itself carries
  some.

### Fixed — round-trip fidelity

- **Negative threshold values were silently deleted on reopen** (the rule
  parser's number pattern had no `-?` — freezer/outdoor temperature rules
  simply vanished on the next save).
- **Grayscale was dropped from a conditional filter whenever brightness or
  blur was also set** — the parser only recognised grayscale when the
  other branch was exactly `none`, but the generator emits the remaining
  filters there.
- **An animation triggered by a different entity silently rebound to the
  card's own entity on reopen** — the custom entity in the condition was
  parsed but never read back into the module.
- **A hand-authored `border:` with no `border-radius:` gained the module's
  default 12px radius on save.** Only a radius the CSS actually had is
  emitted now.
- **An 8-digit hex color (with alpha) in a Fade point turned the whole
  gradient gray** — the interpolation math now drops the alpha channel
  instead of falling back to gray.

### Fixed — editor UX

- **Threshold switch-mode rule values and entities-row rule values now
  commit on blur/Enter instead of every keystroke** — the same
  mid-edit-scramble/snap-to-0 class of bug fixed for gradient points in
  0.7.0, in the two spots that hadn't been converted.
- **On/off entity pickers are now filtered to entities that actually have
  an on/off state** (switches, lights, binary sensors, input booleans, fans,
  humidifiers, sirens, remotes) — a temperature sensor in a "controlled by"
  list was never going to match `is_state(..., 'on')`. The Icon Color
  "match the light's color" mode filters to lights only. Typing an entity
  outside the filter is still allowed, and value-based pickers (Threshold)
  stay unfiltered.
- **The layout-card message no longer sends you in a circle.** It claimed
  you could open a child card and press Style there — but Home Assistant
  edits stack children *inside the same dialog*, so the button kept binding
  to the container and showing the same message. The banner is now honest
  about the limitation and describes the YAML workaround.
- A `uix:` block carrying a per-card `theme:` override (a UIX-only feature
  with no card-mod equivalent) is now recognised as UIX-only by the
  reverse-compatibility warning, the same as macros/billets already were.
- **UIX detection no longer has a false-negative window right after page
  load.** The registry probe (`uix-node`) can lag UIX's frontend resource
  executing by several seconds (observed live); detection now also consults
  `hass.config.components` — backend truth, independent of frontend-load
  timing — so the output-key choice and the reverse-compat warning can't
  flap on a freshly-loaded page.

## [0.7.0] — 2026-07-03

The first big step toward v1.0: making cross-entity styling a first-class,
discoverable feature instead of something only possible by hand-typing an
entity_id, letting one set of threshold rules drive more than one visual
property at once, and adding a genuine smooth-fade alternative to discrete
step rules.

### Added
- **Searchable entity picker everywhere.** Every entity field in the panel
  (Threshold's entity, Animation's custom trigger entity, and every
  "controlled by" field below) uses HA's own `<ha-entity-picker>` (search by
  name, domain icons, autocomplete) via a new shared `cms-entity-picker`
  component, instead of a bare text input you had to get the entity_id
  exactly right in.
- **Icon Color, Background, Filter, and Accent Color can all be controlled
  by a different entity than the card's own** — the same capability
  Threshold and Animation already had, generalized to every conditional
  module. Styling one card's appearance off a *different* entity's state
  (e.g. a toggle card whose icon color reflects a separate status sensor,
  not the toggle entity itself) is now a first-class option everywhere, not
  just something the card's own entity could drive. Available regardless of
  whether the card's own entity has an on/off state at all — a card like
  `button` (whose entity has none) still offers conditional coloring bound
  to a different, toggleable entity, with a clear inline warning if neither
  the card's own entity nor a picked one is toggleable.
- **Accent Color gained the same conditional/entity-binding capability
  every other module already had** — previously static-color-only. Also
  dropped the `--accent-color` CSS-variable name and its explanation from
  the panel; no other module exposes its underlying CSS variable name this
  way, and the code editor is there for anyone who wants to see it.
- **Threshold rules can drive multiple properties at once** — e.g. icon
  color *and* accent color changing together off one shared rule set,
  instead of duplicating the same rules per property. "Apply to" is a set
  of checkboxes; round-trip parsing recognises matching threshold blocks
  across properties and merges them into one module state (a genuine
  mismatch is left alone rather than silently merged, and preserved in
  Advanced CSS instead of dropped).
- **Threshold Colors "Fade" mode** — a genuine alternative to discrete step
  rules: define value→color points (e.g. 0→gray, 150→orange, 220→red) and
  the color blends smoothly between them, clamped at the ends, with a live
  gradient-bar preview and per-point ▲/▼ swap buttons for reordering
  colors without recomputing values by hand. Internally approximated as
  ~32 closely-spaced step rules — HA's sandboxed Jinja2 has no way to build
  a color string from interpolated numbers, so true continuous color math
  isn't reasonably expressible there — but your actual points, not the ~32
  generated ones, come back correctly when reopening the editor, via a
  small marker alongside the real rules in the generated CSS.

### Fixed
- **`ha-state-icon`'s `color` property could be silently claimed by the Icon
  Color recognizer even when it didn't understand the value**, permanently
  blocking Threshold (and Advanced CSS) from ever reading it on save —
  reachable whenever a card had a threshold-driven icon color alongside a
  *different*, unrelated threshold-driven property. Icon Color now only
  claims the property in branches where it actually recognises the value.
- **Gradient mode's colors could fail to apply against real card-mod
  entirely**, with no error anywhere. Root cause: real card-mod's own
  style-string parsing — not this project's — silently drops an entire
  style block the instant a `{`/`}` character appears in any declaration's
  value, even safely inside a quoted string a spec-compliant CSS tokenizer
  would treat as inert. The gradient marker's first encoding was JSON,
  which hit exactly that. Confirmed directly against a live card-mod
  instance by isolating single-character-class variants; fixed by
  switching to a brace-free `value:color,value:color,...` encoding, and
  re-verified end-to-end (Studio UI → generated CSS → real `<hui-card>`
  render → correct `getComputedStyle` color) against both real card-mod
  and a real UIX install independently, rather than trusted from source
  reading alone.
- **Typing a new value into a gradient point could scramble a different
  point's value mid-edit** — the point list re-sorts by value on every
  keystroke, and rows weren't keyed, so Lit's DOM diffing could reuse an
  input element positionally instead of per-point the instant a partial
  value crossed another point's position. Fixed by committing the value on
  blur/Enter instead of every keystroke, and keying the row list by point
  id so a genuine reorder can't steal a focused, in-progress edit.

## [0.6.2] — 2026-07-03

Fixes a real bug in the v0.6.1 threshold color-palette popover, reported
with a screenshot right after v0.6.1 shipped: the popover opened hundreds
of pixels off to the side, half off-screen.

### Fixed
- **The threshold color-palette popover opened far off to the side (or was
  invisible entirely) when used inside HA's real card-edit dialog.** Root
  cause was two-fold, and only reproducible inside the *real* dialog —
  `palette_check.mjs`'s standalone-mounted panel (no `<dialog>` ancestor)
  never exercised either path:
  1. HA's dialog nests a native `<dialog>` two shadow roots deep
     (`ha-dialog` → `wa-dialog` → `<dialog>`), and that `<dialog>` carries
     `transform: matrix(1,0,0,1,0,0)` — an identity matrix with no visible
     effect, but per the CSS spec *any* transform value other than `none`
     still establishes a new containing block for `position: fixed`
     descendants. The popover's `top`/`left` (computed from viewport-relative
     coordinates) were being applied relative to that dialog's own top-left
     corner instead of the viewport, and clipped by its `overflow: hidden`.
  2. The dialog is shown via `showModal()`, promoting it to the browser's
     "top layer" — nothing outside it can paint above it regardless of
     z-index, so naively fixing #1 by rendering the popover into a portal
     on `document.body` made it correctly positioned but fully invisible,
     hidden behind the modal.
  Fixed by rendering the popover into a portal appended as a child of the
  nearest open modal `<dialog>` ancestor when one exists (found by walking
  the *flattened* DOM tree — piercing shadow hosts and `<slot>` assignments,
  not just `parentElement`) — keeping it in the top layer — with position
  computed relative to that dialog's own rect instead of the viewport's,
  since the dialog is now deliberately its containing block. Falls back to
  `document.body` with viewport-relative positioning when there's no dialog
  ancestor (e.g. used standalone, as in `palette_check.mjs`). Verified
  against a live HA instance across six viewport sizes (1920×1080 down to
  800×600) and with a new permanent regression check that opens the real
  dialog and confirms the popover isn't just present in the DOM but
  genuinely clickable at its rendered position, piercing shadow roots via
  nested `elementFromPoint` calls
  (`tools/sandbox/harness/dialog_popover_check.mjs`).

## [0.6.1] — 2026-07-03

UX polish on top of v0.6.0, plus real correctness fixes found while building
it: a consistent color palette for Threshold Colors, a resizable style
dialog, a silent data-loss bug in entities-row threshold parsing, and a
card_mod:/uix: duplication bug reported after v0.6.1's own initial release —
this changelog entry covers everything that shipped under the v0.6.1 tag.

### Added
- **Color palette for Threshold Colors** — `cms-color-picker` gained a
  `compact` mode: a small swatch button that opens a popover with the same
  10-color preset palette already used by Icon Color, plus a raw hex/`var()`
  text field. Used for every threshold rule's color and the default color,
  at both the card level (`cms-threshold-module`) and the entities-card
  row level (`cms-entities-rows-module`), so a consistent palette is always
  one click away instead of hunting down hex values to reuse. The popover is
  `position: fixed` and clamps to the viewport so it can't render off-screen
  or get clipped by an ancestor's `overflow: hidden`.
- **Threshold parser accepts palette `var(--x-color)` values** —
  `parseThresholdJinja`'s rule/default regexes now recognise
  `var(--red-color)`-style tokens (not just hex), so a rule picked from the
  palette round-trips back into a recognised rule instead of falling through
  to Advanced CSS.

### Fixed
- **Style dialog no longer stays pinned to a short card's height when you
  open Style.** Editing a card with few controls (e.g. a tile card) made
  HA size the dialog to fit that short content; switching to the Style tab
  didn't grow it, forcing constant scrolling through a long module list in a
  cramped window. Root cause was two-fold: HA's dialog migrated from
  MDC/MWC to a "Web Awesome" `wa-dialog` wrapping a native `<dialog>`, so the
  legacy `--mdc-dialog-max-height` custom property no longer reaches the
  element that actually controls sizing; and `hui-card-element-editor` is
  `display: inline` by default, on which `min-height` is a CSS no-op. Fixed
  by setting `max-height` directly on the native `<dialog>` (reached through
  two nested shadow roots) and switching the card editor host to
  `display: block` before applying `min-height`. Verified empirically
  against a live HA instance — both fixes were necessary; neither alone
  resolved it.
- **Entities-row threshold default color was silently discarded on every
  re-open of the panel.** `_parseEntityRowCss`'s value-extraction regex
  (`[^;}\n]+`) excluded `}` from the captured value, which truncates *any*
  Jinja `{{ ... }}` expression right before its closing `}}` — the rule
  conditions still parsed correctly, but the trailing `else '<default>'`
  was cut off, so the default color silently fell back to the hardcoded
  `#888888` instead of the value the user actually configured (e.g. a
  palette `var(--grey-color)`). If the user then touched anything else on
  that row, the wrong default got written back into their YAML. Fixed by
  replacing the ad-hoc regex with the existing Jinja-safe `parseCss` (the
  same parser already used for card-level CSS), reused via a new exported
  `parseEntityRowCss` in `state-mapper.ts` — which also makes this path unit
  testable for the first time (9 new tests in `test/parser.test.ts`).
- **Editing an already-styled card left a stale duplicate of the *other*
  key's content sitting alongside the new one, instead of consolidating to
  a single source of truth.** Reported: a card styled under `card_mod:`
  from before UIX was installed, edited after switching to UIX, ended up
  with *both* a new `uix:` block *and* the old, now-dead `card_mod:` block
  still present. On open, the panel now merges settings from **both** keys
  (not just whichever `resolveStyle()` would pick) when both carry real
  content, so a setting that only lives under the currently-inactive key —
  left over from switching engines, or from editing each key separately —
  isn't invisible to the editor or silently dropped on the next save
  (`mergeStudioStates` / `mergeEntityRowStyles` in `state-mapper.ts`, wired
  in via `cms-panel.ts`'s `_buildMergedState`). On save, `applyCardModStyle`
  now writes the merged result to the active key and **clears** the other
  key's `.style` — rename instead of duplicate when only one side had
  content, consolidate-and-clear when both did — rather than leaving it
  stale or syncing it forever. A `uix:` block using macros/billets is still
  never touched (can't be safely parsed into recognised state or determined
  redundant), matching the existing untouchable-content rule. The distinct
  "Copy to card_mod" fix button (for when neither engine can be confirmed
  installed) now has its own implementation that copies `uix.style` into
  `card_mod.style` **verbatim** and deliberately leaves `uix.style` alone —
  it's a defensive fallback-add, not a settings edit, so the new
  clear-the-other-key behavior doesn't apply to it.
- **A style with the same selector declared twice — e.g. a static default
  in one `ha-card { }` block, later overridden by a conditional value in a
  second `ha-card { }` block, a common hand-edited pattern — silently lost
  the second (actually live) declaration entirely, not even preserving it
  in Advanced CSS.** `findTarget`/`findProp` only ever looked at the first
  matching selector, and the "unclaimed → Advanced CSS" reconciliation keys
  purely on `selector+property` strings, so the second block's property
  collided with the first's claim key and was dropped without ever being
  read into any module's state. `parseCss` now coalesces same-selector
  blocks (and de-duplicates repeated properties within one block) using
  real CSS cascade semantics — later declaration wins — before any
  recognizer runs, matching what actually renders. Found via a real
  user-reported card that used exactly this pattern for a threshold
  override; both the coalescing itself and the merge fix above are needed
  to correctly round-trip that card (5 new tests in `test/parser.test.ts` +
  `test/generator.test.ts`, plus a dedicated `test/merge-dedup.test.ts` and
  a new live sandbox check, `tools/sandbox/harness/merge_check.mjs`,
  covering both fixes against a real UIX instance).

## [0.6.0] — 2026-07-03

Adds first-class support for [UIX](https://uix.lf.technology/), the
card-mod-derived HA integration, alongside card-mod — read, generate, and
warn about cross-compatibility correctly regardless of which one (or neither)
is installed. Verified against real running instances of both engines in
Docker (`tools/sandbox/run.sh` and `tools/sandbox/run-uix.sh`), not just
source-reading or unit tests. Fixes #20.

### Added
- **UIX detection** — `isUixInstalled()` probes for UIX's `uix-node` custom
  element, independent of the existing card-mod probe. The "card-mod not
  detected" warning now only shows when neither engine is found.
- **Reads `uix:` style blocks** with the same `uix:` > `card_mod:` precedence
  UIX itself uses, so a card styled under `uix:` (by hand, or by UIX's own
  tooling) reads back correctly into the panel — including entities-card
  **rows**, which carry independent `card_mod:`/`uix:` blocks from the card
  itself.
- **Generates the right key automatically** — output stays `card_mod:` by
  default (UIX fully supports it as a fallback), switching to `uix:` only
  when UIX is installed and card-mod is not. This mirrors a real constraint:
  UIX's own installer refuses to set up alongside a `card-mod.js` Lovelace
  resource, so "both installed" isn't a state its own tooling lets you reach
  — defaulting to `card_mod:` whenever card-mod is present is the safe
  choice, not a guess.
- **Reverse-compatibility warnings** — if a card's styling (or an individual
  entities-card row's) lives only under `uix:` and UIX isn't installed, the
  panel warns about that specific card/row instead of silently rendering
  unstyled, with a one-click "copy to card_mod" fix for plain CSS. `uix:`
  content using macros/billets gets a clear incompatibility warning instead
  (worded differently depending on whether card-mod or UIX is the active
  engine) — those features have no card-mod equivalent and can't be safely
  regenerated by the studio, so there's no valid "fix" to offer, just a
  heads-up.
- **UIX sandbox** (`tools/sandbox/run-uix.sh`) — a second Dockerised HA rig
  running a real UIX integration, set up headlessly through its actual config
  flow. Verifies detection, both style keys, `uix:`-over-`card_mod:`
  precedence, and the live editor's output key against the real integration.
  `tools/sandbox/harness/compat_check.mjs` covers the reverse direction
  (card-mod-only) against the existing card-mod sandbox.

### Correctness details worth knowing
- **Clearing a style clears it under both keys.** If you clear all styling on
  a card that has stale content under the *other* key (e.g. old `card_mod:`
  from before you switched to UIX-only), that stale value is cleared too —
  otherwise it would silently reactivate via whichever engine's fallback
  precedence applies, so "clear" wouldn't actually mean no styling.
- **Editing card_mod: keeps a plain uix: value in sync** (UIX prioritizes
  `uix:` over `card_mod:`, so without this a card_mod edit could silently
  have no visible effect under UIX) **but never touches a uix: block using
  macros/billets** — that's hand-authored content the studio can't safely
  regenerate, so it's left untouched rather than silently overwritten. An
  info banner explains when this applies.
- **Editing uix: directly does overwrite existing macro/billet content**,
  since (unlike the case above) there's no fallback key to preserve it in —
  the panel warns about this before it happens rather than silently
  proceeding or silently doing nothing.
- Explicit-but-empty style values (`uix: {style: ''}` or `{style: {}}`) are
  treated as "not set," matching UIX's own effective behavior, so they can't
  accidentally mask a real `card_mod:` fallback.

## [0.5.0] — 2026-06-25

A UX-focused release that overhauls the confusing conditional ("if state")
controls, makes the threshold stack understandable, corrects which controls each
card type offers, and adds a width-responsive layout. **No generated CSS changed
for existing configs** — the underlying data model is untouched, so dashboards
built with 0.4.x round-trip identically.

### Added
- **Unified "Apply when" control** across Background, Visual Filters, and
  Animation: one consistent label, ordering, and wording, plus a plain-language
  hint under each describing exactly what triggers the style (e.g. "Applies the
  grayscale only while this card's entity is off").
- **Threshold "Result" legend** — a read-only "first match wins (top to bottom)"
  summary that lists every rule in its real evaluation order with colour
  swatches, ending in the default. You can now see which value maps to which
  colour, and rules are sorted automatically so input order no longer matters.
- **Width-responsive editor** — on narrow editors (mobile, slim side panels) the
  live preview now stacks below the controls instead of crowding them into a thin
  column.
- **Real-Home-Assistant testing sandbox** (`tools/sandbox/`): a Dockerised HA +
  Playwright harness that renders both cards and the editor panel and measures
  real computed styles, plus `docs/CARD_SUPPORT_MATRIX.md` documenting which
  settings actually take effect per card type.

### Changed
- **Per-card module availability corrected** (each decision verified in a real
  dashboard, not a mock):
  - **Heading:** Background and Border are hidden — a heading card has no painted
    `ha-card` box, so they had no effect. Heading Style is unchanged.
  - **Glance:** Icon Color is hidden — the icon lives in a nested `state-badge`
    shadow root that a card-mod rule can't reach.
  - **Alarm-panel** and **Media-control:** Icon Color is now offered — both
    honour it (they were wrongly hidden before).
- **Icon Color** mode labels are clearer ("One fixed color" / "Different for
  ON / OFF" / "Match the light's color") with an explanatory hint.
- **Conditional ON/OFF options are gated on entity state** — cards without an
  on/off state (sensor, gauge, …) no longer offer conditions that can never
  match; they show "Always applies …" instead. Existing on/off values are
  preserved and stay editable.
- **Heading icon size** now emits a `--mdc-icon-size` + `--ha-icon-size` fallback
  chain so sizing survives the deprecation of MDC custom properties in HA.

### Fixed
- The state-aware gating never actually engaged: `stateAware` / `isLightCard`
  were bound as boolean **attributes** that default to `true`, so binding `false`
  on a fresh element left them `true` (a Lit footgun). Switched to property
  binding — verified in the sandbox that a sensor now correctly hides ON/OFF.

## [0.4.1] — 2026-06-25

Maintenance release: correctness fixes, consistency cleanup, and new
documentation. No new features.

### Fixed
- **Entities card:** per-row **threshold** styles (icon/text color rules) were
  silently dropped when the card was saved. The save path only checked for
  static colors, which are empty by design in threshold mode, so threshold rows
  were treated as "unstyled" and their `card_mod` was removed.
- **Icon Color on non-state-aware cards** (e.g. `sensor`): the editor showed a
  single color picker, but the generator still emitted an
  `is_state(config.entity, 'on')` template that never matches — so the icon
  rendered the *off* color instead of the chosen one. Non-state-aware cards now
  emit a plain static color.

### Changed
- **Installation is now via the HACS default store** — Card-Mod Studio was
  accepted into HACS, so no custom repository is required. README badge and
  install instructions updated accordingly.
- The style panel header now shows the real version from `package.json` instead
  of a hardcoded string.
- All repository references updated from `card-mod-visual-editor` to
  `card-mod-studio` (README, docs, and the in-app "report an issue" link).

### Removed
- Dead/unused code: `utils/debounce.ts`, `utils/hass-helpers.ts`, and the unused
  shadow-DOM helpers in `utils/dom-helpers.ts`.
- Stale committed `dist/card-mod-studio.js` — `dist/` is gitignored and the
  release artifact is built by CI on tag.

### Docs
- Added **`docs/COMPATIBILITY_AUDIT.md`** — an output-level audit against
  card-mod 4.x and Home Assistant 2026.6.
- Added **`docs/ROADMAP.md`** — consolidated forward plan.
- Corrected the injection docs (`docs/DEVELOPMENT.md`, `docs/PHASE-1.md`) to
  describe the actual `hui-dialog-edit-card` injection approach.

## [0.4.0] — 2026-05

- HACS preparation: validation CI, badges, attribution, and metadata.

Earlier version history (Phases 1–6) is documented in
[`README.md`](README.md#implementation-status) and the files under `docs/`.

[0.11.0-beta.4]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.11.0-beta.4
[0.11.0-beta.3]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.11.0-beta.3
[0.11.0-beta.2]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.11.0-beta.2
[0.11.0-beta.1]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.11.0-beta.1
[0.10.2]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.10.2
[0.10.1]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.10.1
[0.10.0]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.10.0
[0.9.1]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.9.1
[0.9.0]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.9.0
[0.8.1]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.8.1
[0.8.0]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.8.0
[0.7.1]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.7.1
[0.7.0]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.7.0
[0.6.2]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.6.2
[0.6.1]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.6.1
[0.6.0]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.6.0
[0.5.0]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.5.0
[0.4.1]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.4.1
[0.4.0]: https://github.com/dertrolli/card-mod-studio/releases/tag/v0.4.0
