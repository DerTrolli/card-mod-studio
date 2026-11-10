import { describe, it, expect } from 'vitest';
import { capsFor, NO_ACCENT_TYPES, NO_TEXT_COLOR_TYPES } from '../src/utils/card-caps.js';

// HA 2026.11 alert card — module-effect audit (HA 2026.11.0 + UIX 9.0.0):
// accent, Font text colour and Threshold accent/text colour have no effect.
describe('alert card gating', () => {
  it('hides accent, text colour and text size, keeps the rest', () => {
    expect(NO_ACCENT_TYPES.has('alert')).toBe(true);
    expect(NO_TEXT_COLOR_TYPES.has('alert')).toBe(true);
    const caps = capsFor('alert');
    expect(caps.fontColor).toBe(false);
    expect(caps.fontSize).toBe(false); // title stays 14px (only the family reaches it)
    expect(caps.thresholdProperty('accent-color')).toBe(false);
    expect(caps.thresholdProperty('text-color')).toBe(false);
    expect(caps.thresholdProperty('background')).toBe(true);
    expect(caps.thresholdProperty('icon-color')).toBe(true);
  });
});
