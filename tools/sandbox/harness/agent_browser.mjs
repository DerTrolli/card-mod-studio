// A browser that a test agent drives the way a person does: it looks at a
// screenshot, decides where to click, and looks again. It offers screen-level
// actions only (click / type / keys / scroll / drag at pixel positions) and
// no access to the page's internals, so what the agent finds is what a user
// would find. Logged in to one Home Assistant rig, like the other checks.
//
//   PORT=9101 OUT=/dir/agent-1 RIG=cm|uix TOKENS_FILE=… HA_URL=… WIDTH=1280 HEIGHT=800 \
//     TOUCH=0|1 SCHEME=light|dark START=/qa-agent-1/0 node agent_browser.mjs
//
// HTTP GET on 127.0.0.1:PORT (every action waits for the page to settle and
// answers { shot, url, consoleErrors } with a fresh screenshot path):
//   /shot[?grid=1]            screenshot (grid: a labelled 100px coordinate grid on top)
//   /zoom?x=&y=&w=&h=         that region at 2× (to read small text)
//   /click?x=&y=  /dblclick?x=&y=  /hover?x=&y=   (a tap on a touch rig)
//   /type?text=…              types into whatever has focus
//   /press?key=Tab|Enter|Escape|ArrowDown|Shift+Tab|Control+a|…
//   /scroll?x=&y=&dy=400      mouse wheel over that point (negative dy = up)
//   /drag?x1=&y1=&x2=&y2=     press, move, release (sliders)
//   /goto?path=/qa-agent-1/0  a path on the rig (the address bar)
//   /reload                   reload the page
//   /wait?ms=1000             wait, then a screenshot
//   /errors                   console errors since the start (Home Assistant's known noise left out)
import * as D from './click-driver.mjs';
import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const PORT = Number(process.env.PORT || 9101);
const OUT = resolve(process.env.OUT || './shots/agent');
const W = Number(process.env.WIDTH || 1280);
const H = Number(process.env.HEIGHT || 800);
const TOUCH = process.env.TOUCH === '1';
const START = process.env.START || '/lovelace/0';
mkdirSync(OUT, { recursive: true });
const HA_NOISE = /themesReady: Timeout|status of 50[02]|Error getting Image Colors|Transition was skipped|Cannot parse given Error object|card alarm-panel Error: Invalid configuration/;

