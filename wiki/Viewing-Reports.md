# Viewing Reports

GitHub Star Tracker provides **multiple ways** to access your star tracking data. You don't need to use email to view reports — the action automatically saves data to a dedicated branch.

## 📊 Method 1: Data Branch (Primary)

**The main way to view reports** — all data is automatically saved to a dedicated branch.

### What's Included

The `star-tracker-data` branch contains:

- **`README.md`** — Full Markdown report with charts (if enabled)
- **`stars-data.json`** — Complete historical data in JSON format
- **`stars-badge.svg`** — SVG badge showing total star count

### Viewing the Data Branch

Navigate to:

```
https://github.com/YOUR_USERNAME/YOUR_REPO/tree/star-tracker-data
```

GitHub automatically renders the `README.md` with all charts visible.

### Example Data Branch

See a live example: [github-star-tracker/star-tracker-data](https://github.com/fbuireu/github-star-tracker/tree/star-tracker-data)

---

## 🎯 Method 2: Badges

Display your star count badge in your main repository README.

### Basic Badge

Show total star count:

```markdown
![Total Stars](https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/star-tracker-data/stars-badge.svg)
```

Result: ![Total Stars](https://img.shields.io/badge/stars-123-blue)

### Linked Badge

Make the badge clickable to view the full report:

```markdown
[![Total Stars](https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/star-tracker-data/stars-badge.svg)](https://github.com/YOUR_USERNAME/YOUR_REPO/tree/star-tracker-data)
```

### With Text Link

Combine badge with a descriptive link:

```markdown
![Total Stars](https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/star-tracker-data/stars-badge.svg)

[📊 View detailed star report](https://github.com/YOUR_USERNAME/YOUR_REPO/tree/star-tracker-data)
```

---

## 📤 Method 3: Action Outputs

Access report data in subsequent workflow steps for custom integrations.

### Available Outputs

| Output          | Type      | Description                          |
| --------------- | --------- | ------------------------------------ |
| `report`        | `string`  | Full Markdown report                 |
| `report-html`   | `string`  | HTML version (for emails)            |
| `total-stars`   | `number`  | Total star count across all repos    |
| `stars-changed` | `boolean` | Whether stars changed since last run |
| `new-stars`     | `number`  | Stars gained since last run          |
| `lost-stars`    | `number`  | Stars lost since last run            |

### Example Usage

```yaml
- name: Track star changes
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}

- name: Print summary
  run: |
    echo "Total stars: ${{ steps.tracker.outputs.total-stars }}"
    echo "Changed: ${{ steps.tracker.outputs.stars-changed }}"
    echo "New stars: ${{ steps.tracker.outputs.new-stars }}"
    echo "Lost stars: ${{ steps.tracker.outputs.lost-stars }}"
```

### Custom Notifications

Use outputs to trigger custom actions:

```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}

- name: Post to Slack
  if: steps.tracker.outputs.stars-changed == 'true'
  uses: slackapi/slack-github-action@v1
  with:
    payload: |
      {
        "text": "⭐ Stars changed! Total: ${{ steps.tracker.outputs.total-stars }} (+${{ steps.tracker.outputs.new-stars }})"
      }
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

### Save Report Artifact

Archive the report for later download:

```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}

- name: Save report
  run: echo "${{ steps.tracker.outputs.report }}" > star-report.md

- name: Upload artifact
  uses: actions/upload-artifact@v3
  with:
    name: star-report
    path: star-report.md
```

---

## 📧 Method 4: Email Notifications

Send reports directly to your inbox.

See **[Email Notifications](Email-Notifications)** for complete setup.

Quick example:

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    smtp-host: 'smtp.gmail.com'
    smtp-port: '587'
    smtp-username: ${{ secrets.EMAIL_FROM }}
    smtp-password: ${{ secrets.EMAIL_PASSWORD }}
    email-from: ${{ secrets.EMAIL_FROM }}
    email-to: ${{ secrets.EMAIL_TO }}
```

---

## 📁 Accessing Raw Data

### JSON Data Format

The `stars-data.json` file contains historical snapshots:

```json
[
  {
    "timestamp": "2026-02-13T00:00:00.000Z",
    "repositories": [
      {
        "name": "my-repo",
        "fullName": "username/my-repo",
        "stars": 123,
        "url": "https://github.com/username/my-repo"
      }
    ],
    "totalStars": 123
  }
]
```

### Downloading Data

Use `curl` or `wget` to download:

```bash
curl https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/star-tracker-data/stars-data.json
```

### Using in Scripts

```bash
# Get latest total stars
curl -s https://raw.githubusercontent.com/USERNAME/REPO/star-tracker-data/stars-data.json \
  | jq '.[0].totalStars'
```

---

## 🔍 Cloning the Data Branch

For advanced analysis, clone the data branch locally:

```bash
# Clone only the data branch
git clone -b star-tracker-data --single-branch \
  https://github.com/YOUR_USERNAME/YOUR_REPO.git star-data

cd star-data
cat stars-data.json | jq '.'
```

---

## 📊 Report Contents

### Markdown Report Structure

1. **Summary Header**
   - Total stars across all repositories
   - Stars gained/lost since last run
   - Last updated timestamp

2. **Star Trend Chart** (if enabled)
   - Line chart showing star growth over time
   - Interactive QuickChart visualization

3. **Repository List**
   - All tracked repositories with current star count
   - Sorted by star count (highest first)

4. **Top Repositories Chart** (if enabled)
   - Comparison chart of top 5 repositories
   - Individual trend lines per repository

### HTML Report Structure

Same structure as Markdown, but:

- Formatted for email clients
- Charts embedded as inline images
- Responsive design for mobile/desktop
- Styled with CSS for better readability

---

## 🎨 Customizing Views

### Badge Style

The default badge shows total stars. To customize, you can create your own badge using the data:

```markdown
![Stars](https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/USERNAME/REPO/star-tracker-data/stars-data.json&query=$[0].totalStars&label=stars&color=blue)
```

### Custom Report Template

The report format is currently fixed, but you can process the JSON data to create custom reports:

```javascript
// Fetch data
const data = await fetch('https://raw.githubusercontent.com/USERNAME/REPO/star-tracker-data/stars-data.json').then(
  (r) => r.json(),
);

// Custom analysis
const latest = data[0];
const previous = data[1];
const growth = latest.totalStars - previous.totalStars;
```

---

## 🔐 Access Control

### Public Repositories

Data branch is **public** by default — anyone can view your star reports.

### Private Repositories

If your main repository is private:

- The `star-tracker-data` branch is also **private**
- Only users with repository access can view reports
- Badges won't render for unauthorized users
- Consider using email notifications instead

---

## 📱 Mobile Viewing

All viewing methods work on mobile:

- **Data branch:** GitHub mobile app renders README with charts
- **Badges:** Display correctly in mobile browsers
- **Email reports:** Responsive HTML design for mobile clients

---

## Next Steps

- **[Star Trend Charts](Star-Trend-Charts)** — Enable and customize charts
- **[Email Notifications](Email-Notifications)** — Setup email reports
- **[API Reference](API-Reference)** — Complete outputs documentation
