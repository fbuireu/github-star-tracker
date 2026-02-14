import { LOCALES } from '@config/defaults';
import type { Locale } from '@config/types';
import ca from './ca.json';
import en from './en.json';
import es from './es.json';
import it from './it.json';
import type { InterpolateParams, Translations } from './types';

export { LOCALES } from '@config/defaults';
export type { Locale } from '@config/types';
export type { Translations } from './types';

const PLACEHOLDER_PATTERN = /\{(\w+)\}/g;

export function interpolate({ template, params }: InterpolateParams): string {
  return template.replaceAll(PLACEHOLDER_PATTERN, (match, key) =>
    key in params ? String(params[key]) : match,
  );
}

const translations: Record<Locale, Translations> = { en, es, ca, it };

export function getTranslations(locale: Locale = 'en'): Translations {
  return translations[locale] || translations.en;
}

export function isValidLocale(value: string): value is Locale {
  return LOCALES.includes(value as Locale);
}