const h = await D.launch({
  rig: process.env.RIG === 'uix' ? 'uix' : 'cm',
  viewport: { width: W, height: H },
  hasTouch: TOUCH,
  isMobile: TOUCH,
  deviceScaleFactor: 2,
  ...(process.env.SCHEME ? { colorScheme: process.env.SCHEME } : {}),
  ...(process.env.TOKENS_FILE ? { tokensFile: process.env.TOKENS_FILE } : {}),
  ...(process.env.HA_URL ? { haUrl: process.env.HA_URL } : {}),
});
const { page } = h;
const HA = h.ha;
await page.goto(`${HA}${START}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

let n = 0;
const settle = async (ms = 700) => {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(ms);
};
const errors = () => h.errors.filter((e) => !HA_NOISE.test(e));
const grid = (on) => page.evaluate((on) => {
  document.getElementById('__agent_grid')?.remove();
  if (!on) return;
  const g = document.createElement('div');
  g.id = '__agent_grid';
  g.setAttribute('popover', 'manual');
  g.style.cssText = 'position:fixed;inset:0;margin:0;padding:0;border:0;background:transparent;pointer-events:none;width:100vw;height:100vh;overflow:visible';
  const w = innerWidth; const hh = innerHeight;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hh}" style="position:absolute;inset:0">`;
  for (let x = 0; x <= w; x += 50) svg += `<line x1="${x}" y1="0" x2="${x}" y2="${hh}" stroke="${x % 100 ? 'rgba(255,0,255,0.18)' : 'rgba(255,0,255,0.45)'}" stroke-width="1"/>`;
  for (let y = 0; y <= hh; y += 50) svg += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="${y % 100 ? 'rgba(255,0,255,0.18)' : 'rgba(255,0,255,0.45)'}" stroke-width="1"/>`;
  for (let x = 100; x < w; x += 100) for (let y = 100; y < hh; y += 100) svg += `<text x="${x + 2}" y="${y - 2}" font-size="10" font-family="monospace" fill="#c0c" stroke="white" stroke-width="2" paint-order="stroke">${x},${y}</text>`;
  svg += '</svg>';
  g.innerHTML = svg;
  document.body.appendChild(g);
  try { g.showPopover(); } catch { /* old browsers: plain fixed overlay */ }
}, on);
const shot = async ({ gridOn = false, clip } = {}) => {
  n++;
  const file = resolve(OUT, `${String(n).padStart(3, '0')}${clip ? '-zoom' : ''}.png`);
  if (gridOn) await grid(true);
  await page.screenshot({ path: file, ...(clip ? { clip, scale: 'device' } : { scale: 'css' }) });
  if (gridOn) await grid(false);
  return file;
};
const answer = async (res, extra = {}) => {
  const file = await shot(extra);
  res.end(JSON.stringify({ shot: file, url: page.url().replace(HA, ''), consoleErrors: errors().length }));
};

const num = (q, k) => Number(q.get(k));
let queue = Promise.resolve();
http.createServer((req, res) => {
  queue = queue.then(async () => {
    const u = new URL(req.url, 'http://x');
    const q = u.searchParams;
    res.setHeader('content-type', 'application/json');
    try {
      switch (u.pathname) {
        case '/shot': return await answer(res, { gridOn: q.get('grid') === '1' });
        case '/zoom': return await answer(res, { clip: { x: num(q, 'x'), y: num(q, 'y'), width: num(q, 'w'), height: num(q, 'h') } });
        case '/click':
          if (TOUCH) await page.touchscreen.tap(num(q, 'x'), num(q, 'y'));
          else await page.mouse.click(num(q, 'x'), num(q, 'y'));
          await settle(); return await answer(res);
        case '/dblclick': await page.mouse.dblclick(num(q, 'x'), num(q, 'y')); await settle(); return await answer(res);
        case '/hover': await page.mouse.move(num(q, 'x'), num(q, 'y'), { steps: 4 }); await settle(400); return await answer(res);
        case '/type': await page.keyboard.type(q.get('text') ?? '', { delay: 25 }); await settle(); return await answer(res);
        case '/press': await page.keyboard.press(q.get('key')); await settle(); return await answer(res);
        case '/scroll':
          await page.mouse.move(num(q, 'x'), num(q, 'y'));
          await page.mouse.wheel(0, num(q, 'dy') || 400);
          await settle(500); return await answer(res);
        case '/drag':
          await page.mouse.move(num(q, 'x1'), num(q, 'y1'));
          await page.mouse.down();
          await page.mouse.move(num(q, 'x2'), num(q, 'y2'), { steps: 12 });
          await page.mouse.up();
          await settle(); return await answer(res);
        case '/goto': await page.goto(`${HA}${q.get('path') || '/'}`, { waitUntil: 'domcontentloaded' }); await settle(2500); return await answer(res);
        case '/reload': await page.reload({ waitUntil: 'domcontentloaded' }); await settle(2500); return await answer(res);
        case '/wait': await page.waitForTimeout(Math.min(num(q, 'ms') || 1000, 15000)); return await answer(res);
        case '/errors': return res.end(JSON.stringify({ consoleErrors: errors() }));
        default: res.statusCode = 404; return res.end(JSON.stringify({ error: 'unknown action' }));
      }
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(e.message || e).split('\n')[0] }));
    }
  });
}).listen(PORT, '127.0.0.1', () => console.log(`agent browser on 127.0.0.1:${PORT} → ${HA}${START} (shots in ${OUT})`));
