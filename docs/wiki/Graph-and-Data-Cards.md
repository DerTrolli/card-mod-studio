The data-display family: `history-graph`, `statistics-graph`, `statistic`,
`calendar`, `todo-list`, `shopping-list`, `logbook`, `weather-forecast`,
and the `energy-*` cards.

## Available options

| Module | Available | Notes |
|---|---|---|
| Font | ✅ | Body text **plus the card title** (all except weather/energy). Text color reaches the card title and HTML text — graph axis labels are drawn by the chart itself (measured, v0.10.0). Weight reaches the title through Home Assistant's normal-weight token, which on the logbook (entries, "Show more"), the graphs (legend, tooltips) and the calendar (grid, toolbar, events) also changes the weight of those parts. On the statistic card Font reaches name, value and unit like the sensor card |
| Visual Filters | ✅ | |
| Background | ✅ | |
| Border & Radius | ✅ | |
| Threshold Colors | ✅ | Background/text/border color from any entity (text where Font's colour works; accent where Accent works) |
| Advanced CSS | ✅ | |
| Icon Color | statistic only | The statistic card's one icon takes a fixed colour and a size (12–64px; v0.11.0-beta.3). Hidden elsewhere: no single card icon to color |
| Accent Color | history-graph, statistic, calendar | Recolours their accent-drawn parts; hidden on statistics-graph, todo-list, logbook and weather-forecast, where nothing reads it (measured, v0.10.0) |
| Animation | ✅ (not shopping-list, energy) | Offered since v0.11.0-beta.3 — tapping a tile, tooltips, calendar days and events, the logbook and the to-do tick still work while a preset runs. Spin is left out on the map |

## Notes

- These cards have no on/off state of their own — state conditions use
  "Controlled by" / custom-entity pickers; Threshold reads any entity you
  point it at.
- **Graph line colors** inside history/statistics graphs are drawn by HA's
  charting internals per entity — that's theme/HA territory, not reliably
  reachable via card styles. Card-box styling (background, border, font,
  title) is the supported surface.
- **History-graph line colour can arrive late.** The graph reads the line's
  colour (the Accent, written as `--graph-color-1`) only at the moment the
  chart draws. A colour that arrives after the chart's first draw shows at the
  next redraw, which happens when the sensor's state next changes (within a
  fraction of a second of that change), so the line may keep its old colour
  until the sensor's next reading. The colour is stored and applied correctly;
  only the chart's own drawing is late. Measured on Home Assistant 2026.11:
  with card-mod a plain Accent showed on 9 of 9 page loads and immediately in
  the editor, while a Threshold "Accent Color" (a template Home Assistant
  renders a moment later) showed on 4 of 9 loads and otherwise from the
  sensor's next change; with UIX a plain Accent showed on 3 of 14 loads and a
  Threshold accent on 0 of 14, and in all 8 measured cases the line took the
  colour at the sensor's next change. card-mod with a plain Accent is the
  dependable case. This is how the card has behaved since Accent was added to
  it in v0.11.0-beta.1.
- Deep `energy-*` SVG styling is explicitly out of scope —
  [Advanced CSS](Advanced-CSS) if you must.
