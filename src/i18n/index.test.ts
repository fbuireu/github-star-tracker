import { describe, expect, it } from 'vitest';
import { getTranslations, interpolate, isValidLocale } from './index';

describe('interpolate', () => {
  it('replaces placeholders with params', () => {
    expect(interpolate({ template: 'Hello {name}!', params: { name: 'World' } })).toBe(
      'Hello World!',
    );
  });

  it('replaces multiple placeholders', () => {
    expect(
      interpolate({
        template: '{a} + {b} = {c}',
        params: { a: 1, b: 2, c: 3 },
      }),
    ).toBe('1 + 2 = 3');
  });

  it('leaves unmatched placeholders intact', () => {
    expect(interpolate({ template: 'Hello {name}!', params: {} })).toBe('Hello {name}!');
  });

  it('handles template with no placeholders', () => {
    expect(interpolate({ template: 'No placeholders', params: { key: 'val' } })).toBe(
      'No placeholders',
    );
  });
});

describe('getTranslations', () => {
  it('returns English translations by default', () => {
    const t = getTranslations('en');
    expect(t.report.title).toBe('Star Tracker Report');
  });

  it('returns English translations for en locale', () => {
    const t = getTranslations('en');
    expect(t.report.title).toBe('Star Tracker Report');
  });

  it('returns Spanish translations for es locale', () => {
    const t = getTranslations('es');
    expect(t.report.title).toBe('Informe de Seguimiento de Estrellas');
  });

  it('returns Catalan translations for ca locale', () => {
    const t = getTranslations('ca');
    expect(t.report.title).toBe("Informe de Seguiment d'Estrelles");
  });

  it('returns Italian translations for it locale', () => {
    const t = getTranslations('it');
    expect(t.report.title).toBe('Report Tracciamento Stelle');
  });
});

describe('isValidLocale', () => {
  it('returns true for valid locales', () => {
    expect(isValidLocale('en')).toBe(true);
    expect(isValidLocale('es')).toBe(true);
    expect(isValidLocale('ca')).toBe(true);
    expect(isValidLocale('it')).toBe(true);
  });

  it('returns false for invalid locales', () => {
    expect(isValidLocale('fr')).toBe(false);
    expect(isValidLocale('')).toBe(false);
    expect(isValidLocale('EN')).toBe(false);
  });
});
