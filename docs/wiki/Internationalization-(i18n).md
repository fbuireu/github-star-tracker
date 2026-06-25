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
| **Charts** | Axis date labels (formatted via locale-aware `Date.toLocaleDateString`) |
| **Forecast tables** | Method names, week labels, section titles |
| **Stargazer section** | Section title, count text, "starred on" dates |
| **Email subject** | Auto-generated localized subject line |

### Localized Email Subjects

| Locale | Example Subject |
|---|---|
| `en` | `GitHub Star Tracker Report: 523 (+15)` |
| `es` | `Informe de estrellas de GitHub: 523 (+15)` |
| `ca` | `Informe d'estrelles de GitHub: 523 (+15)` |
| `it` | `Rapporto stelle GitHub: 523 (+15)` |

---

## Translation Architecture

Translations live in `src/i18n/` as flat JSON files:

```
src/i18n/
├── en.json      # English translations
├── es.json      # Spanish
├── ca.json      # Catalan
├── it.json      # Italian
├── index.ts     # Loader, interpolation, validation
└── types.ts     # Translations interface
```

### Translation Keys

Each JSON file implements the `Translations` interface with these sections:

| Section | Keys | Description |
|---|---|---|
| `badge` | `totalStars` | Badge label text |
| `report` | `title`, `total`, `change`, `comparedTo`, `firstRun`, `repositories`, `stars`, `starsCount`, `trend`, `newRepositories`, `removedRepositories`, `removedRepoText`, `summary`, `starsGained`, `starsLost`, `netChange`, `starTrend`, `starHistory`, `topRepositories`, `byRepository`, `individualRepoCharts`, `badges.new` | Report sections and labels |
| `email` | `subject`, `subjectLine`, `defaultFrom` | Email content |
| `trends` | `up`, `down`, `stable` | Trend direction labels |
| `footer` | `generated`, `madeBy` | Report footer |
| `stargazers` | `sectionTitle`, `newStargazers`, `starredOn`, `noNewStargazers`, `stargazerCount`, `sampledNote` | Stargazer section |
| `forecast` | `sectionTitle`, `predictedStars`, `week`, `linearRegression`, `weightedMovingAverage`, `aggregate`, `byRepository`, `insufficientData`, `method`, `predicted` | Forecast tables |

### Interpolation

Templates use `{placeholder}` syntax:

```json
{
  "comparedTo": "Compared to snapshot from {date}",
  "starsCount": "{count} stars",
  "week": "Week {n}"
}
```

The `interpolate()` function replaces placeholders with provided values at render time. Unknown placeholders are left as-is.

---

## Fallback Behavior

If an invalid locale is provided:

1. The action logs a warning: `Invalid locale "xx", falling back to "en"`
2. English translations are used for the entire run
3. The workflow does **not** fail

---

## Adding a New Locale

To contribute a new language:

1. Copy `src/i18n/en.json` to `src/i18n/{code}.json`
2. Translate all values (keys stay in English)
3. Keep `{placeholder}` tokens untranslated
4. Add the import in `src/i18n/index.ts`
5. Add the code to `LOCALES` in `src/config/defaults.ts`
6. Add the code to `Locale` type in `src/config/types.ts`
7. Run `pnpm run validate` to check everything passes

See **[Contributing](https://github.com/fbuireu/github-star-tracker/blob/main/CONTRIBUTING.md)** for development setup.

---

## Next Steps

- **[Configuration](Configuration)** — `locale` setting
- **[Email Notifications](Email-Notifications)** — Localized email subjects
- **[Star Trend Charts](Star-Trend-Charts)** — Localized chart labels
