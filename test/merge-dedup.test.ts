/**
 * Integration tests for the card_mod:/uix: merge-and-cleanup-on-edit
 * feature, exercising the REAL open/save pipeline cms-panel and
 * cms-child-card-section share: buildMergedStudioState on open, then
 * applyStudioState (generateCss + applyCardModStyle) on save — both
 * exported from src/editor/studio-state.ts since v0.8.0, so these tests no
 * longer mirror a private method that could drift.
 *
 * Bug this covers: editing an already-styled card used to leave a stale
 * duplicate of the *other* key's content sitting alongside the new one
 * instead of consolidating into a single source of truth (reported against
 * v0.6.1). See yaml-generator.ts's applyCardModStyle doc comment and
 * state-mapper.ts's mergeStudioStates for the design.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseEntityRowCss, mergeEntityRowStyles } from '../src/parser/state-mapper.js';
import { applyCardModStyle, pickOutputKey } from '../src/generator/yaml-generator.js';
import { buildMergedStudioState, applyStudioState, initEntityRowStyles, applyEntityRowStyles } from '../src/editor/studio-state.js';
import type { CardModCardConfig, EntitiesCardRow } from '../src/types/index.js';

class FakeCustomElementRegistry {
  private registry = new Map<string, CustomElementConstructor>();
  define(name: string, ctor: CustomElementConstructor) {
    this.registry.set(name, ctor);
  }
  get(name: string) {
    return this.registry.get(name);
  }
}
const FAKE_ELEMENT = class {} as unknown as CustomElementConstructor;

function installUix() {
  const registry = new FakeCustomElementRegistry();
  registry.define('uix-node', FAKE_ELEMENT);
  (globalThis as { customElements: CustomElementRegistry }).customElements =
    registry as unknown as CustomElementRegistry;
}

function installCardMod() {
  const registry = new FakeCustomElementRegistry();
  registry.define('card-mod', FAKE_ELEMENT);
  (globalThis as { customElements: CustomElementRegistry }).customElements =
    registry as unknown as CustomElementRegistry;
}

/** The real open→save pipeline: re-derive + resave from whatever state is currently open. */
function editAndSave(config: CardModCardConfig): CardModCardConfig {
  const state = buildMergedStudioState(config);
  return applyStudioState(state, config);
}

describe('merge-and-clean on edit: card-level', () => {
  const originalRegistry = globalThis.customElements;
  afterEach(() => {
    (globalThis as { customElements: CustomElementRegistry }).customElements = originalRegistry;
  });

  it('renames (not duplicates) a card_mod-only card once UIX becomes the active engine', () => {
    // Exact bug report: a card already styled under card_mod: from before
    // UIX was installed. Editing it after installing UIX used to add a new
    // uix.style block while leaving the old card_mod.style untouched.
    installUix();
    const original: CardModCardConfig = {
      type: 'tile',
      entity: 'light.x',
      card_mod: { style: 'ha-state-icon {\n  color: red !important;\n}' },
    };
    const result = editAndSave(original);
    expect(result.uix?.style).toContain('color: red');
    expect(result.card_mod).toBeUndefined();
  });

  it('renames (not duplicates) a uix-only card once card-mod becomes the active engine', () => {
    installCardMod();
    const original: CardModCardConfig = {
      type: 'tile',
      entity: 'light.x',
      uix: { style: 'ha-state-icon {\n  color: blue !important;\n}' },
    };
    const result = editAndSave(original);
    expect(result.card_mod?.style).toContain('color: blue');
    expect(result.uix?.style).toBeUndefined();
  });

  it('merges a setting unique to the inactive key into the active key, then clears the inactive key', () => {
    // card_mod has icon color only; uix has accent color only. UIX is active.
    installUix();
    const original: CardModCardConfig = {
      type: 'tile',
      entity: 'light.x',
      card_mod: { style: 'ha-state-icon {\n  color: red !important;\n}' },
      uix: { style: 'ha-card {\n  --accent-color: blue;\n}' },
    };
    const result = editAndSave(original);
    expect(result.uix?.style).toContain('color: red'); // merged in from card_mod
    expect(result.uix?.style).toContain('--accent-color: blue'); // uix's own setting kept
    expect(result.card_mod).toBeUndefined(); // fully absorbed, no longer needed
  });

  it('active key wins on a genuine conflict (both sides configure the same module differently)', () => {
    // The user's real-world report: both sides have an accent-color
    // threshold, but with different rules/entities — not something that can
    // be merged field-by-field, so the active engine's version wins outright
    // and the inactive one (fully superseded) is cleared, not partially kept.
    installUix();
    const original: CardModCardConfig = {
      type: 'sensor',
      card_mod: {
        style:
          "ha-card {\n  --accent-color: {{ '#f44336' if states('sensor.power') | float(0) > 0 else '#888888' }};\n}",
      },
      uix: {
        style:
          "ha-card {\n  --accent-color: {{ '#9e9e9e' if states('sensor.power') | float(0) <= 0 else '#f44336' }};\n}",
      },
    };
    const result = editAndSave(original);
    expect(result.uix?.style).toContain("<= 0");
    expect(result.uix?.style).not.toContain('> 0');
    expect(result.card_mod).toBeUndefined();
  });

  it('does not merge from a uix secondary block that uses macros — leaves it untouched', () => {
    installCardMod();
    const original: CardModCardConfig = {
      type: 'tile',
      entity: 'light.x',
      card_mod: { style: 'ha-state-icon {\n  color: red !important;\n}' },
      uix: { style: 'ha-card {\n  --accent-color: {{ macros.foo() }};\n}', macros: { foo: { template: 'blue' } } },
    };
    const result = editAndSave(original);
    expect(result.card_mod?.style).toContain('color: red');
    // Untouched: neither cleared nor overwritten.
    expect(result.uix?.style).toBe('ha-card {\n  --accent-color: {{ macros.foo() }};\n}');
    expect(result.uix?.macros).toEqual({ foo: { template: 'blue' } });
  });

  it('a genuinely identical duplicate collapses to a single key with no behavior change', () => {
    installUix();
    const same = 'ha-state-icon {\n  color: red !important;\n}';
    const original: CardModCardConfig = {
      type: 'tile',
      entity: 'light.x',
      card_mod: { style: same },
      uix: { style: same },
    };
    const result = editAndSave(original);
    expect(result.uix?.style).toContain('color: red');
    expect(result.card_mod).toBeUndefined();
  });
});

