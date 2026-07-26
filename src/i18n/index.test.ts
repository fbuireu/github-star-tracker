import { describe, expect, it } from 'vitest';
import { getTranslations, interpolate, LOCALE_MAP, LOCALES } from './index';

const INTL_LOCALE_CODE_PATTERN = /^[a-z]{2}-[A-Z]{2}$/;

describe('interpolate prototype safety', () => {
  it('does not resolve a placeholder from the prototype chain', () => {
    expect(interpolate({ template: '{constructor}', params: {} })).toBe('{constructor}');
    expect(interpolate({ template: '{toString}', params: {} })).toBe('{toString}');
  });
});

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

describe('LOCALES', () => {
  it('lists every key of LOCALE_MAP', () => {
    expect(LOCALES).toEqual(['en', 'es', 'ca', 'it']);
  });

  it('has a translation bundle for every listed locale', () => {
    for (const locale of LOCALES) {
      expect(getTranslations(locale).report.title).toBeTruthy();
    }
  });

  it('maps every locale to an Intl code', () => {
    for (const locale of LOCALES) {
      expect(LOCALE_MAP[locale]).toMatch(INTL_LOCALE_CODE_PATTERN);
    }
  });
});
