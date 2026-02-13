<div align="center">

# :star: GitHub Star Tracker

**Track star count changes across your repositories — automatically.**

[![CI](https://github.com/fbuireu/github-star-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/fbuireu/github-star-tracker/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

</div>

---

## How It Works

```mermaid
---
config:
  look: handDrawn
  theme: neutral
---
flowchart TD
    trigger(["Workflow Trigger"])
    config["Parse configuration"]
    fetch["Query GitHub REST API(repositories endpoint)"]
    filter["Apply filter criteria"]
    init["Initialize orphan branch"]
    read["Deserialize previous  state snapshot"]
    compare["Compute delta metrics"]
    md["Markdown report"]
    json["JSON dataset"]
    svg["SVG badge"]
    html["HTML digest"]
    commit["Git commit & push (data branch)"]
    setout["Export action outputs"]
    email{"SMTP configured?"}
    send["Dispatch notification"]

    trigger --> config --> fetch --> filter
    filter --> init --> read --> compare
    compare --> md & json & svg & html
    md & json & svg & html --> commit --> setout --> email
    email -->|Yes| send

    style trigger fill:#e1f5ff,stroke:#01579b,stroke-width:2px
    style config fill:#fff3e0,stroke:#e65100,stroke-width:2px
    style fetch fill:#fff3e0,stroke:#e65100,stroke-width:2px
    style filter fill:#fff3e0,stroke:#e65100,stroke-width:2px
    style init fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    style read fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    style compare fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    style md fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px
    style json fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px
    style svg fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px
    style html fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px
    style commit fill:#fce4ec,stroke:#880e4f,stroke-width:2px
    style setout fill:#fce4ec,stroke:#880e4f,stroke-width:2px
    style email fill:#fce4ec,stroke:#880e4f,stroke-width:2px
    style send fill:#fce4ec,stroke:#880e4f,stroke-width:2px
```

1. On each scheduled run, the action fetches star counts for your repos via the GitHub API
2. It reads the previous snapshot from `stars-data.json` on the **data branch**
3. Compares current vs. previous counts — computing per-repo deltas, new repos, and removed repos
4. Generates a **Markdown report** (committed as `README.md` on the data branch), an **SVG badge**, and an **HTML report** (available as an action output or sent via email)
5. Appends a new snapshot to the history and pushes everything to the data branch
6. Your `main` branch is never touched

---

## Supported Languages

Reports, badges, and email notifications are available in:

- 🇬🇧 **English** (`en`) — default
- 🇪🇸 **Spanish** (`es`) — Español
- 🇪🇸 **Catalan** (`ca`) — Català
- 🇮🇹 **Italian** (`it`) — Italiano

Set the `locale` input to change the language.

---

## Usage

### 1. Create a Personal Access Token

The action needs to read all your repositories, which requires a Personal Access Token (PAT):

1. Go to **[GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)](https://github.com/settings/tokens)**
2. Click **"Generate new token (classic)"**
3. Give it a descriptive name: `Star Tracker`
4. Select **expiration** (recommend: No expiration, or 1 year)
5. Select scopes:
   - ✅ **`repo`** (Full control of private repositories) — for private repos
   - ✅ **`public_repo`** (Access public repositories) — if you only track public repos
6. Click **"Generate token"** and copy it
7. In your repository, go to **Settings → Secrets and variables → Actions**
8. Click **"New repository secret"**
9. Name: `STAR_TRACKER_TOKEN`
10. Paste your token and save

> [!WARNING]
> The default `GITHUB_TOKEN` **does not work** because it only has access to the current repository, not all your repositories.

### 2. Add the workflow

Create `.github/workflows/star-tracker.yml` in your repository:

```yaml
name: Track Stars

on:
  schedule:
    - cron: '0 8 * * 1' # Every Monday at 08:00 UTC
  workflow_dispatch: # Allow manual runs

permissions:
  contents: write # Required to push to the data branch

jobs:
  track:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Track star changes
        uses: fbuireu/github-star-tracker@v1
        with:
          github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
```

### 3. (Optional) Create a config file

For advanced filtering, create `star-tracker.yml` at your repo root:

```yaml
visibility: 'public' # "public" | "private" | "all"
include_archived: false
include_forks: false
min_stars: 0
exclude_repos:
  - 'some-old-repo'
only_repos: [] # If set, ONLY these repos are tracked
data_branch: 'star-tracker-data'
max_history: 52
include_charts: true # Set to false to disable trend charts
```

You don't need this file for basic usage — the action works with sensible defaults out of the box.

### 3. Run it

- **Manually:** Go to `Actions` > `Track Stars` > `Run workflow`
- **Automatically:** It runs on the cron schedule you defined

### 4. Check results

After the first run, a new branch `star-tracker-data` appears in your repo with the report.

---

## Where Is the Data Stored?

Everything lives on a **separate orphan branch** (default: `star-tracker-data`). This branch has no relation to your source code — it only contains tracking data.

```mermaid
---
config:
  look: handDrawn
  theme: neutral
---
graph TD
    src["src/Application source"]
    wf[".github/workflows/Workflow definition"]
    readme["README.md Tabular report view"]
    json["stars-data.json Time-series dataset"]
    badge["stars-badge.svg Shields.io badge"]

    wf --> readme & json & badge

    style src fill:#e3f2fd,stroke:#1565c0,stroke-width:2px
    style wf fill:#e3f2fd,stroke:#1565c0,stroke-width:2px
    style readme fill:#fff3e0,stroke:#e65100,stroke-width:2px
    style json fill:#fff3e0,stroke:#e65100,stroke-width:2px
    style badge fill:#fff3e0,stroke:#e65100,stroke-width:2px
```

### `README.md` — The Report

Navigate to the data branch on GitHub to see a rendered table with an optional **star trend chart**:

#### 📈 Star Trend

![Star History Chart](https://via.placeholder.com/800x400/dfb317/ffffff?text=Star+History+Chart)

| Repository           | Stars | Change |       Trend        |
| :------------------- | ----: | -----: | :----------------: |
| user/popular-lib     |   342 |    +12 |     :arrow_up:     |
| user/side-project    |    18 |     -1 |    :arrow_down:    |
| user/new-thing `NEW` |     3 |      0 | :heavy_minus_sign: |

### `stars-data.json` — The History

An array of timestamped snapshots. Each snapshot records every tracked repo and its star count at that point in time. Old snapshots are automatically trimmed to `max-history` (default 52 — one year of weekly snapshots).

### `stars-badge.svg` — The Badge

A shields.io-style badge you can embed anywhere:

```markdown
![Stars](https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/star-tracker-data/stars-badge.svg)
```

You can also link directly to the report:

```markdown
[View star report](https://github.com/YOUR_USER/YOUR_REPO/tree/star-tracker-data)
```

---

## Email Notifications

Two ways to get email reports. Use whichever fits your setup.

### Option A: Chain with `dawidd6/action-send-mail@v9`

The action exposes `report-html` as an output, so you can pipe it into any email action:

```yaml
steps:
  - uses: actions/checkout@v4

  - name: Track star changes
    id: tracker
    uses: fbuireu/github-star-tracker@v1
    with:
      github-token: ${{ secrets.STAR_TRACKER_TOKEN }}

  - name: Send email report
    if: steps.tracker.outputs.stars-changed == 'true'
    uses: dawidd6/action-send-mail@v9
    with:
      server_address: smtp.gmail.com
      server_port: 465
      username: ${{ secrets.EMAIL_USERNAME }}
      password: ${{ secrets.EMAIL_PASSWORD }}
      subject: 'Star Tracker: ${{ steps.tracker.outputs.total-stars }} total stars'
      html_body: ${{ steps.tracker.outputs.report-html }}
      to: ${{ secrets.EMAIL_TO }}
      from: GitHub Star Tracker
```

### Option B: Built-in email (no extra step)

Just provide SMTP credentials as inputs:

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    smtp-host: smtp.gmail.com
    smtp-port: '465'
    smtp-username: ${{ secrets.EMAIL_USERNAME }}
    smtp-password: ${{ secrets.EMAIL_PASSWORD }}
    email-to: ${{ secrets.EMAIL_TO }}
    email-from: 'Star Tracker <noreply@example.com>'
```

> [!NOTE]  
> **Gmail users:** Use an [App Password](https://myaccount.google.com/apppasswords), not your regular password (requires 2-Step Verification).

---

## Inputs

All inputs are passed via `with:` in your workflow file. Only `github-token` is required.

| Input                | Description                                                                       | Default               |
| :------------------- | :-------------------------------------------------------------------------------- | :-------------------- |
| **`github-token`**   | Personal Access Token with `repo` or `public_repo` scope. **Required.** Use `${{ secrets.STAR_TRACKER_TOKEN }}` | —                     |
| `config-path`        | Path to the YAML configuration file                                               | `star-tracker.yml`    |
| `visibility`         | Which repos to track: `public`, `private`, or `all`                               | `public`              |
| `include-archived`   | Include archived repositories                                                     | `false`               |
| `include-forks`      | Include forked repositories                                                       | `false`               |
| `exclude-repos`      | Comma-separated repo names to exclude                                             | `''`                  |
| `only-repos`         | Comma-separated repo names to **exclusively** track (overrides all other filters) | `''`                  |
| `min-stars`          | Only include repos with at least this many stars                                  | `0`                   |
| `data-branch`        | Branch name where tracking data is stored                                         | `star-tracker-data`   |
| `max-history`        | Maximum number of historical snapshots to retain                                  | `52`                  |
| `smtp-host`          | SMTP server host. **Providing this enables built-in email.**                      | `''`                  |
| `smtp-port`          | SMTP server port                                                                  | `587`                 |
| `smtp-username`      | SMTP authentication username                                                      | `''`                  |
| `smtp-password`      | SMTP authentication password                                                      | `''`                  |
| `email-to`           | Email recipient address                                                           | `''`                  |
| `email-from`         | Email sender name or address                                                      | `GitHub Star Tracker` |
| `send-on-no-changes` | Send email even when no star changes are detected                                 | `false`               |
| `include-charts`     | Include star trend charts in reports (`true`/`false`)                             | `true`                |
| `locale`             | Language for reports and emails: `en`, `es`, `ca`, `it`                           | `en`                  |

> [!NOTE]
> Inputs override values from the config file. If both are set, the input wins.

---

## Outputs

Use these in subsequent workflow steps via `${{ steps.<id>.outputs.<name> }}`.

| Output          | Description                               | Example              |
| :-------------- | :---------------------------------------- | :------------------- |
| `report`        | Full Markdown report                      | _(multiline string)_ |
| `report-html`   | Full HTML report (for email)              | _(multiline string)_ |
| `total-stars`   | Total stars across all tracked repos      | `363`                |
| `stars-changed` | Whether any counts changed since last run | `true` / `false`     |
| `new-stars`     | Total stars **gained** since last run     | `15`                 |
| `lost-stars`    | Total stars **lost** since last run       | `3`                  |

---

## Examples

### Minimal — just track, no email

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
```

### Track all repos (including private)

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    visibility: 'all'
```

### Track only specific repos

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    only-repos: 'my-awesome-lib, another-project'
```

### Spanish reports and emails

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    locale: 'es'
    smtp-host: smtp.gmail.com
    smtp-port: '465'
    smtp-username: ${{ secrets.EMAIL_USERNAME }}
    smtp-password: ${{ secrets.EMAIL_PASSWORD }}
    email-to: ${{ secrets.EMAIL_TO }}
```

### Daily snapshots, weekly email digest

```yaml
on:
  schedule:
    - cron: '0 8 * * *' # Snapshot every day at 08:00 UTC
  workflow_dispatch:

jobs:
  track:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Track stars
        id: tracker
        uses: fbuireu/github-star-tracker@v1
        with:
          github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
          visibility: 'all'
          min-stars: '1'

      - name: Send weekly digest (Mondays only)
        if: >
          steps.tracker.outputs.stars-changed == 'true' &&
          github.event.schedule == '0 8 * * 1'
        uses: dawidd6/action-send-mail@v9
        with:
          server_address: smtp.gmail.com
          server_port: 465
          username: ${{ secrets.EMAIL_USERNAME }}
          password: ${{ secrets.EMAIL_PASSWORD }}
          subject: 'Weekly Star Report: ${{ steps.tracker.outputs.total-stars }} stars'
          html_body: ${{ steps.tracker.outputs.report-html }}
          to: ${{ secrets.EMAIL_TO }}
          from: GitHub Star Tracker
```

---

## Star Trend Charts

Reports can include interactive star trend charts powered by [QuickChart](https://quickchart.io). Charts are generated when there are at least 2 historical snapshots.

### Features

- **Line charts** showing star growth over time
- **Localized dates** based on your `locale` setting
- **Last 30 data points** for optimal readability
- **No dependencies** — rendered via external API

### Configuration

Charts are **enabled by default**. To disable them:

**Via workflow input:**

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
    include-charts: false
```

**Via config file:**

```yaml
include_charts: false
```

### Considerations

**Pros:**

- Visual representation of star trends
- Works natively in GitHub Markdown
- No build dependencies or local image generation

**Potential concerns:**

- **External dependency**: Charts are generated by QuickChart.io API
- **Email size**: HTML emails with embedded chart URLs are ~1-2KB larger
- **Privacy**: Chart data (star counts and dates) is encoded in the URL
- **Rate limits**: QuickChart is free but has rate limits (generally not an issue for scheduled workflows)

If you prefer to keep reports minimal or avoid external services, set `include-charts: false`.

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Install dependencies: `pnpm install`
4. Make your changes
5. Run tests: `pnpm test`
6. Build: `pnpm run build`
7. Commit both `src/` and `dist/` changes
8. Open a Pull Request

## License

[AGPL-3.0](LICENSE) &copy; [Ferran Buireu](https://github.com/fbuireu)
