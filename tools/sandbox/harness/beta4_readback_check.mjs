// v0.11.0-beta.4 read-back fixes, through the real card editor with real input.
//   RIG=cm  node beta4_readback_check.mjs
//   RIG=uix UIX_TOKENS_FILE=/path/tokens.json node beta4_readback_check.mjs
// Each card carries a style that used to change (or come back with a module
// off) when the card was opened and saved. The check opens the card editor,
// looks at the module switches, switches Animation on as an unrelated edit,
// saves, and reads the stored config.
// Prints PASS/FAIL per step and "N/M checks passed"; exits 1 on a failure.
import * as D from './click-driver.mjs';

const RIG = process.env.RIG === 'uix' ? 'uix' : 'cm';
const URLPATH = 'qa-beta4-readback';
const T = 'sensor.outside_temperature';
const expr = (rules, dflt) => {
  let s = '{{ ';
  rules.forEach(([c, op, v], i) => { s += `${i ? ' else (' : ''}'${c}' if states('${T}') | float(0) ${op} ${v}`; });
  return `${s} else '${dflt}'${')'.repeat(rules.length - 1)} }}`;
};
const BG_RULES = expr([['#2196f3', '<', 10], ['#ff0000', '>=', 20]], '#888888');
const BG_MIXED = expr([['#123456', '>=', 1], ['#ff0000', '<=', 10]], '#888888');

const STYLES = {
  important: 'ha-card {\n  background: none !important;\n  border: none !important;\n}',
  fontThreshold: `ha-card {\n  background: ${BG_RULES};\n}\n\nha-card {\n  font-family: monospace;\n}`,
  mixedThreshold: `ha-card {\n  background: ${BG_MIXED};\n}`,
  foreign: '.title p {\n  font-size: 30px;\n}\n\nha-card {\n  border-radius: 0px;\n}',
  row: ':host {\n  color: red !important;\n}',
};

const h = await D.launch({ rig: RIG });
const { page } = h;
const KEY = h.styleKey;
const styled = (css) => ({ [KEY]: { style: css } });
const results = [];
const step = async (name, fn) => {
  try {
    const detail = await fn();
    results.push(true);
    console.log('PASS', name, detail ?? '');
  } catch (e) {
    results.push(false);
    console.log('FAIL', name, '-', String(e.message || e).split('\n')[0]);
    await D.cancelCard(page).catch(() => {});
  }
};
const need = (cond, msg) => { if (!cond) throw new Error(msg); };
const count = (hay, needle) => hay.split(needle).length - 1;
const section = async (name) => (await D.listSections(page)).find((s) => s.name === name);
const enabled = async (name) => (await section(name))?.enabled;
const styleOf = async (index) => (await D.savedCards(page, URLPATH))[index]?.[KEY]?.style ?? '';

/** Open card `index`, run `look`, switch Animation on, save, return the stored style. */
const editAndSave = async (index, look) => {
  await D.openCardEditor(page, index);
  await D.openStudio(page);
  const seen = await look();
  await D.setSectionEnabled(page, 'Animation', true);
  await D.saveCard(page);
  const css = await styleOf(index);
  need(css.includes('cms-pulse'), 'the unrelated edit (Animation) was not saved');
  return { css, seen };
};

try {
  await D.seedDashboard(page, URLPATH, [
    { type: 'tile', entity: 'light.ceiling_lights', ...styled(STYLES.important) },
    { type: 'tile', entity: 'light.ceiling_lights', ...styled(STYLES.fontThreshold) },
    { type: 'tile', entity: 'light.ceiling_lights', ...styled(STYLES.mixedThreshold) },
    { type: 'tile', entity: 'light.ceiling_lights', ...styled(STYLES.foreign) },
    { type: 'entities', entities: [{ entity: 'light.bed_light', ...styled(STYLES.row) }, 'sensor.outside_temperature'] },
  ]);
  await D.gotoDashboard(page, URLPATH, { engine: false });
  await D.enterEditMode(page);

  await step('hand-written !important: Background and Border stay off, flags survive a save', async () => {
    const { css, seen } = await editAndSave(0, async () => [await enabled('Background'), await enabled('Border & Radius')]);
    need(seen[0] === false && seen[1] === false, `Background/Border switched on: ${JSON.stringify(seen)}`);
    need(css.includes('background: none !important;') && css.includes('border: none !important;'), `flag lost: ${css}`);
    return 'both declarations stored with !important';
  });

  await step('Font family + Threshold background: both modules are on after reopening', async () => {
    const { css, seen } = await editAndSave(1, async () => [await enabled('Font'), await enabled('Threshold Colors')]);
    need(seen[0] === true && seen[1] === true, `Font/Threshold: ${JSON.stringify(seen)}`);
    need(count(css, 'font-family: monospace;') === 1 && count(css, BG_RULES) === 1, `style changed: ${css}`);
    return 'Font on, Threshold on, each written once';
  });

  await step('Threshold rules pointing both ways: module on, expression unchanged by a save', async () => {
    const { css, seen } = await editAndSave(2, async () => enabled('Threshold Colors'));
    need(seen === true, 'Threshold Colors came back off');
    need(count(css, BG_MIXED) === 1, `expression changed: ${css}`);
    return 'rules read back, same order stored';
  });

  await step('heading selectors and a zero radius on a tile stay as written', async () => {
    const { css, seen } = await editAndSave(3, async () => [await enabled('Border & Radius'), (await section('Heading Style'))?.enabled ?? null]);
    need(seen[0] === false, 'Border & Radius took over border-radius: 0px');
    need(seen[1] !== true, 'Heading Style is on, on a tile');
    need(css.includes('.title p {\n  font-size: 30px;\n}') && css.includes('border-radius: 0px;'), `rule changed: ${css}`);
    need(!css.includes('--ha-heading-card') && !css.includes('12px'), `rewritten: ${css}`);
    return '.title p and border-radius: 0px stored unchanged';
  });

  await step('entities row: a hand-written !important survives an edit of that row', async () => {
    await D.openCardEditor(page, 4);
    await D.openStudio(page);
    await D.expandSection(page, 'light.bed_light');
    const list = () => D.listControls(page, 'light.bed_light');
    const describe = (cs) => cs.map((c) => `${c.kind}:${c.label}=${JSON.stringify(c.value)}`).join(', ');
    const before = await list();
    // the flagged text colour is not read into the row's controls
    const text = before.find((c) => c.kind === 'toggle' && /text/i.test(c.label));
    need(text && text.value === false, `Text colour switch is on: ${describe(before)}`);
    const sw = before.find((c) => c.kind === 'toggle' && /^icon/i.test(c.label));
    need(sw, `no Icon color switch in the row: ${describe(before)}`);
    await D.toggle(sw, true);
    const icon = (await list()).find((c) => c.kind === 'color');
    need(icon, `no colour control after switching Icon color on: ${describe(await list())}`);
    await D.setColor(icon, '#00aa00');
    await D.saveCard(page);
    const row = (await D.savedCards(page, URLPATH))[4].entities[0];
    const css = row?.[KEY]?.style ?? '';
    need(/--state-icon-color: #00aa00;/i.test(css), `row edit not saved: ${css}`);
    need(css.includes('color: red !important;'), `flag lost: ${css}`);
    return 'row icon colour saved, color: red !important kept';
  });

  const errors = h.errors.filter((e) => /card-mod-studio|cms-/i.test(String(e)));
  await step('no console error from the Studio', async () => need(errors.length === 0, errors.slice(0, 3).join(' | ')));
} finally {
  await h.close();
}
const passed = results.filter(Boolean).length;
console.log(`${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
