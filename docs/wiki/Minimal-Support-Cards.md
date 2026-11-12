`iframe` / `webpage` and `map` — cards whose content the Studio (and
card-mod/UIX themselves) fundamentally can't restyle.

## Why

- **iframe/webpage** embed a cross-origin page — no CSS from the dashboard
  can reach inside; that's a browser security boundary, not a Studio limit.
- **map** renders through the map library with its own canvas/tiles.

## What still works

| Module | Available |
|---|---|
| Border & Radius | ✅ — round/frame the embed |
| Visual Filters | ✅ — grayscale/brightness/blur over the whole card |
| Threshold Colors | ✅ (border color) |
| Advanced CSS | ✅ |
| Animation | ✅ iframe and map (v0.11.0-beta.3), without Gradient Shift and, on the map, without Spin (it pans the map away from the pointer). Hidden on webpage |
| Font / Background / Icon / Accent | — hidden (nothing to reach). With a card title, Background fills the title strip and Font reaches the title |
