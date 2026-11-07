// Small shared helpers for the sandbox Playwright checks. Kept deliberately
// minimal — only the parts that are simple, pure, and safe to share across
// the Node/browser boundary. DOM-mounting logic (which needs to stay inside
// a single page.evaluate call per check, since live elements can't cross
// that boundary) stays local to each script.

/**
 * Defines window.__cmsMount(host) and window.__cmsReady(types) in the page
 * (and on every later navigation). Since HA 2026.11, core cards (glance,
 * gauge, light, alarm-panel, media-control, weather-forecast) read hass, i18n
 * and formatters through Lit context provided by <home-assistant>; a card
 * mounted under document.body throws "Cannot read properties of undefined
 * (reading 'localize')" and renders nothing. So detached test hosts must live
 * inside home-assistant's shadow root (which also gives them HA's theme
 * variables). Gauge, alarm-panel and media-control additionally lazy-load
 * their element definitions: `await window.__cmsReady(['gauge'])` first.
 * Scripts call `window.__cmsMount(host)` and look hosts up again with
 * `window.__cmsFind('#id cms-panel')` (never document.getElementById) (and may `await window.__cmsReady(['gauge'])` again) instead of document.body.appendChild.
 * waitForHassReady() installs this and pre-loads the lazy cards, so scripts
 * that use it need no extra call; others call installMountHelper(page).
 */
export const MOUNT_HELPER_SRC = `(() => {
  if (window.__cmsMount) return;
  window.__cmsMount = (host) => {
    const ha = document.querySelector('home-assistant');
    (ha?.shadowRoot || document.body).appendChild(host);
    return host;
  };
  // Shadow-aware lookup for hosts mounted by __cmsMount: document.getElementById
  // and document.querySelector('#id ...') cannot see into home-assistant's shadow root.
  window.__cmsFind = (selector) => {
    const ha = document.querySelector('home-assistant');
    return ha?.shadowRoot?.querySelector(selector) ?? document.querySelector(selector);
  };
  window.__cmsReady = async (types = []) => {
    const withTimeout = (p, ms = 8000) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
    await customElements.whenDefined('hui-card');
    const helpers = await withTimeout(window.loadCardHelpers?.());
    for (const t of types) {
      // Creating one instance triggers the lazy import of that card's element.
      try { await withTimeout(helpers?.createCardElement({ type: t, entity: 'sensor.outside_temperature' })); } catch (e) { /* the type is only being warmed up */ }
      await withTimeout(customElements.whenDefined('hui-' + t + '-card'));
      if (t === 'gauge') await withTimeout(customElements.whenDefined('ha-gauge'));
    }
  };
})();`;

/** Installs the mount helper (see MOUNT_HELPER_SRC) now and on later navigations. */
export async function installMountHelper(page) {
  await page.addInitScript(MOUNT_HELPER_SRC);
  await page.evaluate(MOUNT_HELPER_SRC);
  // Load the lazily-defined card elements before anything polls for them.
  await page.evaluate(() => window.__cmsReady(['gauge', 'alarm-panel', 'media-control']));
}

/** Polls until HA's frontend has a hass object with real entity state. */
export async function waitForHassReady(page, timeout = 60000) {
  await page.waitForFunction(() => {
    const ha = document.querySelector('home-assistant');
    return !!(ha && ha.hass && ha.hass.states && Object.keys(ha.hass.states).length > 10);
  }, { timeout });
  await installMountHelper(page);
}

/** HA saves a `settheme` choice to the user's profile, so one theme probe
 *  silently changes every later run on that rig (found 2026-10-27: a whole
 *  visual pass ran on a test theme). Runs start from the default theme with
 *  automatic light/dark. Returns the theme it reset, or null. */
export async function resetTheme(page) {
  const before = await page.evaluate(() => document.querySelector('home-assistant').hass.selectedTheme ?? null);
  if (!before || ((before.theme ?? 'default') === 'default' && before.dark === undefined)) return null;
  await page.evaluate(() => document.querySelector('home-assistant').dispatchEvent(
    new CustomEvent('settheme', { detail: { theme: 'default', dark: undefined }, bubbles: true, composed: true })));
  await page.waitForTimeout(800);
  return before;
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

/**
 * Ensures a STORAGE-mode dashboard exists with the given views config and
 * returns its url_path. Needed since HA 2026.8: YAML-mode dashboards (this
 * sandbox's main dashboard) can no longer enter edit mode at all, so any
 * check that must click through the REAL card-edit flow (hui-card-options
 * → Edit → hui-dialog-edit-card) drives a storage dashboard instead —
 * which is also what real users have.
 */
export async function ensureStorageDashboard(page, urlPath, views) {
  return page.evaluate(async ({ urlPath, views }) => {
    const hass = document.querySelector('home-assistant').hass;
    try {
      await hass.callWS({
        type: 'lovelace/dashboards/create',
        url_path: urlPath,
        mode: 'storage',
        title: 'CMS ' + urlPath,
        show_in_sidebar: false,
      });
    } catch (e) {
      // already exists — fine, we overwrite its config below
    }
    await hass.callWS({ type: 'lovelace/config/save', url_path: urlPath, config: { views } });
    return urlPath;
  }, { urlPath, views });
}
