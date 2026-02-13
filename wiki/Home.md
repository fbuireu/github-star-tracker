# GitHub Star Tracker Wiki

Welcome to the **GitHub Star Tracker** documentation! This action automatically tracks stars across your GitHub repositories and generates beautiful reports with trend visualization.

## 📚 Documentation Sections

### Getting Started
- **[Getting Started](Getting-Started)** — Quick setup guide and first run
- **[Configuration](Configuration)** — Complete reference of all configuration options
- **[Examples](Examples)** — Real-world usage examples

### Features
- **[Viewing Reports](Viewing-Reports)** — How to access your star tracking reports
- **[Star Trend Charts](Star-Trend-Charts)** — Interactive chart visualization
- **[Email Notifications](Email-Notifications)** — Setup email alerts (built-in & external)
- **[Internationalization](Internationalization)** — Multi-language support

### Reference
- **[API Reference](API-Reference)** — Complete inputs and outputs reference
- **[Troubleshooting](Troubleshooting)** — Common issues and solutions

## 🚀 Quick Start

```yaml
name: Track Stars
on:
  schedule:
    - cron: '0 0 * * *'  # Daily at midnight
  workflow_dispatch:

jobs:
  track:
    runs-on: ubuntu-latest
    steps:
      - uses: fbuireu/github-star-tracker@v1
        with:
          github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
```

## 🌟 Key Features

- ✅ **Automated tracking** — Schedule daily, weekly, or on-demand
- 📊 **Visual charts** — Star trends and per-repository comparisons
- 🌍 **Multi-language** — English, Spanish, Catalan, Italian
- 📧 **Email reports** — Built-in SMTP or external action
- 🎯 **Flexible output** — Data branch, badges, action outputs
- 🔒 **Secure** — Uses Personal Access Tokens with minimal scopes

## 📖 About

GitHub Star Tracker is a GitHub Action that helps you monitor your repository stars over time. It generates comprehensive reports with historical data, trend charts, and insights about which repositories are gaining or losing stars.

**Repository:** [fbuireu/github-star-tracker](https://github.com/fbuireu/github-star-tracker)  
**Marketplace:** [GitHub Star Tracker](https://github.com/marketplace/actions/github-star-tracker)  
**License:** MIT

## 🤝 Contributing

Found a bug? Have a feature request? 

- [Report bugs](https://github.com/fbuireu/github-star-tracker/issues/new?template=bug_report.yml)
- [Request features](https://github.com/fbuireu/github-star-tracker/issues/new?template=feature_request.yml)
- [Improve documentation](https://github.com/fbuireu/github-star-tracker/issues/new?template=documentation.yml)
- [Security issues](https://github.com/fbuireu/github-star-tracker/security/policy)
