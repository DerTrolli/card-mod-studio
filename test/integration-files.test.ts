/**
 * The optional integration (custom_components/card_mod_studio) stays in step
 * with the Studio: same version, the same languages to choose from, and a
 * translation file per Studio language with exactly the keys of strings.json.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { LANGUAGES } from '../src/i18n/index.js';

const dir = resolve(__dirname, '../custom_components/card_mod_studio');
const json = (p: string) => JSON.parse(readFileSync(resolve(dir, p), 'utf8'));
const keys = (o: unknown, prefix = ''): string[] =>
  o && typeof o === 'object'
    ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k))
    : [prefix];

describe('the integration', () => {
  it('has the Studio\'s version', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8'));
    expect(json('manifest.json').version).toBe(pkg.version);
  });

  it('offers exactly the Studio\'s languages', () => {
    const py = readFileSync(resolve(dir, 'const.py'), 'utf8');
    const list = /LANGUAGE_OPTIONS = \[([^\]]*)\]/s.exec(py)![1].match(/"([^"]+)"/g)!.map((s) => s.slice(1, -1));
    expect(list).toEqual(['auto', ...Object.keys(LANGUAGES)]);
    expect(Object.keys(json('strings.json').selector.language.options)).toEqual(list);
  });

  it('has a translation per Studio language with the same keys, and en.json = strings.json', () => {
    const want = keys(json('strings.json')).sort();
    expect(json('translations/en.json')).toEqual(json('strings.json'));
    for (const code of Object.keys(LANGUAGES)) {
      const f = `translations/${code}.json`;
      expect(existsSync(resolve(dir, f)), f).toBe(true);
      expect(keys(json(f)).sort(), f).toEqual(want);
      // the language names are each language's own, the same in every file
      expect(json(f).selector.language.options[code], f).toBe(LANGUAGES[code as keyof typeof LANGUAGES].name);
    }
  });
});
