The visual-effect modules. All of them support state conditions via the
shared **"Apply when"** control where noted.

## Background

![Background](https://raw.githubusercontent.com/DerTrolli/card-mod-studio/main/images/04%20Background%20Color.png)

- **Solid color** or **gradient** (two colors + angle slider)
- **Apply when**: always / only while the entity is ON / only while OFF /
  while *another* entity is ON — great for a "glow when active" effect.

## Visual Filters

CSS filter effects on the whole card:

- **Grayscale** — with its own Apply when (making inactive devices look
  "dead" is the classic use: grayscale *while OFF*)
- **Brightness** — 0–200%
- **Blur** — 0–20px
- **Transition speed** — how smoothly the filter animates on state change

## Animation

A looping animation on the card:

| Preset | Effect |
|---|---|
| Pulse | Gentle rhythmic scale |
| Breathe | Soft opacity fade |
| Gradient-shift | Slowly shifts a gradient background (needs the Background module in gradient mode) |
| Blink | Abrupt alert flash |
| Bounce | Periodic vertical bounce |
| Shake | Quick horizontal shake |
| Spin | Continuous rotation (constant speed) |
| Glow | Pulsing glow around the card |
| Heartbeat | Double-beat scale, like a heartbeat |

Plus a **speed** slider and the trigger control: always / while the entity
is ON / OFF / while *another* entity is ON — or, since v0.9.0,
**"While a value matches…"**: pick an entity (or one of its numeric
attributes), an operator, and a threshold, and the animation runs only
while the condition holds. The classic attention-indicator: *glow while
`battery_level` < 15*, *pulse while the freezer is above −10°*.

## Border & Radius

- **Border radius** — round the card's corners (0–50px)
- **Border width** (0–8px) and **border color** — the color picker appears
  once width > 0

Combines well with [Threshold Colors](Threshold-Colors) targeting *Border
Color* — a value-driven colored frame (Threshold then supplies its own
border width control).

Not offered on containers (stacks paint no card box of their own — style the
children instead, see [Styling Cards Inside Stacks](Styling-Cards-Inside-Stacks)).
