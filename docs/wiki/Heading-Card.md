`type: heading` — the section heading. This card paints **no card box**,
which reshapes what's offered.

## Available options

| Module | Available | Notes |
|---|---|---|
| **Heading Style** | ✅ | The dedicated module: text size, weight, font family (incl. Custom…), text color, icon size, icon color, alignment — for **Title and Subtitle** headings |
| Visual Filters | ✅ | |
| Threshold Colors | ✅ / limited | Only the *Text Color* property is meaningful here (no card box for background/border); the heading text inherits it in most themes |
| Font | — hidden | Heading Style covers the same text with more control |
| Background | — hidden | No painted box — verified to have zero visual effect |
| Border & Radius | — hidden | Same reason |
| Icon Color / Accent | — hidden | Heading Style's icon color replaces them |
| Animation | — hidden | |
| Advanced CSS | ✅ | |

Everything text-related lives in **[Heading Style](Font-and-Text#the-heading-style-module)** —
it's the Font module's more capable sibling for this one card type.

## What Heading Style writes (v0.10.0)

Home Assistant 2026.10 changed the heading card's markup — the title text is
now an `<h2 class="heading">` (`<h3>` for the *Subtitle* heading style)
instead of a `<p>`. Since v0.10.0 the module no longer depends on that markup
for size, color and weight: it sets HA's own public
`--ha-heading-card-{title,subtitle}-*` variables, which work on HA 2026.9 and
2026.10 alike, with card-mod and with UIX:

```yaml
card_mod:
  style: |
    .container {
      justify-content: center !important;
      --ha-heading-card-title-font-size: 28px;
      --ha-heading-card-title-color: #03a9f4;
      --ha-heading-card-title-font-weight: bold;
      --ha-heading-card-subtitle-font-size: 28px;
      --ha-heading-card-subtitle-color: #03a9f4;
      --ha-heading-card-subtitle-font-weight: bold;
    }
    .content p,
    .content .heading {
      font-family: serif;        /* only when a family is chosen */
    }
    .content ha-icon {
      --mdc-icon-size: 32px;
      color: #e91e63 !important;
    }
```

- **Subtitle headings** (`heading_style: subtitle`) are styled too — the
  module never reached them before v0.10.0. Title and subtitle variables are
  written together, so the settings apply whichever style the card uses.
- **Font family** has no HA variable, so it's a selector list that matches
  both the old `<p>` and the new `.heading`.
- **Text alignment** is the container's `justify-content`.

### Headings styled with an older version

Heading styles written by v0.9.x and earlier (`.title p { … }` and
`.title ha-icon { … }`) are **recognised and adopted** when you open the card
in the Studio, and rewritten in the shape above the next time you save — so
**open the card in the Studio and save once** to migrate it. On HA 2026.10
the old `.title p` rule matches nothing, so until you do, the text styling
(size, color, weight, family) of an old-style heading won't apply there (the
card isn't damaged — the icon and alignment rules still match — it just
isn't styled).

If hand-written CSS in [Advanced CSS](Advanced-CSS) sets the same
properties, the Heading Style module shows a ⚠️ override badge, as with every
module.
