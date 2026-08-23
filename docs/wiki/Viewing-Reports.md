Multiple ways to access your star tracking data.

---

## Method 1: Data Branch (Primary)

All data is automatically saved to a dedicated branch (default: `star-tracker-data`).

### Contents

Every file the branch holds, and the condition under which each one appears, is tabulated in
**[Data Management](Data-Management#generated-files)**.

### Viewing

Navigate to:

```
https://github.com/YOUR_USER/YOUR_REPO/tree/star-tracker-data
```

GitHub automatically renders [`README.md`](https://github.com/fbuireu/github-star-tracker/blob/main/README.md) with all charts visible.

> [!NOTE]
> That `README.md` is the report, rewritten in full on every run. Editing it by hand is safe but pointless:
> the next run overwrites the file wholesale rather than merging into it. Anything you want to keep belongs
> on another branch, or in a file the action does not write.

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
| `lost-stars` | Stars lost against the comparison baseline (per run, not cumulative) |
| `new-stargazers` | New stargazers detected against the stored stargazer list, which every writing run rewrites - not affected by `compare-against` |
| `new-stars` | Stars gained against the comparison baseline (per run, not cumulative) |
| `notification-sent` | Whether an email was actually delivered (false when SMTP is unconfigured, `email-to` is empty, or the send failed). A `send-on-no-changes` email sets it `true` even though `should-notify` is `false` |
| `report` | Full Markdown report |
| `report-csv` | CSV report of the run |
| `report-html` | HTML report (for email) |
| `report-html-path` | File path to the HTML report (for large reports / custom mailers). Written on **every** run, including read-only ones and runs where no repository matched, and written outside the data branch so it never reaches a commit |
| `should-notify` | Whether the notification threshold was reached (cumulative across runs) |
| `stars-changed` | Whether stars changed against the comparison baseline (`true`/`false`) |
| `total-stars` | Total star count |

> [!NOTE]
> The comparison baseline is the previous run by default, and [`compare-against`](Configuration#compare-against) can move it to 24h, 7d or 30d ago. `new-stars` and `lost-stars` describe a single run and carry no memory of whether a notification was sent - gate recurring emails on `should-notify`, which accumulates until it fires. See **[Email Notifications](Email-Notifications)**.

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

- **[Star Trend Charts](Star-Trend-Charts)** - Chart types and embedding
- **[Email Notifications](Email-Notifications)** - Email setup
- **[Data Management](Data-Management)** - How data is stored and rotated
