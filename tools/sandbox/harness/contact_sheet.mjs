// Tiles screenshots into labeled contact sheets for visual review (no image
// libraries needed — Chromium renders an <img> grid and screenshots it).
// usage: node contact_sheet.mjs <out.png> <cols> <img1> [img2 ...]
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const [out, colsArg, ...imgs] = process.argv.slice(2);
if (!out || !imgs.length) { console.error('usage: contact_sheet.mjs <out.png> <cols> <img...>'); process.exit(2); }
const cols = Number(colsArg) || 4;
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const cells = imgs.map((p) => `<figure><figcaption>${basename(p)}</figcaption><img src="data:image/png;base64,${readFileSync(p).toString('base64')}"></figure>`).join('');
const html = `<!doctype html><meta charset="utf-8"><style>
  body { margin: 0; padding: 8px; background: #777; font: 12px monospace; }
  .g { display: inline-grid; grid-template-columns: repeat(${cols}, max-content); gap: 8px; align-items: start; }
  figure { margin: 0; } figcaption { color: #fff; padding: 2px 0 4px; }
  img { display: block; outline: 1px solid #333; }
</style><div class="g">${cells}</div>`;

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 4000, height: 1000 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.locator('.g').screenshot({ path: out });
await browser.close();
console.log('wrote', out);
