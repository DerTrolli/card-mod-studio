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

  it('flags overrides of the Heading Style module in both its v0.10 and legacy shapes', () => {
    const s = base();
    // Every field set: an unset one is not overridden (see the set/unset tests below).
    Object.assign(s.headingStyle, { enabled: true, fontSize: 20, textColor: 'red', fontWeight: 'bold', iconColor: 'blue' });
    const c = findAdvancedCssConflicts(
      '.container {\n  --ha-heading-card-title-color: red;\n}\n.content ha-icon {\n  color: blue;\n}\n.title p {\n  font-size: 9px;\n}',
      s,
    );
    expect(c.headingStyle).toEqual([
      '.container { --ha-heading-card-title-color }',
      '.content ha-icon { color }',
      '.title p { font-size }',
    ]);
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

describe('Font / Heading Style warn only for fields that are set', () => {
  const css = 'ha-card {\n  font-size: 30px;\n  color: red;\n  font-weight: bold;\n  font-family: serif;\n}';
  const font = (f: object, c = css) => {
    const s = base();
    Object.assign(s.font, { enabled: true, ...f });
    return findAdvancedCssConflicts(c, s).font;
  };

  it('Font on with nothing set: no warning', () => expect(font({})).toBeUndefined());
  it('only Weight set: only font-weight', () => expect(font({ fontWeight: 'bold' })).toEqual(['ha-card { font-weight }']));
  it('size + colour set', () => expect(font({ fontSize: 20, color: 'red' })).toEqual(['ha-card { font-size }', 'ha-card { color }']));
  it('family set', () => expect(font({ fontFamily: 'serif' })).toEqual(['ha-card { font-family }']));
  it('companion variables follow their own field', () => {
    const c = 'ha-card {\n  --ha-tile-info-primary-font-size: 9px;\n  --primary-text-color: red;\n}';
    expect(font({ color: 'red' }, c)).toEqual(['ha-card { --primary-text-color }']);
  });

  const hs = (f: object, c: string) => {
    const s = base();
    Object.assign(s.headingStyle, { enabled: true, ...f });
    return findAdvancedCssConflicts(c, s).headingStyle;
  };
  const hcss = '.container {\n  --ha-heading-card-title-font-size: 9px;\n  --ha-heading-card-title-color: red;\n}\n.content ha-icon {\n  color: blue;\n  --mdc-icon-size: 9px;\n}';
  it('Heading Style on with nothing set: no warning', () => expect(hs({}, hcss)).toBeUndefined());
  it('Heading Style: each field maps to its own declarations', () => {
    expect(hs({ fontSize: 20 }, hcss)).toEqual(['.container { --ha-heading-card-title-font-size }']);
    expect(hs({ textColor: 'red' }, hcss)).toEqual(['.container { --ha-heading-card-title-color }']);
    expect(hs({ iconSize: 20 }, hcss)).toEqual(['.content ha-icon { --mdc-icon-size }']);
    expect(hs({ iconColor: 'red' }, hcss)).toEqual(['.content ha-icon { color }']);
  });
});
