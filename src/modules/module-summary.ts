/**
 * module-summary.ts — the one-line summary a closed module shows under its
 * title (v1.0.0): what it does on this card, e.g. "● · while ON",
 * "Pulse · 2s · when climate.hall is “heating”". Colours are shown as dots, a
 * fade as a bar. Built from the module's state only, from the module's own
 * labels where they exist; empty when the module writes nothing.
 */
import type {
  AccentColorModuleState,
  AnimationModuleState,
  BackgroundModuleState,
  BorderModuleState,
  FeaturesModuleState,
  FilterModuleState,
  FontModuleState,
  HeadingStyleModuleState,
  IconColorModuleState,
  StyleCondition,
  ThresholdModuleState,
} from '../types/index.js';
import type { SummaryPart } from './module-base.js';
import { t, type MessageKey } from '../i18n/index.js';

/** The phrase for a condition: '' (always), "while ON", "while x is ON",
 *  "when x > 5", "when x is “heating”". */
export function conditionPhrase(c: StyleCondition | undefined): string {
  if (!c || c.when === 'always') return '';
  if (c.when === 'on') return t('sum.whileOn');
  if (c.when === 'off') return t('sum.whileOff');
  if (c.when === 'custom') return c.customEntity ? t('sum.whileEntityOn', { entity: c.customEntity }) : '';
  if (!c.valueEntity) return '';
  const entity = c.valueAttribute ? `${c.valueEntity} → ${c.valueAttribute}` : c.valueEntity;
  if (c.valueText !== undefined) {
    if (!c.valueText) return '';
    return t(c.valueTextOperator === 'is-not' ? 'sum.whenNotText' : 'sum.whenText', { entity, value: c.valueText });
  }
  if (!c.valueOperator || c.valueThreshold === undefined) return '';
  return t('sum.whenValue', { entity, op: c.valueOperator, value: String(c.valueThreshold) });
}

/** The on/off/another-entity choice of Background, grayscale and Animation,
 *  or their "a value matches" condition. */
function whenPhrase(when: string, customEntity: string | undefined, condition?: StyleCondition): string {
  if (condition?.when === 'value') return conditionPhrase(condition);
  return conditionPhrase({ when: when as StyleCondition['when'], customEntity });
}

