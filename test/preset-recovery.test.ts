/**
 * A change made while Home Assistant could not be read or written lives on
 * this device only; the next successful read puts it back on top of Home
 * Assistant's list and writes that (the way the palette replays its edits).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { updatePresets, loadPresets, type StylePreset } from '../src/utils/preset-storage.js';
import { mapToStudioState } from '../src/parser/state-mapper.js';
import { parseCardModConfig } from '../src/parser/yaml-parser.js';

const STATE = mapToStudioState(parseCardModConfig({ type: 'tile' }), 'tile');
const preset = (name: string, marker = ''): StylePreset => ({
  name, state: { ...STATE, advanced: { ...STATE.advanced, rawCss: marker } },
});
const names = (l: StylePreset[]) => l.map((p) => p.name);

function fakeHass(initial: StylePreset[]) {
  const box = { stored: initial, failRead: false, failWrite: false };
  const hass = {
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
  };
  return { hass, box };
}

beforeEach(() => {
  const local = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => local.get(k) ?? null,
    setItem: (k: string, v: string) => { local.set(k, v); },
  };
});

describe('presets changed during an outage', () => {
  it('a save made while HA cannot be read reaches HA on the next update', async () => {
    const { hass, box } = fakeHass([preset('a')]);
    box.failRead = true;
    await updatePresets({ kind: 'save', preset: preset('offline') }, hass);
    expect(names(box.stored)).toEqual(['a']);
    box.failRead = false;
    const out = await updatePresets({ kind: 'save', preset: preset('later') }, hass);
    expect(names(out)).toEqual(['a', 'offline', 'later']);
    expect(names(box.stored)).toEqual(['a', 'offline', 'later']);
  });

  it('…and on the next plain load, which writes it too', async () => {
    const { hass, box } = fakeHass([preset('a')]);
    box.failRead = true;
    await updatePresets({ kind: 'save', preset: preset('offline') }, hass);
    box.failRead = false;
    expect(names(await loadPresets(hass))).toEqual(['a', 'offline']);
    expect(names(box.stored)).toEqual(['a', 'offline']);
    // replayed once: a second load changes nothing
    expect(names(await loadPresets(hass))).toEqual(['a', 'offline']);
  });

  it('a delete made during the outage is replayed', async () => {
    const { hass, box } = fakeHass([preset('a'), preset('b')]);
    box.failRead = true;
    await updatePresets({ kind: 'delete', name: 'a' }, hass);
    box.failRead = false;
    expect(names(await loadPresets(hass))).toEqual(['b']);
    expect(names(box.stored)).toEqual(['b']);
  });

  it('a write that failed (read fine) is retried the same way', async () => {
    const { hass, box } = fakeHass([preset('a')]);
    box.failWrite = true;
    await updatePresets({ kind: 'save', preset: preset('x') }, hass);
    box.failWrite = false;
    expect(names(await loadPresets(hass))).toEqual(['a', 'x']);
    expect(names(box.stored)).toEqual(['a', 'x']);
  });

  it('a name saved both here (offline) and elsewhere: one entry, this device\'s version', async () => {
    const { hass, box } = fakeHass([preset('same', 'elsewhere')]);
    box.failRead = true;
    await updatePresets({ kind: 'save', preset: preset('same', 'here') }, hass);
    box.stored = [preset('same', 'elsewhere-newer'), preset('other')];
    box.failRead = false;
    const out = await loadPresets(hass);
    expect(names(out)).toEqual(['other', 'same']);
    expect(out.find((p) => p.name === 'same')!.state.advanced.rawCss).toBe('here');
    expect(names(box.stored)).toEqual(['other', 'same']);
  });

  it('survives a page reload (the backlog is kept in localStorage)', async () => {
    const { hass, box } = fakeHass([preset('a')]);
    box.failRead = true;
    await updatePresets({ kind: 'save', preset: preset('offline') }, hass);
    box.failRead = false;
    // a fresh module instance would see only localStorage
    expect(names(await loadPresets(hass))).toContain('offline');
  });

  it('nothing queued → a load writes nothing', async () => {
    const { hass, box } = fakeHass([preset('a')]);
    let writes = 0;
    const send = hass.connection.sendMessagePromise;
    hass.connection.sendMessagePromise = async (m) => { if (m.type === 'frontend/set_user_data') writes++; return send(m); };
    await loadPresets(hass);
    expect(writes).toBe(0);
    expect(names(box.stored)).toEqual(['a']);
  });
});
