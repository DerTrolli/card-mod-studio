/**
 * i18n — the Studio's own interface text in the user's language.
 *
 * - `en.ts` is the source of truth: every message key and its English text.
 *   Other languages are typed against it, so a missing key fails `tsc`.
 * - All languages are bundled into the one `card-mod-studio.js` (no dynamic
 *   import: the release attaches a single file, and HACS installs one file).
 * - The language follows the Studio's own setting: "auto" (the default) uses
 *   the language Home Assistant shows its interface in for this user —
 *   Home Assistant's own codes (`pt-BR`, `zh-Hant`, `nb`), matched exactly,
 *   then through FALLBACKS and the base language (`de-CH` → `de`), else
 *   English.
 * - Text is looked up at render time with `t()`. Elements that render text
 *   add a `LangController`, so an open panel re-renders when the language
 *   changes. Lists of labels must be built inside render, not at import time.
 *
 * Only the interface is translated. Generated CSS, Jinja, stored values,
 * preset and palette names the user typed, and anything compared in code
 * stay as they are.
 */
import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { en, type MessageKey } from './en.js';
import { de } from './de.js';
import { nl } from './nl.js';
import { fr } from './fr.js';
import { es } from './es.js';
import { it } from './it.js';
import { pl } from './pl.js';
import { pt } from './pt.js';
import { ptBR } from './pt-BR.js';
import { sv } from './sv.js';
import { da } from './da.js';
import { nb } from './nb.js';
import { cs } from './cs.js';
import { sk } from './sk.js';
import { hu } from './hu.js';
import { fi } from './fi.js';
import { ru } from './ru.js';
import { uk } from './uk.js';
import { zhHans } from './zh-Hans.js';
import { zhHant } from './zh-Hant.js';
import { ja } from './ja.js';
import { ko } from './ko.js';

export type { MessageKey } from './en.js';

/** Languages the Studio ships, with their own name for the selector. */
export const LANGUAGES = {
  en: { name: 'English', messages: en as Record<MessageKey, string> },
  de: { name: 'Deutsch', messages: de as Record<MessageKey, string> },
  nl: { name: 'Nederlands', messages: nl as Record<MessageKey, string> },
  fr: { name: 'Français', messages: fr as Record<MessageKey, string> },
  es: { name: 'Español', messages: es as Record<MessageKey, string> },
  it: { name: 'Italiano', messages: it as Record<MessageKey, string> },
  pl: { name: 'Polski', messages: pl as Record<MessageKey, string> },
  pt: { name: 'Português', messages: pt as Record<MessageKey, string> },
  'pt-BR': { name: 'Português (Brasil)', messages: ptBR as Record<MessageKey, string> },
  sv: { name: 'Svenska', messages: sv as Record<MessageKey, string> },
  da: { name: 'Dansk', messages: da as Record<MessageKey, string> },
  nb: { name: 'Norsk bokmål', messages: nb as Record<MessageKey, string> },
  cs: { name: 'Čeština', messages: cs as Record<MessageKey, string> },
  sk: { name: 'Slovenčina', messages: sk as Record<MessageKey, string> },
  hu: { name: 'Magyar', messages: hu as Record<MessageKey, string> },
  fi: { name: 'Suomi', messages: fi as Record<MessageKey, string> },
  ru: { name: 'Русский', messages: ru as Record<MessageKey, string> },
  uk: { name: 'Українська', messages: uk as Record<MessageKey, string> },
  'zh-Hans': { name: '简体中文', messages: zhHans as Record<MessageKey, string> },
  'zh-Hant': { name: '繁體中文', messages: zhHant as Record<MessageKey, string> },
  ja: { name: '日本語', messages: ja as Record<MessageKey, string> },
  ko: { name: '한국어', messages: ko as Record<MessageKey, string> },
} as const;

export type LanguageCode = keyof typeof LANGUAGES;
export type LanguageSetting = 'auto' | LanguageCode;

export const LANGUAGE_CHANGED_EVENT = 'cms-language-changed';

export function isLanguageCode(v: unknown): v is LanguageCode {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(LANGUAGES, v);
}

export function isLanguageSetting(v: unknown): v is LanguageSetting {
  return v === 'auto' || isLanguageCode(v);
}

/**
 * A language setting from outside, in any case — the integration sends
 * lower-case codes (`pt-br`), since Home Assistant only allows lower-case
 * option keys. Unknown → undefined.
 */
export function toLanguageSetting(v: unknown): LanguageSetting | undefined {
  if (typeof v !== 'string') return undefined;
  if (v === 'auto') return 'auto';
  return shippedCode(v.toLowerCase());
}

/** Lower-case code → the shipped code (`pt-br` → `pt-BR`). */
function shippedCode(lower: string): LanguageCode | undefined {
  return (Object.keys(LANGUAGES) as LanguageCode[]).find((c) => c.toLowerCase() === lower);
}

