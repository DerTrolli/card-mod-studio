// Small shared helpers for the sandbox Playwright checks. Kept deliberately
// minimal — only the parts that are simple, pure, and safe to share across
// the Node/browser boundary. DOM-mounting logic (which needs to stay inside
// a single page.evaluate call per check, since live elements can't cross
// that boundary) stays local to each script.

/** Polls until HA's frontend has a hass object with real entity state. */
export async function waitForHassReady(page, timeout = 60000) {
  await page.waitForFunction(() => {
    const ha = document.querySelector('home-assistant');
    return !!(ha && ha.hass && ha.hass.states && Object.keys(ha.hass.states).length > 10);
  }, { timeout });
}

/** Shared pass/fail bookkeeping so every check script reports the same shape. */
export function makeRecorder() {
  const results = [];
  const record = (name, pass, detail) => {
    results.push({ name, pass, detail: detail ?? null });
    console.log(pass ? '✅' : '❌', name, detail ?? '');
  };
  return { results, record };
}

/** Writes results.json and exits 1 if anything failed — call at the end of a run(). */
export function finish(writeFileSync, resolve, here, filename, results) {
  writeFileSync(resolve(here, filename), JSON.stringify(results, null, 2));
  const failed = results.filter((c) => !c.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) {
    console.error('FAILED:', failed.map((c) => c.name));
    process.exit(1);
  }
}
