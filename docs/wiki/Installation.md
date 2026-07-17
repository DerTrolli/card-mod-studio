## Requirements

- Home Assistant **2024.4.0 or newer** (tested through 2026.x)
- **card-mod** or **UIX** installed and working — Card-Mod Studio *generates*
  the YAML; one of those two engines *applies* it. Without an engine, styles
  are saved but nothing renders (the panel shows a warning banner in that case).
- HACS, for the recommended install path

## Via HACS (recommended)

Card-Mod Studio is in the **HACS default store**:

1. Open HACS → search for **Card-Mod Studio**
2. Click it → **Download**
3. HACS registers the dashboard resource automatically on modern versions
4. Hard-refresh the browser (Ctrl+Shift+R)

> Added it as a custom repository before it was in the default store? Remove
> the old custom-repository entry to avoid a duplicate listing.

### Beta versions

Pre-releases are published as GitHub *pre-releases*. In HACS, open the
Card-Mod Studio entry → ⋮ → **Redownload** → enable *"Show beta versions"*
to opt in. Betas are testing builds — the changelog marks them clearly.

## Manual install

1. Download `card-mod-studio.js` from the
   [latest release](https://github.com/DerTrolli/card-mod-studio/releases/latest)
2. Copy it to `config/www/card-mod-studio.js`
3. **Settings → Dashboards → ⋮ → Resources → + Add Resource**
   - URL: `/local/card-mod-studio.js?v=0.8.0`
   - Type: *JavaScript Module*
4. Hard-refresh the browser (Ctrl+Shift+R)

When updating manually, bump the `?v=` query string so browsers don't serve
the cached old bundle.

## Verifying it works

Open any dashboard card in edit mode (pencil icon). You should see a
**🎨 Style** button in the editor footer, next to "Show code editor":

![The Style button](https://raw.githubusercontent.com/DerTrolli/card-mod-studio/main/images/01%20Style%20button.png)

If it's missing, see [Troubleshooting](Troubleshooting-FAQ#the-style-button-doesnt-appear).
