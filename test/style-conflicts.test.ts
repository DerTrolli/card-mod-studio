import { describe, it, expect } from 'vitest';
import { findAdvancedCssConflicts, findRowExtraCssConflicts } from '../src/utils/style-conflicts.js';
import { migrateStudioState } from '../src/parser/state-mapper.js';

const base = () => migrateStudioState({});

describe('findAdvancedCssConflicts', () => {
  it('flags an enabled module whose property Advanced CSS also sets', () => {
    const s = base();
    s.background.enabled = true;
    const c = findAdvancedCssConflicts('ha-card {\n  background: red;\n}', s);
    expect(c.background).toEqual(['ha-card { background }']);
  });

  it('stays silent when the module is disabled (custom CSS is simply THE styling)', () => {
    const c = findAdvancedCssConflicts('ha-card {\n  background: red;\n}', base());
    expect(c).toEqual({});
  });

  it('maps icon variables, legacy :host form, and threshold-driven properties', () => {
    const s = base();
    s.iconColor.enabled = true;
    s.threshold.enabled = true;
    s.threshold.properties = ['accent-color'];
    const c = findAdvancedCssConflicts(
      ':host {\n  --paper-item-icon-color: red;\n}\nha-gauge {\n  --gauge-color: blue !important;\n}',
      s,
    );
    expect(c.iconColor).toEqual([':host { --paper-item-icon-color }']);
    expect(c.threshold).toEqual(['ha-gauge { --gauge-color }']);
  });

  it('handles empty/garbage CSS without throwing', () => {
    expect(findAdvancedCssConflicts('', base())).toEqual({});
    expect(findAdvancedCssConflicts('not css at all', base())).toEqual({});
  });
});

describe('findRowExtraCssConflicts', () => {
  it('flags row extraCss that fights the row controls', () => {
    const hits = findRowExtraCssConflicts({
      iconColor: '#ff0000',
      textColor: '',
      extraCss: ':host {\n  --state-icon-color: green !important;\n}',
    });
    expect(hits).toEqual([':host { --state-icon-color }']);
  });

  it('silent when no controls are on or no extraCss', () => {
    expect(findRowExtraCssConflicts({ iconColor: '', textColor: '' })).toEqual([]);
    expect(findRowExtraCssConflicts({ iconColor: 'red', textColor: '' })).toEqual([]);
  });
});
