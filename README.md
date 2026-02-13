<div align="center">

# :star: GitHub Star Tracker

**Track star count changes across your repositories — automatically.**

[![CI](https://github.com/fbuireu/github-star-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/fbuireu/github-star-tracker/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

📚 **[Complete Documentation](../../wiki)** — Detailed guides, examples, and troubleshooting

</div>

---

## Features

- ✅ **Automated tracking** — Schedule daily, weekly, or on-demand
- 📊 **Visual charts** — Star trends and per-repository comparisons
- 🌍 **Multi-language** — English, Spanish, Catalan, Italian
- 📧 **Email reports** — Built-in SMTP or external action
- 🎯 **Flexible output** — Data branch, badges, action outputs
- 🔒 **Secure** — Uses Personal Access Tokens with minimal scopes

---

## Quick Start

### 1. Create a Personal Access Token

1. Go to **[GitHub Settings → Personal access tokens](https://github.com/settings/tokens)**
2. Generate **classic token** with `repo` or `public_repo` scope
3. Add to **repository secrets** as `STAR_TRACKER_TOKEN`

> [!NOTE]
> `STAR_TRACKER_TOKEN` must be a [Personal Access Token](https://github.com/settings/tokens) with `repo` or `public_repo` scope. The default `GITHUB_TOKEN` is not sufficient.

> 📖 **[Detailed PAT Guide](../../wiki/Personal-Access-Token-Guide)** — Step-by-step for classic & fine-grained tokens

---

### 2. Add the Workflow

Create `.github/workflows/star-tracker.yml`:

```yaml
name: Track Stars

on:
  schedule:
    - cron: '0 0 * * *' # Daily at midnight
  workflow_dispatch:

permissions:
  contents: write

jobs:
  track:
    runs-on: ubuntu-latest
    steps:
      - uses: fbuireu/github-star-tracker@v1
        with:
          github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
```

---

### 3. Run and View

- **Manual run:** Go to **Actions** → **Track Stars** → **Run workflow**
- **View report:** Check the `star-tracker-data` branch in your repository

That's it! The action will track stars and generate reports automatically.

---

## Documentation

### 📚 [Complete Wiki](../../wiki)

| Guide                                                     | Description                                    |
| --------------------------------------------------------- | ---------------------------------------------- |
| **[Getting Started](../../wiki/Getting-Started)**         | Complete setup guide from token to first run   |
| **[PAT Guide](../../wiki/Personal-Access-Token-Guide)**   | Detailed PAT creation (classic & fine-grained) |
| **[Configuration](../../wiki/Configuration)**             | All available options and settings             |
| **[Viewing Reports](../../wiki/Viewing-Reports)**         | Multiple ways to access your data              |
| **[Star Trend Charts](../../wiki/Star-Trend-Charts)**     | Interactive chart visualization                |
| **[Email Notifications](../../wiki/Email-Notifications)** | Setup email alerts (built-in & external)       |
| **[Data Management](../../wiki/Data-Management)**         | How data is stored and managed                 |
| **[Troubleshooting](../../wiki/Troubleshooting)**         | Common issues and solutions                    |
| **[API Reference](../../wiki/API-Reference)**             | Complete inputs and outputs                    |
| **[Examples](../../wiki/Examples)**                       | Real-world usage examples                      |

---

## How It Works

1. Fetches star counts for your repositories via GitHub API
2. Compares with previous snapshot from the data branch
3. Generates reports with star trends and changes
4. Commits data to the `star-tracker-data` branch
5. Optionally sends email notifications

📖 **[Learn more about data management](../../wiki/Data-Management)**

---

## Supported Languages

- 🇬🇧 **English** (`en`)
- 🇪🇸 **Spanish** (`es`)
- 🇪🇸 **Catalan** (`ca`)
- 🇮🇹 **Italian** (`it`)

📖 **[Internationalization guide](../../wiki/Internationalization)**

---

## Configuration

### Basic Example

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    visibility: 'public' # 'public', 'private', or 'all'
    locale: 'en' # Report language
    include-charts: true # Star trend charts
```

### With Email Notifications

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    smtp-host: smtp.gmail.com
    smtp-port: '587'
    smtp-username: ${{ secrets.EMAIL_FROM }}
    smtp-password: ${{ secrets.EMAIL_PASSWORD }}
    email-from: ${{ secrets.EMAIL_FROM }}
    email-to: ${{ secrets.EMAIL_TO }}
```

### Configuration File

Create `.github/star-tracker-config.json`:

```json
{
  "visibility": "public",
  "locale": "en",
  "includeCharts": true
}
```

📖 **[Complete configuration reference](../../wiki/Configuration)**

---

## Inputs & Outputs

### Required Inputs

| Input          | Description                          |
| -------------- | ------------------------------------ |
| `github-token` | Personal Access Token (**required**) |

### Optional Inputs

| Input            | Default | Description                         |
| ---------------- | ------- | ----------------------------------- |
| `visibility`     | `all`   | `public`, `private`, or `all`       |
| `locale`         | `en`    | `en`, `es`, `ca`, or `it`           |
| `include-charts` | `true`  | Enable star trend charts            |
| `smtp-host`      | —       | SMTP server for email notifications |
| `email-to`       | —       | Recipient email address             |

📖 **[Full API reference](../../wiki/API-Reference)**

### Outputs

```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}

- name: Use outputs
  run: |
    echo "Total stars: ${{ steps.tracker.outputs.total-stars }}"
    echo "New stars: ${{ steps.tracker.outputs.new-stars }}"
```

Available: `report`, `report-html`, `total-stars`, `stars-changed`, `new-stars`, `lost-stars`

---

## Examples

### Track All Repositories

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    visibility: 'all'
```

### Spanish Reports with Charts

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    locale: 'es'
    include-charts: true
```

### Email on Changes Only

```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}

- name: Send email
  if: steps.tracker.outputs.stars-changed == 'true'
  uses: dawidd6/action-send-mail@v9
  with:
    server_address: smtp.gmail.com
    server_port: 587
    username: ${{ secrets.EMAIL_FROM }}
    password: ${{ secrets.EMAIL_PASSWORD }}
    subject: '⭐ Stars changed: ${{ steps.tracker.outputs.total-stars }} total'
    to: ${{ secrets.EMAIL_TO }}
    from: GitHub Star Tracker
    html_body: ${{ steps.tracker.outputs.report-html }}
```

📖 **[More examples](../../wiki/Examples)**

---

## Viewing Reports

### Data Branch (Primary)

View at: `https://github.com/YOUR_USER/YOUR_REPO/tree/star-tracker-data`

Contains:

- `README.md` — Full report with charts
- `stars-data.json` — Historical data
- `stars-badge.svg` — Star count badge

### Badge in README

```markdown
![Stars](https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/star-tracker-data/stars-badge.svg)
```

### Action Outputs

Access data in subsequent workflow steps for custom integrations.

📖 **[Complete viewing guide](../../wiki/Viewing-Reports)**

---

## Troubleshooting

### Common Issues

| Issue                     | Solution                               |
| ------------------------- | -------------------------------------- |
| "Bad credentials"         | Verify PAT is valid and not expired    |
| "Resource not accessible" | Using `GITHUB_TOKEN` instead of PAT    |
| Charts not appearing      | Wait for 2nd run to accumulate history |
| Email not received        | Check SMTP credentials and spam folder |

📖 **[Full troubleshooting guide](../../wiki/Troubleshooting)**

---

## Support & Contributing

- 🐛 **[Report bugs](../../issues/new?template=bug_report.yml)**
- 💡 **[Request features](../../issues/new?template=feature_request.yml)**
- 📖 **[Improve docs](../../issues/new?template=documentation.yml)**
- 🔒 **[Security issues](../../security/policy)**
- 🤝 **[Contributing guidelines](CONTRIBUTING.md)** — How to contribute to this project

---

## License

[AGPL-3.0](LICENSE) © [Ferran Buireu](https://github.com/fbuireu)