/**
 * Codes Home Assistant or a browser may report that aren't a shipped code
 * themselves (lower case). Checked after an exact match and before the base
 * language, so `zh-TW` goes to Traditional, not to `zh`.
 */
const FALLBACKS: Record<string, string> = {
  zh: 'zh-Hans',
  'zh-cn': 'zh-Hans',
  'zh-sg': 'zh-Hans',
  'zh-my': 'zh-Hans',
  'zh-tw': 'zh-Hant',
  'zh-hk': 'zh-Hant',
  'zh-mo': 'zh-Hant',
  'pt-pt': 'pt',
  'pt-ao': 'pt',
  'pt-mz': 'pt',
  no: 'nb',
  nn: 'nb',
  'es-419': 'es',
};

/**
 * Home Assistant's language tag → a shipped language: exact (any case, `_`
 * or `-`), then FALLBACKS, then ever shorter prefixes (`zh-Hant-TW` →
 * `zh-Hant`, `de-CH` → `de`), else English.
 */
export function supportedLanguage(tag: string | undefined | null): LanguageCode {
  if (!tag) return 'en';
  const parts = String(tag).trim().toLowerCase().replace(/_/g, '-').split('-').filter(Boolean);
  for (let n = parts.length; n > 0; n--) {
    const lower = parts.slice(0, n).join('-');
    const hit = shippedCode(lower) ?? (FALLBACKS[lower] ? shippedCode(FALLBACKS[lower].toLowerCase()) : undefined);
    if (hit) return hit;
  }
  return 'en';
}

/** The language a setting resolves to, given Home Assistant's language. */
export function resolveLanguage(setting: LanguageSetting, haLanguage: string | undefined | null): LanguageCode {
  return setting === 'auto' ? supportedLanguage(haLanguage) : setting;
}

let setting: LanguageSetting = 'auto';
let haLanguage: string | undefined;
let current: LanguageCode = 'en';

function update(): void {
  const next = resolveLanguage(setting, haLanguage);
  if (next === current) return;
  current = next;
  const target = globalThis as unknown as { dispatchEvent?: (e: Event) => boolean };
  if (typeof target.dispatchEvent === 'function' && typeof Event === 'function') {
    target.dispatchEvent(new Event(LANGUAGE_CHANGED_EVENT));
  }
}

/** The language Home Assistant shows its interface in (what "auto" follows). */
export function setHomeAssistantLanguage(language: string | undefined | null): void {
  if (!language || language === haLanguage) return;
  haLanguage = language;
  update();
}

/** `hass.locale.language` (HA 2023+) or `hass.language`. */
export function languageOfHass(hass: unknown): string | undefined {
  const h = hass as { locale?: { language?: string }; language?: string } | undefined;
  return h?.locale?.language || h?.language || undefined;
}

export function setLanguageSetting(next: LanguageSetting): void {
  setting = isLanguageSetting(next) ? next : 'auto';
  update();
}

export function getLanguageSetting(): LanguageSetting {
  return setting;
}

export function currentLanguage(): LanguageCode {
  return current;
}

/** What "auto" resolves to right now, and Home Assistant's own tag. */
export function autoLanguage(): { code: LanguageCode; haLanguage: string | undefined } {
  return { code: supportedLanguage(haLanguage), haLanguage };
}

export type MessageParams = Record<string, string | number>;

const PLACEHOLDER = /\{(\w+)\}/g;

function lookup(key: MessageKey, lang: LanguageCode = current): string {
  const own = LANGUAGES[lang].messages[key];
  return own !== undefined && own !== '' ? own : en[key];
}

/** The message for `key` in the current language, with `{name}` placeholders filled. */
export function t(key: MessageKey, params?: MessageParams): string {
  const text = lookup(key);
  if (!params) return text;
  return text.replace(PLACEHOLDER, (m, name: string) => (name in params ? String(params[name]) : m));
}

/**
 * Like `t()`, but placeholders may be any renderable value (a lit template,
 * a `<code>` element): returns the pieces in order, for `html\`${...}\``.
 * Keeps a sentence whole in every language while parts of it are marked up.
 */
export function tParts(key: MessageKey, params: Record<string, unknown>): unknown[] {
  const text = lookup(key);
  const out: unknown[] = [];
  let last = 0;
  for (const m of text.matchAll(PLACEHOLDER)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    out.push(m[1] in params ? params[m[1]] : m[0]);
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Re-renders its host when the interface language changes. */
export class LangController implements ReactiveController {
  constructor(private host: ReactiveControllerHost) {
    host.addController(this);
  }

  private onChange = () => this.host.requestUpdate();

  hostConnected(): void {
    globalThis.addEventListener?.(LANGUAGE_CHANGED_EVENT, this.onChange);
  }

  hostDisconnected(): void {
    globalThis.removeEventListener?.(LANGUAGE_CHANGED_EVENT, this.onChange);
  }
}

/** Test helper: back to the initial state (auto, no HA language). */
export function resetLanguageForTests(): void {
  setting = 'auto';
  haLanguage = undefined;
  current = 'en';
}
