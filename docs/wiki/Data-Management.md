How GitHub Star Tracker stores, rotates, and manages tracking data.

---

## Storage Location

All data lives on an **orphan branch** (default: `star-tracker-data`). This branch has its own Git history, completely separate from your `main` branch.

The branch name is configurable via `data-branch`:

```yaml
with:
  data-branch: 'my-star-data'
```

The working directory for the branch is derived from the name: `.${dataBranch}` (e.g. `.star-tracker-data/`).

---

## Generated Files

| File | Description | When Created |
|---|---|---|
| `README.md` | Markdown report with embedded charts | Every run |
| `stars-data.json` | Historical snapshot data | Every run |
| `stars-badge.svg` | Star count badge | Every run |
| `charts/star-history.svg` | Total stars chart | After 2+ runs |
| `charts/comparison.svg` | Top repos comparison | After 2+ runs |
| `charts/forecast.svg` | Growth forecast | After 3+ runs |
| `charts/{owner}-{repo}.svg` | Per-repo charts | After 2+ runs |
| `stargazers.json` | Stargazer login map | Only with `track-stargazers: true` |

---

## Snapshot Structure

Each run creates a snapshot appended to the `snapshots` array in `stars-data.json`:

```json
{
  "snapshots": [
    {
      "timestamp": "2026-02-15T00:00:00.000Z",
      "totalStars": 523,
      "repos": [
        {
          "fullName": "user/repo-a",
          "name": "repo-a",
          "owner": "user",
          "stars": 300
        },
        {
          "fullName": "user/repo-b",
          "name": "repo-b",
          "owner": "user",
          "stars": 223
        }
      ]
    }
  ],
  "starsAtLastNotification": 520
}
```

### Fields

- `timestamp` — ISO 8601 datetime of when the run occurred
- `totalStars` — sum of all tracked repos' stars
- `repos[]` — per-repo data (fullName, name, owner, stars)
- `starsAtLastNotification` — used by the notification threshold system; updated only when a notification is sent

---

## History Rotation

The `max-history` setting (default: `52`) controls how many snapshots are retained. When the limit is exceeded, the oldest snapshots are pruned.

| Schedule | `max-history: 52` covers | `max-history: 104` covers |
|---|---|---|
| Daily | ~7 weeks | ~15 weeks |
| Weekly | ~1 year | ~2 years |
| Monthly | ~4 years | ~8 years |

```yaml
with:
  max-history: '104'  # Keep more history
```

### How Pruning Works

Pruning is a pure domain function (`addSnapshot()` in `src/domain/snapshot.ts`). It returns a new `History` object with the snapshot appended and old entries trimmed — no mutation, no side effects.

The infrastructure layer (`writeHistory()`) only handles serialization to disk.

---

## Stargazer Data

When `track-stargazers: true`, the action maintains a separate `stargazers.json` file:

```json
{
  "user/repo-a": ["octocat", "defunkt"],
  "user/repo-b": ["octocat"]
}
```

This stores only login names (not avatars or dates) for efficient diffing between runs. Full stargazer details (avatar, profile URL, starred date) are only shown in reports.

---

## First Run Behavior

On the first run:

1. The action creates the data branch as an orphan branch
2. An initial empty commit is made
3. All repos are recorded with `delta: 0` (no previous data to compare against)
4. No charts are generated (need 2+ data points)
5. No forecasts are generated (need 3+ data points)

---

## Idempotency

If no star counts change between runs, the action detects this via `git diff --cached --quiet` and **skips the commit**. No empty commits are created.

---

## Data Branch Isolation

The data branch uses Git worktrees for isolation:

- **Primary worktree:** your main repo checkout (`GITHUB_WORKSPACE`)
- **Secondary worktree:** created at `.${dataBranch}/` pointing to the data branch
- Same `.git` directory but independent working trees
- Worktree is created at the start and removed in a `finally` block

This means the action never runs `git checkout` on your main branch, avoiding disruption.

---

## Manual Data Management

### Resetting Data

Delete the data branch to start fresh:

```bash
git push origin --delete star-tracker-data
```

The next workflow run will recreate it.

### Cloning Data Locally

```bash
git clone -b star-tracker-data --single-branch \
  https://github.com/YOUR_USER/YOUR_REPO.git star-data
```

### Viewing Raw JSON

```bash
curl -s https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/star-tracker-data/stars-data.json | jq .
```

---

## Data Size Estimates

| Repos Tracked | Approximate Size per Snapshot |
|---|---|
| 10 | ~1 KB |
| 50 | ~4 KB |
| 100 | ~8 KB |
| 500 | ~40 KB |

With `max-history: 52` and 100 repos, `stars-data.json` stays under ~500 KB.

---

## Next Steps

- **[Viewing Reports](Viewing-Reports)** — How to access your data
- **[Configuration](Configuration)** — `data-branch` and `max-history` options
- **[How It Works](How-It-Works)** — Full execution pipeline
