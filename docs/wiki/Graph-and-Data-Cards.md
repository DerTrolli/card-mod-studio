The data-display family: `history-graph`, `statistics-graph`, `statistic`,
`calendar`, `todo-list`, `shopping-list`, `logbook`, `weather-forecast`,
and the `energy-*` cards.

## Available options

| Module | Available | Notes |
|---|---|---|
| Font | ✅ | Body text **plus the card title** (all except weather/energy). Text color reaches the card title and HTML text — graph axis labels are drawn by the chart itself (measured, v0.10.0) |
| Visual Filters | ✅ | |
| Background | ✅ | |
| Border & Radius | ✅ | |
| Threshold Colors | ✅ | Background/text/border color from any entity (text where Font's colour works; accent where Accent works) |
| Advanced CSS | ✅ | |
| Icon Color | — hidden | No single card icon to color |
| Accent Color | history-graph, statistic, calendar | Recolours their accent-drawn parts; hidden on statistics-graph, todo-list, logbook and weather-forecast, where nothing reads it (measured, v0.10.0) |
| Animation | — hidden | Interferes with chart rendering |

## Notes

- These cards have no on/off state of their own — state conditions use
  "Controlled by" / custom-entity pickers; Threshold reads any entity you
  point it at.
- **Graph line colors** inside history/statistics graphs are drawn by HA's
  charting internals per entity — that's theme/HA territory, not reliably
  reachable via card styles. Card-box styling (background, border, font,
  title) is the supported surface.
- Deep `energy-*` SVG styling is explicitly out of scope —
  [Advanced CSS](Advanced-CSS) if you must.
