import ca from './ca.json';
import en from './en.json';
import es from './es.json';
import it from './it.json';

export type Locale = 'en' | 'es' | 'ca' | 'it';

export interface Translations {
  badge: {
    totalStars: string;
  };
  report: {
    title: string;
    total: string;
    change: string;
    comparedTo: string;
    firstRun: string;
    repositories: string;
    stars: string;
    trend: string;
    newRepositories: string;
    removedRepositories: string;
    was: string;
    summary: string;
    starsGained: string;
    starsLost: string;
    netChange: string;
    starTrend: string;
    starHistory: string;
    topRepositories: string;
    byRepository: string;
    badges: {
      new: string;
    };
  };
  email: {
    subject: string;
    defaultFrom: string;
  };
  trends: {
    up: string;
    down: string;
    stable: string;
  };
}

const translations: Record<Locale, Translations> = { en, es, ca, it };

export function getTranslations(locale: Locale = 'en'): Translations {
  return translations[locale] || translations.en;
}

export function isValidLocale(value: string): value is Locale {
  return ['en', 'es', 'ca', 'it'].includes(value);
}
