GitHub Star Tracker supports multiple languages for all user-facing content: reports, charts, badges, emails, and forecasts.

---

## Supported Locales

| Code | Language | Example Badge |
|---|---|---|
| `en` | English (default) | `Total Stars` |
| `es` | Spanish | `Estrellas Totales` |
| `ca` | Catalan | `Estrelles Totals` |
| `it` | Italian | `Stelle Totali` |

---

## Setting the Locale

### Action Input

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    locale: 'es'
```

### Config File

```yaml
# star-tracker.yml
locale: es
```

---

## What Gets Localized

| Content | Examples |
|---|---|
| **Markdown report** | Section titles, summary labels, trend indicators, footer |
| **HTML email** | Same as Markdown, plus subject line |
| **SVG badge** | Label text (`Total Stars` / `Estrellas Totales` / ...) |
| **Charts, both kinds** | Chart titles, axis date labels (locale-aware `Date.toLocaleDateString`) and milestone labels |
| **Charts, SVG only** | The compact Y-axis counts (`1.2K`). The email charts let Chart.js draw its own ticks instead |
| **Badge number** | The star count is compacted in the report locale, so `1,200` reads `1.2K` in `en` and `1,2 mil` in `es` |
| **Forecast tables** | Method names, week labels, section titles |
| **Stargazer section** | Section title, count text, "starred on" dates |
| **Email subject** | Auto-generated localized subject line |

### Localized Email Subjects

| Locale | Example Subject |
|---|---|
| `en` | `GitHub Star Tracker Report: 523 (+15)` |
| `es` | `Informe de Seguimiento de Estrellas en GitHub: 523 (+15)` |
| `ca` | `Informe de Seguiment d'Estrelles a GitHub: 523 (+15)` |
| `it` | `Report Tracciamento Stelle GitHub: 523 (+15)` |

The shape is `email.subjectLine` (`{subject}: {totalStars} ({delta})`, identical in all four bundles)
interpolated over `email.subject`. This is the only place the subject is written out; do not restate it
elsewhere.

---

## Translation Architecture

Translations live in `src/i18n/` as JSON files, one per locale:

```
src/i18n/
├── en.json      # English translations
├── es.json      # Spanish
├── ca.json      # Catalan
├── it.json      # Italian
├── index.ts     # Bundle map, getTranslations(), interpolate()
└── types.ts     # Translations interface
```

`index.ts` validates nothing. Checking that a configured `locale` is one of the four is the config loader's
job (`src/config/loader.ts`), which warns before this folder is ever reached.

### Translation Keys

Each JSON file implements the `Translations` interface with these sections:

| Section | Keys | Description |
|---|---|---|
| `badge` | `totalStars` | Badge label text |
| `report` | `title`, `total`, `change`, `comparedTo`, `firstRun`, `noRepositories`, `repositories`, `stars`, `starsCount`, `trend`, `newRepositories`, `removedRepositories`, `removedRepoText`, `summary`, `starsGained`, `starsLost`, `netChange`, `starTrend`, `starHistory`, `topRepositories`, `byRepository`, `individualRepoCharts`, `repoChartHeading`, `trendLine`, `badges.new` | Report sections and labels |
| `email` | `subject`, `subjectLine`, `defaultFrom` | Email content |
| `trends` | `up`, `down`, `stable` | Trend direction labels |
| `velocity` | `sectionTitle`, `starsPerDay`, `growth`, `projection` | Growth velocity section |
| `footer` | `generated`, `madeBy` | Report footer |
| `stargazers` | `sectionTitle`, `newStargazers`, `starredOn`, `noNewStargazers`, `stargazerCount`, `sampledNote` | Stargazer section |
| `forecast` | `sectionTitle`, `predictedStars`, `week`, `linearRegression`, `weightedMovingAverage`, `aggregate`, `byRepository`, `insufficientData`, `method`, `predicted` | Forecast tables |

### Interpolation

Templates use `{placeholder}` syntax:

```json
{
  "comparedTo": "Compared to snapshot from {date}",
  "starsCount": "{count} stars",
  "removedRepoText": "{name}: was {count} stars",
  "projection": "~{days} days to {milestone} ★",
  "week": "Week {n}"
}
```

The `interpolate()` function replaces placeholders with provided values at render time. A placeholder is
exactly one brace pair around letters, digits or underscores: `{first name}` and `{user.name}` are not
placeholders and pass through untouched. So does any placeholder no value was supplied for, which is left
verbatim rather than becoming `undefined` or an empty string.

---

## Fallback Behavior

There are **two** fallbacks to English, at different moments, and only the first one you ever see.

**At config time**, an invalid `locale` input is caught by the config loader:

1. The action logs a warning: `Invalid locale "xx". Must be "en", "es", "ca", or "it". Falling back to "en"`
2. English translations are used for the entire run
3. The workflow does **not** fail

**At render time**, `getTranslations()` falls back to the English bundle for any locale it has no bundle
for, silently and with no warning. Because `Locale` is a closed union and the loader has already validated
the input, that second fallback is unreachable in a normal run: it is the safety net for a value that
dodged the type system, and it is the reason a partly-registered new locale renders in English rather than
crashing.

---

## Adding a New Locale

To contribute a new language:

1. Copy `src/i18n/en.json` to `src/i18n/{code}.json`
2. Translate all values (keys stay in English)
3. Keep `{placeholder}` tokens untranslated, spelled exactly as in `en.json`
4. Add the import in `src/i18n/index.ts`
5. Add the locale and its Intl code to `LOCALE_MAP` in `src/i18n/index.ts` (`LOCALES` and the `Locale` type derive from it, so there is no second list to maintain)
6. Register the imported bundle in the `TRANSLATIONS` map in `src/i18n/index.ts`
7. Run `pnpm verify` to check everything passes

`src/i18n/types.ts` needs **no** change. `resolveJsonModule` is on, so the new `.json` bundle is type-checked
against the existing `Translations` interface at compile time: a missing or mistyped key is a build error.
Note that *extra* keys are silently accepted, because an imported module is not a fresh object literal and
gets no excess-property check, which is why `pnpm typecheck` is the check that matters here.

Three documentation edits belong in the same commit, none of them derived from the code:

- the `locale` input description in `action.yml`, which hard-codes the four locale names
- the **Supported Locales** and **Localized Email Subjects** tables on this page
- the `locale` section of [Configuration](Configuration#locale)

See **[Contributing](https://github.com/fbuireu/github-star-tracker/blob/main/CONTRIBUTING.md)** for development setup.

---

## Next Steps

- **[Configuration](Configuration)** - `locale` setting
- **[Email Notifications](Email-Notifications)** - Localized email subjects
- **[Star Trend Charts](Star-Trend-Charts)** - Localized chart labels