/** A label without its explanation in brackets: "Pulse (gentle scale)" → "Pulse". */
const short = (key: MessageKey) => t(key).split(/\s*[(（]/)[0];
/** "Brightness 60%": a control's own label and its value. */
const pair = (label: MessageKey, value: string) => t('sum.pair', { label: t(label), value });

const WEIGHT: Record<string, MessageKey> = { normal: 'font.weight.normal', medium: 'font.weight.medium', bold: 'font.weight.bold' };
const PRESET: Record<AnimationModuleState['preset'], MessageKey> = {
  pulse: 'anim.preset.pulse',
  breathe: 'anim.preset.breathe',
  'gradient-shift': 'anim.preset.gradientShift',
  blink: 'anim.preset.blink',
  bounce: 'anim.preset.bounce',
  shake: 'anim.preset.shake',
  spin: 'anim.preset.spin',
  glow: 'anim.preset.glow',
  heartbeat: 'anim.preset.heartbeat',
};

export function fontSummary(s: FontModuleState): SummaryPart[] {
  const p: SummaryPart[] = [];
  if (s.fontSize) p.push(`${s.fontSize}px`);
  if (s.fontWeight) p.push(t(WEIGHT[s.fontWeight]));
  if (s.fontFamily) p.push(s.fontFamily.split(',')[0].replace(/['"]/g, '').trim());
  if (s.color) p.push({ color: s.color });
  return p;
}

export function headingSummary(s: HeadingStyleModuleState): SummaryPart[] {
  const p: SummaryPart[] = [];
  if (s.fontSize) p.push(`${s.fontSize}px`);
  if (s.fontWeight) p.push(t(WEIGHT[s.fontWeight]));
  if (s.textColor) p.push({ color: s.textColor });
  if (s.iconColor) p.push({ color: s.iconColor });
  return p;
}

export function filterSummary(s: FilterModuleState): SummaryPart[] {
  const p: SummaryPart[] = [];
  if (s.grayscale) p.push(t('filter.grayscale'));
  if (s.brightness !== 100) p.push(pair('filter.brightness', `${s.brightness}%`));
  if (s.blur > 0) p.push(pair('filter.blur', `${s.blur}px`));
  if (s.opacity !== undefined && s.opacity < 100) p.push(pair('filter.opacity', `${s.opacity}%`));
  const when = s.grayscale ? whenPhrase(s.grayscaleWhen, s.customEntity, s.grayscaleCondition) : conditionPhrase(s.effectsWhen);
  if (p.length && when) p.push(when);
  return p;
}

export function accentSummary(s: AccentColorModuleState): SummaryPart[] {
  if (s.mode === 'plain') return s.color ? [{ color: s.color }] : [];
  return [{ color: s.colorOn }, { color: s.colorOff }, t('sum.onOff'), ...(s.entityId ? [s.entityId] : [])];
}

export function iconSummary(s: IconColorModuleState): SummaryPart[] {
  const p: SummaryPart[] = [];
  if (s.mode === 'plain' && s.color) p.push({ color: s.color });
  if (s.mode === 'conditional') p.push({ color: s.colorOn }, { color: s.colorOff }, t('sum.onOff'), ...(s.entityId ? [s.entityId] : []));
  if (s.mode === 'light') p.push(t('icon.matchLight'));
  if (s.sizePx) p.push(`${s.sizePx}px`);
  return p;
}

export function backgroundSummary(s: BackgroundModuleState): SummaryPart[] {
  const p: SummaryPart[] = s.type === 'gradient' ? [{ color: s.color1 }, { color: s.color2 }] : [{ color: s.color1 }];
  const when = whenPhrase(s.applyWhen, s.customEntity, s.condition);
  if (when) p.push(when);
  return p;
}

export function thresholdSummary(s: ThresholdModuleState): SummaryPart[] {
  const p: SummaryPart[] = [];
  if (s.valueMode === 'gradient') {
    if (!s.colorStops.length) return [];
    p.push({ gradient: [...s.colorStops].sort((a, b) => a.value - b.value).map((c) => c.color) });
  } else {
    if (!s.rules.length) return [];
    for (const r of s.rules.slice(0, 8)) p.push({ color: r.color });
  }
  if (s.entityId) p.push(s.attribute ? `${s.entityId} → ${s.attribute}` : s.entityId);
  return p;
}

export function animationSummary(s: AnimationModuleState): SummaryPart[] {
  const when = s.trigger === 'value'
    ? conditionPhrase({ when: 'value', ...s })
    : whenPhrase(s.trigger, s.customEntity);
  return [short(PRESET[s.preset]), `${s.speedS}s`, ...(when ? [when] : [])];
}

export function borderSummary(s: BorderModuleState): SummaryPart[] {
  const p: SummaryPart[] = [];
  if (s.squareCorners) p.push(t('border.square'));
  else if (s.radiusPx > 0) p.push(pair('border.radius', `${s.radiusPx}px`));
  if (s.borderWidth > 0) {
    p.push(pair('border.width', `${s.borderWidth}px`));
    if (s.borderColor) p.push({ color: s.borderColor });
    const when = conditionPhrase(s.widthWhen);
    if (when) p.push(when);
  }
  return p;
}

export function featuresSummary(s: FeaturesModuleState): SummaryPart[] {
  const p: SummaryPart[] = [];
  if (s.heightPx > 0) p.push(pair('features.height', `${s.heightPx}px`));
  if (s.radiusPx >= 0) p.push(pair('features.radius', `${s.radiusPx}px`));
  if (s.color) p.push({ color: s.color });
  return p;
}

/** Advanced CSS: its first line, as written. */
export function advancedSummary(rawCss: string): SummaryPart[] {
  const first = rawCss.split('\n').map((l) => l.trim()).find(Boolean);
  return first ? [{ code: first.length > 80 ? `${first.slice(0, 80)}…` : first }] : [];
}
