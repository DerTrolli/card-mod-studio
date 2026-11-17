/**
 * i18n — the Studio's own interface text in the user's language.
 *
 * - `en.ts` is the source of truth: every message key and its English text.
 *   Other languages are typed against it, so a missing key fails `tsc`.
 * - All languages are bundled into the one `card-mod-studio.js` (no dynamic
 *   import: the release attaches a single file, and HACS installs one file).
 * - The language follows the Studio's own setting: "auto" (the default) uses
 *   the language Home Assistant shows its interface in for this user, mapped
 *   to its base language (`de-CH` → `de`), else English.
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

export type { MessageKey } from './en.js';

/** Languages the Studio ships, with their own name for the selector. */
export const LANGUAGES = {
  en: { name: 'English', messages: en as Record<MessageKey, string> },
  de: { name: 'Deutsch', messages: de as Record<MessageKey, string> },
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

/** `de-CH` / `de_AT` / `DE` → `de` when shipped; `en` otherwise. */
export function supportedLanguage(tag: string | undefined | null): LanguageCode {
  if (!tag) return 'en';
  const lower = String(tag).trim().toLowerCase().replace('_', '-');
  if (isLanguageCode(lower)) return lower;
  const base = lower.split('-')[0];
  return isLanguageCode(base) ? base : 'en';
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
