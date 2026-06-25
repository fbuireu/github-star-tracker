Multiple ways to access your star tracking data.

---

## Method 1: Data Branch (Primary)

All data is automatically saved to a dedicated branch (default: `star-tracker-data`).

### Contents

| File | Description |
|---|---|
| `README.md` | Full Markdown report with embedded SVG charts |
| `stars-data.json` | Complete historical data (JSON) |
| `stars-badge.svg` | Star count badge |
| `charts/star-history.svg` | Animated total stars chart |
| `charts/comparison.svg` | Top repos comparison chart |
| `charts/forecast.svg` | Growth forecast chart |
| `charts/{owner}-{repo}.svg` | Per-repo charts |
| `stargazers.json` | Stargazer login map (if `track-stargazers` enabled) |

### Viewing

Navigate to:

```
https://github.com/YOUR_USER/YOUR_REPO/tree/star-tracker-data
```

GitHub automatically renders `README.md` with all charts visible.

---

## Method 2: Badges

Display your star count in your main README.

### Basic Badge

```markdown
![Total Stars](https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/star-tracker-data/stars-badge.svg)
```

### Linked Badge (Clickable)

```markdown
[![Total Stars](https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/star-tracker-data/stars-badge.svg)](https://github.com/YOUR_USER/YOUR_REPO/tree/star-tracker-data)
```

### Star History Chart in README

```markdown
![Star History](https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/star-tracker-data/charts/star-history.svg)
```

### Other Charts

```markdown
<!-- Comparison chart -->
![Comparison](https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/star-tracker-data/charts/comparison.svg)

<!-- Forecast chart -->
![Forecast](https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/star-tracker-data/charts/forecast.svg)

<!-- Per-repo chart (replace owner-repo with your repo) -->
![Per-Repo](https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/star-tracker-data/charts/owner-repo.svg)
```

---

## Method 3: Action Outputs

Access data in subsequent workflow steps for custom integrations.

### Available Outputs

| Output | Description |
|---|---|
| `report` | Full Markdown report |
| `report-html` | HTML report (for email) |
| `report-html-path` | File path to the HTML report (for large reports / custom mailers) |
| `total-stars` | Total star count |
| `stars-changed` | Whether stars changed (`true`/`false`) |
| `new-stars` | Stars gained since last run |
| `lost-stars` | Stars lost since last run |
| `should-notify` | Whether notification threshold reached |
| `new-stargazers` | New stargazers detected |

### Example

```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}

- name: Print summary
  run: |
    echo "Total stars: ${{ steps.tracker.outputs.total-stars }}"
    echo "Changed: ${{ steps.tracker.outputs.stars-changed }}"
    echo "New: ${{ steps.tracker.outputs.new-stars }}"
    echo "Lost: ${{ steps.tracker.outputs.lost-stars }}"
```

---

## Method 4: Email

Send HTML reports directly to your inbox.

See **[Email Notifications](Email-Notifications)** for complete setup.

---

## Accessing Raw Data

### Download JSON

```bash
curl https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/star-tracker-data/stars-data.json
```

### Clone Data Branch

```bash
git clone -b star-tracker-data --single-branch \
  https://github.com/YOUR_USER/YOUR_REPO.git star-data
```

### Query with jq

```bash
curl -s https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/star-tracker-data/stars-data.json \
  | jq '.snapshots[0].totalStars'
```

---

## Access Control

- **Public repos:** data branch is publicly visible
- **Private repos:** data branch inherits the repo's access restrictions; badges won't render for unauthorized users

---

## Next Steps

- **[Star Trend Charts](Star-Trend-Charts)** — Chart types and embedding
- **[Email Notifications](Email-Notifications)** — Email setup
- **[Data Management](Data-Management)** — How data is stored and rotated
