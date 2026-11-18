/**
 * Sharing styles and presets as text (v1.0): what is written, what a paste
 * accepts, and that pasted text can't carry a card's own entries or break
 * the panel.
 */
import { describe, it, expect } from 'vitest';
import { exportPresets, exportStyle, parseTransfer, uniqueNames, TRANSFER_MAX_CHARS } from '../src/utils/style-transfer.js';
import { migrateStudioState } from '../src/parser/state-mapper.js';

const base = () => migrateStudioState({});

describe('style transfer', () => {
  it('a style round-trips, without the card\'s own pierced entries or Number size', () => {
    const s = base();
    s.border = { ...s.border, enabled: true, borderWidth: 3 };
    s.font = { ...s.font, enabled: true, fontSizePx: 18, numberSizeEnabled: true, numberSize: 120 } as never;
    (s as unknown as { dictSource: unknown }).dictSource = { 'ha-gauge$': 'x' };
    const out = parseTransfer(exportStyle(s));
    expect(out.kind).toBe('style');
    if (out.kind !== 'style') return;
    expect(out.state.border.borderWidth).toBe(3);
    expect(out.state.font.fontSizePx).toBe(18);
    expect(out.state.font.numberSizeEnabled).toBe(false);
    expect('dictSource' in out.state && out.state.dictSource).toBeFalsy();
  });

  it('presets round-trip with names trimmed and capped; broken entries are skipped', () => {
    const text = exportPresets([{ name: 'Warm', state: base() }]);
    const parsed = JSON.parse(text);
    parsed.presets.push({ name: '   ', state: {} }, { name: 'x'.repeat(200), state: {} }, { name: 'no state' }, 'junk');
    const out = parseTransfer(JSON.stringify(parsed));
    expect(out.kind).toBe('presets');
    if (out.kind !== 'presets') return;
    expect(out.presets.map((p) => p.name)).toEqual(['Warm', 'x'.repeat(60)]);
  });

  it('refuses what isn\'t ours, too large, or not JSON — never throws', () => {
    expect(parseTransfer('')).toEqual({ kind: 'error', reason: 'empty' });
    expect(parseTransfer('ha-card { color: red }')).toEqual({ kind: 'error', reason: 'notJson' });
    expect(parseTransfer('{"type":"style","state":{}}')).toEqual({ kind: 'error', reason: 'notOurs' });
    expect(parseTransfer('{"cardModStudio":"1","type":"other"}')).toEqual({ kind: 'error', reason: 'notOurs' });
    expect(parseTransfer('{"cardModStudio":"1","type":"style","state":5}')).toEqual({ kind: 'error', reason: 'nothingUsable' });
    expect(parseTransfer('{"cardModStudio":"1","type":"presets","presets":[]}')).toEqual({ kind: 'error', reason: 'nothingUsable' });
    expect(parseTransfer(`{"cardModStudio":"1","pad":"${'a'.repeat(TRANSFER_MAX_CHARS)}"}`)).toEqual({ kind: 'error', reason: 'tooLarge' });
  });

  it('a pasted state with odd values comes out as a complete, valid state', () => {
    const out = parseTransfer(JSON.stringify({ cardModStudio: '1', type: 'style', state: { border: 'nope', font: { fontSizePx: 'big' }, extra: { x: 1 } } }));
    expect(out.kind).toBe('style');
    if (out.kind !== 'style') return;
    for (const k of Object.keys(base())) expect(out.state).toHaveProperty(k);
  });

  it('imported names that are taken get (2), (3)…', () => {
    const s = base();
    const named = uniqueNames([{ name: 'A', state: s }, { name: 'A', state: s }, { name: 'B', state: s }], ['A', 'A (2)']);
    expect(named.map((p) => p.name)).toEqual(['A (3)', 'A (4)', 'B']);
  });
});
