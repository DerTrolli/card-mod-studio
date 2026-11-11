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
- With UIX, the history-graph line may keep its old colour after an Accent
  is set until the chart next redraws; with card-mod it changes at once.
  <!-- observed on a rig whose sensor data does not change; not yet confirmed on live data -->
- Deep `energy-*` SVG styling is explicitly out of scope —
  [Advanced CSS](Advanced-CSS) if you must.
