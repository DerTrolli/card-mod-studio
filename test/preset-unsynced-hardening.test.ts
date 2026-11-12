/**
 * The kept list of preset changes (`cms-presets-unsynced`) is read back from
 * localStorage on every load/update: whatever is in there must never make
 * those throw. A full storage must not be reported as "saved on this device".
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { updatePresets, loadPresets, type StylePreset } from '../src/utils/preset-storage.js';
import { mapToStudioState } from '../src/parser/state-mapper.js';
import { parseCardModConfig } from '../src/parser/yaml-parser.js';

const STATE = mapToStudioState(parseCardModConfig({ type: 'tile' }), 'tile');
const preset = (name: string): StylePreset => ({ name, state: STATE });
const names = (l: StylePreset[]) => l.map((p) => p.name);
const KEY = 'cms-presets-unsynced';

let local: Map<string, string>;
let quotaKeys: Set<string>;
let box: { stored: StylePreset[]; failRead: boolean; failWrite: boolean };
const hass = () => ({
  connection: {
    async sendMessagePromise(msg: Record<string, unknown>) {
      if (msg.type === 'frontend/get_user_data') {
        if (box.failRead) throw new Error('offline');
        return { value: box.stored };
      }
      if (box.failWrite) throw new Error('offline');
      box.stored = msg.value as StylePreset[];
      return null;
    },
  },
});

beforeEach(() => {
  local = new Map();
  quotaKeys = new Set();
  box = { stored: [preset('real')], failRead: false, failWrite: false };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => local.get(k) ?? null,
    setItem: (k: string, v: string) => { if (quotaKeys.has(k)) throw new Error('QuotaExceededError'); local.set(k, v); },
  };
});

const BAD: Array<[string, string]> = [
  ['not JSON', '{oops'], ['an object', '{"kind":"save"}'], ['null', 'null'], ['a string', '"x"'],
  ['save without a preset', '[{"kind":"save"}]'],
  ['save with preset null', '[{"kind":"save","preset":null}]'],
  ['save with a nameless preset', '[{"kind":"save","preset":{"state":{}}}]'],
  ['save with a state-less preset', '[{"kind":"save","preset":{"name":"x"}}]'],
  ['delete without a name', '[{"kind":"delete"}]'],
  ['delete with a numeric name', '[{"kind":"delete","name":3}]'],
  ['junk entries', '[null,1,"a",[],{},{"kind":"wat"}]'],
];

describe('a corrupt kept list', () => {
  it.each(BAD)('%s: loadPresets and updatePresets do not throw', async (_n, raw) => {
    local.set(KEY, raw);
    expect(names(await loadPresets(hass()))).toEqual(['real']);
    const written = await updatePresets({ kind: 'save', preset: preset('new') }, hass());
    expect(names(written)).toEqual(['real', 'new']);
    expect(JSON.parse(local.get(KEY)!)).toEqual([]);
  });

  it('valid entries among invalid ones are still replayed (by load, and by an update)', async () => {
    local.set(KEY, JSON.stringify([null, { kind: 'save', preset: preset('kept') }, { kind: 'save' }, { kind: 'delete', name: 'real' }]));
    expect(names(await loadPresets(hass()))).toEqual(['kept']);
    expect(names(box.stored)).toEqual(['kept']);
    local.set(KEY, JSON.stringify([{ kind: 'save', preset: null }, { kind: 'save', preset: preset('again') }]));
    expect(names(await updatePresets({ kind: 'save', preset: preset('n') }, hass()))).toEqual(['kept', 'again', 'n']);
  });
});

describe('repeated saves of one name', () => {
  it('compact to one kept entry (the last), in the position they would end up', async () => {
    box.failRead = true;
    await updatePresets({ kind: 'save', preset: preset('a') }, hass());
    await updatePresets({ kind: 'save', preset: preset('b') }, hass());
    await updatePresets({ kind: 'save', preset: { name: 'a', state: { ...STATE, enabled: true } as never } }, hass());
    await updatePresets({ kind: 'delete', name: 'b' }, hass());
    await updatePresets({ kind: 'save', preset: preset('b') }, hass());
    const kept = JSON.parse(local.get(KEY)!) as Array<{ kind: string; preset?: { name: string } }>;
    expect(kept.map((c) => c.preset?.name)).toEqual(['a', 'b']);
    box.failRead = false;
    expect(names(await loadPresets(hass()))).toEqual(['real', 'a', 'b']);
  });
});

describe('storage full', () => {
  it('writing the kept list fails: the change is not claimed as kept, but replays within this page', async () => {
    quotaKeys.add(KEY);
    box.failRead = true;
    const seen: Array<[boolean, boolean]> = [];
    await updatePresets({ kind: 'save', preset: preset('offline') }, hass(), (r, k) => seen.push([r, k]));
    expect(seen).toEqual([[false, false]]);
    expect(local.has(KEY)).toBe(false);
    box.failRead = false;
    const seen2: Array<[boolean, boolean]> = [];
    const written = await updatePresets({ kind: 'save', preset: preset('online') }, hass(), (r, k) => seen2.push([r, k]));
    expect(names(written)).toEqual(['real', 'offline', 'online']);
    expect(seen2).toEqual([[true, true]]);
  });

  it('writing the list itself fails with no Home Assistant: reported as not saved', async () => {
    quotaKeys.add('cms-presets');
    const seen: Array<[boolean, boolean]> = [];
    await updatePresets({ kind: 'save', preset: preset('x') }, undefined, (r, k) => seen.push([r, k]));
    expect(seen).toEqual([[false, false]]);
  });

  it('a normal device-only save still reports kept', async () => {
    box.failRead = true;
    const seen: Array<[boolean, boolean]> = [];
    await updatePresets({ kind: 'save', preset: preset('x') }, hass(), (r, k) => seen.push([r, k]));
    expect(seen).toEqual([[false, true]]);
  });
});
