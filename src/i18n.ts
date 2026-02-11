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

const translations: Record<Locale, Translations> = {
  en: {
    badge: {
      totalStars: 'total stars',
    },
    report: {
      title: 'Star Tracker Report',
      total: 'Total',
      change: 'Change',
      comparedTo: 'Compared to snapshot from',
      firstRun: 'first run',
      repositories: 'Repositories',
      stars: 'Stars',
      trend: 'Trend',
      newRepositories: 'New Repositories',
      removedRepositories: 'Removed Repositories',
      was: 'was',
      summary: 'Summary',
      starsGained: 'Stars gained',
      starsLost: 'Stars lost',
      netChange: 'Net change',
      badges: {
        new: 'NEW',
      },
    },
    email: {
      subject: 'GitHub Star Tracker Report',
      defaultFrom: 'GitHub Star Tracker',
    },
    trends: {
      up: 'up',
      down: 'down',
      stable: 'stable',
    },
  },
  es: {
    badge: {
      totalStars: 'estrellas totales',
    },
    report: {
      title: 'Informe de Seguimiento de Estrellas',
      total: 'Total',
      change: 'Cambio',
      comparedTo: 'Comparado con instantánea del',
      firstRun: 'primera ejecución',
      repositories: 'Repositorios',
      stars: 'Estrellas',
      trend: 'Tendencia',
      newRepositories: 'Nuevos Repositorios',
      removedRepositories: 'Repositorios Eliminados',
      was: 'tenía',
      summary: 'Resumen',
      starsGained: 'Estrellas ganadas',
      starsLost: 'Estrellas perdidas',
      netChange: 'Cambio neto',
      badges: {
        new: 'NUEVO',
      },
    },
    email: {
      subject: 'Informe de Seguimiento de Estrellas en GitHub',
      defaultFrom: 'Seguimiento de Estrellas GitHub',
    },
    trends: {
      up: 'subiendo',
      down: 'bajando',
      stable: 'estable',
    },
  },
  ca: {
    badge: {
      totalStars: 'estrelles totals',
    },
    report: {
      title: "Informe de Seguiment d'Estrelles",
      total: 'Total',
      change: 'Canvi',
      comparedTo: 'Comparat amb instantània del',
      firstRun: 'primera execució',
      repositories: 'Repositoris',
      stars: 'Estrelles',
      trend: 'Tendència',
      newRepositories: 'Nous Repositoris',
      removedRepositories: 'Repositoris Eliminats',
      was: 'tenia',
      summary: 'Resum',
      starsGained: 'Estrelles guanyades',
      starsLost: 'Estrelles perdudes',
      netChange: 'Canvi net',
      badges: {
        new: 'NOU',
      },
    },
    email: {
      subject: "Informe de Seguiment d'Estrelles a GitHub",
      defaultFrom: "Seguiment d'Estrelles GitHub",
    },
    trends: {
      up: 'pujant',
      down: 'baixant',
      stable: 'estable',
    },
  },
  it: {
    badge: {
      totalStars: 'stelle totali',
    },
    report: {
      title: 'Report Tracciamento Stelle',
      total: 'Totale',
      change: 'Variazione',
      comparedTo: 'Confrontato con snapshot del',
      firstRun: 'prima esecuzione',
      repositories: 'Repository',
      stars: 'Stelle',
      trend: 'Tendenza',
      newRepositories: 'Nuovi Repository',
      removedRepositories: 'Repository Rimossi',
      was: 'aveva',
      summary: 'Riepilogo',
      starsGained: 'Stelle guadagnate',
      starsLost: 'Stelle perse',
      netChange: 'Variazione netta',
      badges: {
        new: 'NUOVO',
      },
    },
    email: {
      subject: 'Report Tracciamento Stelle GitHub',
      defaultFrom: 'Tracciamento Stelle GitHub',
    },
    trends: {
      up: 'in aumento',
      down: 'in diminuzione',
      stable: 'stabile',
    },
  },
};

export function getTranslations(locale: Locale = 'en'): Translations {
  return translations[locale] || translations.en;
}

export function isValidLocale(value: string): value is Locale {
  return ['en', 'es', 'ca', 'it'].includes(value);
}
