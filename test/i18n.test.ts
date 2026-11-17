/**
 * The translation layer: which language "auto" picks, placeholders, the
 * German dictionary's completeness, live switching and the stored setting.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { en, type MessageKey } from '../src/i18n/en.js';
import { de } from '../src/i18n/de.js';
import {
  LANGUAGES,
  LANGUAGE_CHANGED_EVENT,
  LangController,
  currentLanguage,
  languageOfHass,
  resetLanguageForTests,
  resolveLanguage,
  setHomeAssistantLanguage,
  setLanguageSetting,
  supportedLanguage,
  t,
  tParts,
} from '../src/i18n/index.js';
import { getSettings, initSettings, resetSettingsForTests, settingsSettled, updateSettings } from '../src/utils/settings-storage.js';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

afterEach(() => resetLanguageForTests());

describe('which language', () => {
  it('auto follows Home Assistant, by base language, else English', () => {
    expect(supportedLanguage('de')).toBe('de');
    expect(supportedLanguage('de-CH')).toBe('de');
    expect(supportedLanguage('de_AT')).toBe('de');
    expect(supportedLanguage('DE')).toBe('de');
    expect(supportedLanguage('en-GB')).toBe('en');
    expect(supportedLanguage('nl')).toBe('en');
    expect(supportedLanguage('zh-Hans')).toBe('en');
    expect(supportedLanguage(undefined)).toBe('en');
    expect(resolveLanguage('auto', 'de')).toBe('de');
    expect(resolveLanguage('en', 'de')).toBe('en');
    expect(resolveLanguage('de', 'fr')).toBe('de');
  });

  it('reads the language from hass.locale, then hass.language', () => {
    expect(languageOfHass({ locale: { language: 'de' }, language: 'en' })).toBe('de');
    expect(languageOfHass({ language: 'nl' })).toBe('nl');
    expect(languageOfHass(undefined)).toBeUndefined();
  });

  it('an explicit choice wins over Home Assistant, and auto goes back to it', () => {
    setHomeAssistantLanguage('de');
    expect(currentLanguage()).toBe('de');
    setLanguageSetting('en');
    expect(currentLanguage()).toBe('en');
    expect(t('font.title')).toBe('Font');
    setLanguageSetting('auto');
    expect(t('font.title')).toBe('Schrift');
  });
});

describe('messages', () => {
  // A translation may leave out a value its grammar can't take; listed here so
  // a dropped placeholder is a decision, not a typo.
  const OMITTED: Partial<Record<MessageKey, string[]>> = {
    'base.thresholdOwnedBody': ['what'], // "…, daher wird die hier gewählte Einstellung nicht verwendet"
  };
  it('German has every key, nothing empty, and the same placeholders as English', () => {
    for (const key of Object.keys(en) as MessageKey[]) {
      expect(de[key], key).toBeTruthy();
      const want = placeholders(en[key]).filter((p) => !(OMITTED[key] ?? []).includes(p));
      expect(placeholders(de[key]), key).toEqual(want);
    }
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
  });

  it('every shipped language is registered with its own name', () => {
    expect(LANGUAGES.en.name).toBe('English');
    expect(LANGUAGES.de.name).toBe('Deutsch');
  });

  it('fills placeholders; an unknown one stays visible', () => {
    expect(t('base.defaultWith', { value: '14px' })).toBe('Default (14px)');
    expect(t('base.defaultWith')).toBe('Default ({value})');
    expect(t('lint.noMatching', { name: 'endif' })).toBe('{% endif %} without a matching {% {want} %}');
  });

  it('Jinja in a message is not mistaken for a placeholder', () => {
    expect(t('lint.unterminatedExpr', { x: 1 })).toBe('Unterminated {{ — missing }}');
    expect(t('panel.templateStatementsOn', {})).toContain('({% … %})');
  });

  it('tParts keeps marked-up values in place', () => {
    const code = { tag: 'code' };
    expect(tParts('accent.gaugeHint', { needle: code })).toEqual([
      'Colors the gauge dial — or, with ',
      code,
      ', the needle and value text (the dial itself shows your configured segment colors there).',
    ]);
  });
});

describe('live switching', () => {
  it('an element with a LangController re-renders when the language changes', () => {
    const listeners = new Map<string, () => void>();
    const g = globalThis as unknown as { addEventListener: unknown; removeEventListener: unknown; dispatchEvent: unknown };
    const saved = { add: g.addEventListener, remove: g.removeEventListener, dispatch: g.dispatchEvent };
    g.addEventListener = (type: string, fn: () => void) => listeners.set(type, fn);
    g.removeEventListener = (type: string) => listeners.delete(type);
    g.dispatchEvent = (e: Event) => { listeners.get(e.type)?.(); return true; };
    try {
      let updates = 0;
      let ctl: LangController | undefined;
      const host = { addController: (c: LangController) => { ctl = c; }, requestUpdate: () => { updates++; } };
      new LangController(host as never);
      ctl!.hostConnected();
      setLanguageSetting('de');
      expect(updates).toBe(1);
      setLanguageSetting('de'); // no change, no re-render
      expect(updates).toBe(1);
      ctl!.hostDisconnected();
      setLanguageSetting('en');
      expect(updates).toBe(1);
      expect(listeners.has(LANGUAGE_CHANGED_EVENT)).toBe(false);
    } finally {
      g.addEventListener = saved.add;
      g.removeEventListener = saved.remove;
      g.dispatchEvent = saved.dispatch;
    }
  });
});

describe('the stored setting', () => {
  const store = new Map<string, string>();
  const g = globalThis as unknown as { localStorage?: unknown; window?: unknown; CustomEvent?: unknown };
  let savedLs: unknown;
  let savedWindow: unknown;
  beforeEach(() => {
    store.clear();
    savedLs = g.localStorage;
    savedWindow = g.window;
    g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
    g.window = { dispatchEvent: () => true };
    (g as { CustomEvent?: unknown }).CustomEvent ??= class { constructor(public type: string) {} };
    resetSettingsForTests();
  });
  afterEach(() => {
    g.localStorage = savedLs;
    g.window = savedWindow;
    resetSettingsForTests();
  });
  const fakeHass = (remote: unknown) => {
    const sent: Array<Record<string, unknown>> = [];
    return {
      sent,
      connection: {
        sendMessagePromise: async (msg: Record<string, unknown>) => {
          sent.push(msg);
          if (msg.type === 'frontend/get_user_data') return { value: remote };
          return null;
        },
      },
    };
  };

  it('starts at auto, not yet chosen', () => {
    expect(getSettings()).toMatchObject({ language: 'auto', languageChosen: false });
  });

  it('a choice applies at once and is saved here and in Home Assistant', async () => {
    const hass = fakeHass(null);
    await updateSettings({ language: 'de', languageChosen: true }, hass);
    expect(currentLanguage()).toBe('de');
    expect(JSON.parse(store.get('cms-settings')!)).toMatchObject({ language: 'de', languageChosen: true });
    expect(hass.sent.at(-1)).toMatchObject({ type: 'frontend/set_user_data', key: 'cms_settings', value: { language: 'de' } });
  });

  it("Home Assistant's newer copy wins over this device's", async () => {
    store.set('cms-settings', JSON.stringify({ language: 'en', languageChosen: true, updatedAt: 1 }));
    await initSettings(fakeHass({ language: 'de', languageChosen: true, updatedAt: 5 }));
    expect(getSettings()).toMatchObject({ language: 'de' });
    expect(JSON.parse(store.get('cms-settings')!).language).toBe('de');
  });

  it('a choice made while Home Assistant was unreachable is sent up later', async () => {
    store.set('cms-settings', JSON.stringify({ language: 'de', languageChosen: true, updatedAt: 9 }));
    const hass = fakeHass({ language: 'en', languageChosen: true, updatedAt: 2 });
    await initSettings(hass);
    expect(getSettings().language).toBe('de');
    expect(hass.sent.at(-1)).toMatchObject({ type: 'frontend/set_user_data', value: { language: 'de', updatedAt: 9 } });
  });

  it("is not settled while Home Assistant's copy is on its way (the question waits)", async () => {
    let answer!: (v: unknown) => void;
    const hass = {
      connection: {
        sendMessagePromise: (msg: Record<string, unknown>) =>
          msg.type === 'frontend/get_user_data' ? new Promise((r) => { answer = r; }) : Promise.resolve(null),
      },
    };
    expect(settingsSettled(undefined)).toBe(true); // nothing to wait for
    const load = initSettings(hass);
    expect(settingsSettled(hass)).toBe(false);
    expect(settingsSettled(undefined)).toBe(false); // a view without hass yet waits too
    expect(getSettings().languageChosen).toBe(false);
    answer({ value: { language: 'de', languageChosen: true, updatedAt: 7 } });
    await load;
    expect(settingsSettled(hass)).toBe(true);
    expect(getSettings()).toMatchObject({ language: 'de', languageChosen: true });
  });

  it('a failed read of Home Assistant settles too (this device decides)', async () => {
    const hass = { connection: { sendMessagePromise: () => Promise.reject(new Error('offline')) } };
    const warn = console.warn;
    console.warn = () => {};
    try {
      await initSettings(hass);
    } finally {
      console.warn = warn;
    }
    expect(settingsSettled(hass)).toBe(true);
  });

  it('nonsense in storage reads as the defaults', () => {
    store.set('cms-settings', JSON.stringify({ language: 'xx', languageChosen: 'yes', updatedAt: 'now' }));
    expect(getSettings()).toEqual({ language: 'auto', languageChosen: false, updatedAt: 0 });
  });
});
