/**
 * A preset applied to a card type whose Font ROW is hidden must not keep the
 * value the card can neither show nor edit (hidden modules are reset already).
 */
import { describe, it, expect } from 'vitest';
import { filterPresetStateForCardType } from '../src/utils/preset-caps.js';
import { capsFor } from '../src/utils/card-caps.js';
import { mapToStudioState, DEFAULT_FONT } from '../src/parser/state-mapper.js';
import { parseCardModConfig } from '../src/parser/yaml-parser.js';
import type { StudioState } from '../src/types/index.js';

const base = mapToStudioState(parseCardModConfig({ type: 'tile' }), 'tile');
const preset = (): StudioState => ({
  ...base,
  font: { ...DEFAULT_FONT, enabled: true, fontSize: 20, fontWeight: 'bold', color: '#ff0000', fontFamily: 'Georgia' },
});

describe('filterPresetStateForCardType: hidden Font rows', () => {
  it.each(['alert', 'area', 'date', 'alarm-panel', 'tile', 'sensor', 'picture-glance', 'markdown', 'humidifier'])(
    '[%s] keeps exactly the fields whose row the card shows',
    (type) => {
      const c = capsFor(type);
      const f = filterPresetStateForCardType(preset(), type).font;
      expect(f.color !== undefined, 'colour').toBe(c.fontColor);
      expect(f.fontSize !== undefined, 'size').toBe(c.fontSize);
      expect(f.fontWeight !== undefined, 'weight').toBe(c.fontWeight);
      // family has no row gate: it always rides along when the module shows
      expect(f.fontFamily).toBe(capsFor(type).modules.font ? 'Georgia' : '');
    },
  );

  it('the four named cards lose what they hide', () => {
    expect(filterPresetStateForCardType(preset(), 'date').font).toMatchObject({ color: undefined, fontSize: undefined });
    expect(filterPresetStateForCardType(preset(), 'alarm-panel').font.color).toBeUndefined();
    expect(filterPresetStateForCardType(preset(), 'area').font).toMatchObject({ color: undefined, fontSize: undefined, fontWeight: undefined });
    expect(filterPresetStateForCardType(preset(), 'alert').font.fontWeight).toBeUndefined();
  });

  it('a card that shows every row gets the font back unchanged', () => {
    expect(filterPresetStateForCardType(preset(), 'tile').font).toEqual(preset().font);
  });

  it('does not mutate the input', () => {
    const p = preset();
    filterPresetStateForCardType(p, 'date');
    expect(p.font.color).toBe('#ff0000');
  });
});
