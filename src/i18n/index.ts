import ca from './ca.json';
import en from './en.json';
import es from './es.json';
import it from './it.json';
import type { InterpolateParams, Translations } from './types';

export const LOCALE_MAP = {
  en: 'en-US',
  es: 'es-ES',
  ca: 'ca-ES',
  it: 'it-IT',
} as const;

export type Locale = keyof typeof LOCALE_MAP;

export const LOCALES = Object.keys(LOCALE_MAP) as Locale[];

export type { Translations } from './types';

const TRANSLATIONS: Record<Locale, Translations> = { en, es, ca, it };
const PLACEHOLDER_PATTERN = /\{(\w+)\}/g;
const FALLBACK_LANG = TRANSLATIONS.en;

export function interpolate({ template, params }: InterpolateParams): string {
  return template.replaceAll(PLACEHOLDER_PATTERN, (match, key) =>
    Object.hasOwn(params, key) ? String(params[key]) : match,
  );
}

export function getTranslations(locale: Locale): Translations {
  return TRANSLATIONS[locale] || FALLBACK_LANG;
}
