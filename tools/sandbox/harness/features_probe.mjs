import * as D from './click-driver.mjs';
const h = await D.launch({ rig: process.env.RIG || 'cm', ...(process.env.TOKENS_FILE ? { tokensFile: process.env.TOKENS_FILE } : {}) });
const { page } = h;
const KEY = h.styleKey;
const feats = [{ type: 'light-brightness' }];
const variants = {
  none: '',
  height: 'hui-card-features { --feature-height: 64px; }',
  radius: 'hui-card-features { --feature-border-radius: 2px; }',
  color: 'hui-card-features { --feature-color: rgb(255, 0, 0); }',
  colorImp: 'hui-card-features { --feature-color: rgb(255, 0, 0) !important; }',
  gap: 'hui-card-features { --feature-button-spacing: 30px; }',
};
const cards = Object.entries(variants).map(([k, css]) => ({ type: 'tile', entity: 'light.ceiling_lights', name: k, features: k === 'gap' ? [{ type: 'light-brightness' }, { type: 'toggle' }] : feats, features_position: 'bottom', ...(css ? { [KEY]: { style: css } } : {}) }));
await D.seedDashboard(page, 'qa-features', cards);
await D.gotoDashboard(page, 'qa-features', { engine: true, expectStyled: true });
await page.waitForTimeout(4000);
const out = await page.evaluate(() => {
  const res = [];
  const walk = (root, acc) => { for (const el of root.querySelectorAll('*')) { acc.push(el); if (el.shadowRoot) walk(el.shadowRoot, acc); } return acc; };
  const tiles = walk(document, []).filter((e) => e.tagName === 'HUI-TILE-CARD');
  for (const t of tiles) {
    const all = walk(t.shadowRoot, []);
    const feat = all.find((e) => e.tagName === 'HUI-CARD-FEATURES');
    const fall = feat ? walk(feat.shadowRoot || feat, []) : [];
    const slider = fall.find((e) => e.tagName === 'HA-CONTROL-SLIDER');
    const sAll = slider ? walk(slider.shadowRoot, []) : [];
    const sliderEl = sAll.find((e) => e.classList?.contains('slider'));
    const bar = sAll.find((e) => e.classList?.contains('slider-track-bar'));
    const haCard = all.find((e) => e.tagName === 'HA-CARD');
    const featureEls = fall.filter((e) => e.tagName === 'HUI-CARD-FEATURE');
    const cs = (e, p) => (e ? getComputedStyle(e)[p] : null);
    res.push({
      name: t._config?.name,
      cardVars: haCard ? ['--feature-height', '--feature-color', '--tile-color'].map((v) => getComputedStyle(haCard).getPropertyValue(v).trim()).join('|') : null,
      cardModEl: !!all.find((e) => e.tagName === 'CARD-MOD' || e.tagName === 'UIX-NODE'),
      featStyleAttr: feat?.getAttribute('style'),
      sliderH: slider ? slider.getBoundingClientRect().height : null,
      radius: cs(sliderEl, 'borderTopLeftRadius'),
      barBg: cs(bar, 'backgroundColor'),
      sliderBg: cs(sliderEl, 'backgroundColor'),
      gap: featureEls.length > 1 ? featureEls[1].getBoundingClientRect().top - featureEls[0].getBoundingClientRect().bottom : null,
      vars: feat ? ['--feature-color', '--feature-height', '--feature-border-radius', '--feature-button-spacing'].map((v) => v + '=' + getComputedStyle(feat).getPropertyValue(v).trim()).join(' ') : null,
    });
  }
  return res;
});
for (const r of out) console.log(JSON.stringify(r));
await h.close();
