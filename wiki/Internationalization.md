# Internationalization

GitHub Star Tracker supports multiple languages for reports, charts, and email notifications.

## Supported Languages

| Code | Language | Native Name |
| ---- | -------- | ----------- |
| `en` | English  | English     |
| `es` | Spanish  | Español     |
| `ca` | Catalan  | Català      |
| `it` | Italian  | Italiano    |

---

## Configuration

Set the locale in your workflow:

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    locale: 'es' # Spanish
```

Or in configuration file:

```json
{
  "locale": "es",
  "visibility": "all",
  "includeCharts": true
}
```

---

## What Gets Localized

### Report Sections

All report headers and labels:

**English (en):**

```markdown
# GitHub Stars Report

Total stars: 123
Stars gained: 5
Last updated: February 13, 2026
```

**Spanish (es):**

```markdown
# Informe de estrellas de GitHub

Estrellas totales: 123
Estrellas ganadas: 5
Última actualización: 13 de febrero de 2026
```

---

### Chart Labels

Chart titles and axis labels:

**English:**

- "Star Trend"
- "Top Repositories"
- "By Repository"

**Spanish:**

- "Tendencia de Estrellas"
- "Principales Repositorios"
- "Por Repositorio"

---

### Date Formatting

Dates are formatted per locale:

| Locale | Format Example        |
| ------ | --------------------- |
| `en`   | February 13, 2026     |
| `es`   | 13 de febrero de 2026 |
| `ca`   | 13 de febrer de 2026  |
| `it`   | 13 febbraio 2026      |

---

### Email Subject Lines

**Built-in email subject (auto-generated):**

| Locale | Subject                                               |
| ------ | ----------------------------------------------------- |
| `en`   | GitHub Stars Report: 123 total stars                  |
| `es`   | Informe de estrellas de GitHub: 123 estrellas totales |
| `ca`   | Informe d'estrelles de GitHub: 123 estrelles totals   |
| `it`   | Rapporto stelle GitHub: 123 stelle totali             |

---

## Translation Keys

### Report Labels

| Key           | en                  | es                             | ca                            | it                     |
| ------------- | ------------------- | ------------------------------ | ----------------------------- | ---------------------- |
| `report`      | GitHub Stars Report | Informe de estrellas de GitHub | Informe d'estrelles de GitHub | Rapporto stelle GitHub |
| `totalStars`  | Total stars         | Estrellas totales              | Estrelles totals              | Stelle totali          |
| `starsGained` | Stars gained        | Estrellas ganadas              | Estrelles guanyades           | Stelle guadagnate      |
| `starsLost`   | Stars lost          | Estrellas perdidas             | Estrelles perdudes            | Stelle perse           |
| `lastUpdated` | Last updated        | Última actualización           | Última actualització          | Ultimo aggiornamento   |
| `repository`  | Repository          | Repositorio                    | Repositori                    | Repository             |
| `stars`       | Stars               | Estrellas                      | Estrelles                     | Stelle                 |

### Chart Labels

| Key               | en               | es                       | ca                     | it                    |
| ----------------- | ---------------- | ------------------------ | ---------------------- | --------------------- |
| `starTrend`       | Star Trend       | Tendencia de Estrellas   | Tendència d'Estrelles  | Tendenza Stelle       |
| `starHistory`     | Star History     | Historial de Estrellas   | Historial d'Estrelles  | Storico Stelle        |
| `topRepositories` | Top Repositories | Principales Repositorios | Principals Repositoris | Repository Principali |
| `byRepository`    | By Repository    | Por Repositorio          | Per Repositori         | Per Repository        |

---

## Adding New Languages

Want to add a new language? Contribute by:

1. Fork the repository
2. Create translation file: `src/i18n/[locale].json`
3. Add to `src/i18n/index.ts`
4. Update type definitions
5. Submit a pull request

**Translation file structure:**

```json
{
  "report": "Translation",
  "totalStars": "Translation",
  "starsGained": "Translation",
  "starsLost": "Translation",
  "lastUpdated": "Translation",
  "repository": "Translation",
  "stars": "Translation",
  "starTrend": "Translation",
  "starHistory": "Translation",
  "topRepositories": "Translation",
  "byRepository": "Translation"
}
```

---

## Next Steps

- **[Configuration](Configuration)** — Locale configuration
- **[Examples](Examples)** — Multi-language setups
- [Contribute translations](https://github.com/fbuireu/github-star-tracker/blob/main/CONTRIBUTING.md)