describe('merge-and-clean on edit: differing unrecognised CSS under both keys', () => {
  const originalRegistry = globalThis.customElements;
  afterEach(() => {
    (globalThis as { customElements: CustomElementRegistry }).customElements = originalRegistry;
  });

  it('keeps BOTH keys\' unrecognised CSS through an edit (regression: secondary\'s was destroyed)', () => {
    installUix();
    const original: CardModCardConfig = {
      type: 'button',
      entity: 'light.x',
      card_mod: { style: 'ha-card { padding: 8px; }' }, // secondary once UIX is active
      uix: { style: 'ha-card { margin: 4px; }' },       // primary
    };
    const result = editAndSave(original);
    // Both leftovers survive under the active key; primary's declaration
    // comes last so it wins any same-property conflict.
    expect(result.uix?.style).toContain('padding: 8px');
    expect(result.uix?.style).toContain('margin: 4px');
    expect((result.uix!.style as string).indexOf('padding')).toBeLessThan(
      (result.uix!.style as string).indexOf('margin'),
    );
    expect(result.card_mod).toBeUndefined();
  });

  it('does not duplicate identical unrecognised CSS mirrored under both keys', () => {
    installUix();
    const original: CardModCardConfig = {
      type: 'button',
      entity: 'light.x',
      card_mod: { style: 'ha-card { padding: 8px; }' },
      uix: { style: 'ha-card { padding: 8px; }' },
    };
    const result = editAndSave(original);
    const matches = (result.uix!.style as string).match(/padding: 8px/g) ?? [];
    expect(matches).toHaveLength(1);
  });
});

describe('merge-and-clean on edit: entities-row level', () => {
  const originalRegistry = globalThis.customElements;
  afterEach(() => {
    (globalThis as { customElements: CustomElementRegistry }).customElements = originalRegistry;
  });

  it('merges icon (card_mod-only) and text (uix-only) row settings, then clears the inactive row key', () => {
    installUix();
    const row: EntitiesCardRow = {
      entity: 'light.x',
      card_mod: { style: '--state-icon-color: red;' },
      uix: { style: 'color: blue;' },
    };
    const outputKey = pickOutputKey();
    const primary = parseEntityRowCss(row.uix!.style as string);
    const secondary = parseEntityRowCss(row.card_mod!.style as string);
    const merged = mergeEntityRowStyles(primary, secondary);
    expect(merged.iconColor).toBe('red');
    expect(merged.textColor).toBe('blue');

    // And through the actual save path used by cms-panel.ts's
    // _applyEntityRowStyles (applyCardModStyle is shared with the card-level
    // path, so the same clear-the-inactive-key behavior applies here too).
    const rowCss = ':host {\n  --state-icon-color: red;\n  color: blue;\n}';
    const result = applyCardModStyle(rowCss, row as unknown as CardModCardConfig, outputKey);
    expect(result.uix?.style).toContain('color: blue');
    expect(result.uix?.style).toContain('--state-icon-color: red');
    expect(result.card_mod).toBeUndefined();
  });
});

describe('bare-string entities rows (YAML shorthand)', () => {
  const originalRegistry = globalThis.customElements;
  beforeEach(() => installCardMod());
  afterEach(() => {
    (globalThis as { customElements: CustomElementRegistry }).customElements = originalRegistry;
  });

  it('initEntityRowStyles creates a style slot for a bare-string row', () => {
    const config = {
      type: 'entities',
      entities: ['sensor.a', { entity: 'sensor.b', card_mod: { style: ':host { color: red; }' } }],
    } as unknown as CardModCardConfig;
    const styles = initEntityRowStyles(config);
    expect(styles['sensor.a']).toEqual({ iconColor: '', textColor: '' });
    expect(styles['sensor.b'].textColor).toBe('red');
  });

  it('applyEntityRowStyles promotes a styled bare-string row to object form and leaves unstyled ones as strings', () => {
    const config = {
      type: 'entities',
      entities: ['sensor.a', 'sensor.b'],
    } as unknown as CardModCardConfig;
    const result = applyEntityRowStyles(config, {
      'sensor.a': { iconColor: '', textColor: '', fontSizePx: 20, fontWeight: 'bold' },
      'sensor.b': { iconColor: '', textColor: '' },
    }) as unknown as { entities: Array<EntitiesCardRow | string> };

    const rowA = result.entities[0] as EntitiesCardRow;
    expect(typeof rowA).toBe('object');
    expect(rowA.entity).toBe('sensor.a');
    expect(rowA.card_mod?.style).toContain('font-size: 20px');
    expect(rowA.card_mod?.style).toContain('font-weight: bold');
    // Unstyled string row stays a plain string — no YAML churn.
    expect(result.entities[1]).toBe('sensor.b');
  });
});
