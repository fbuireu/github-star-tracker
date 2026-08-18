How GitHub Star Tracker stores, rotates, and manages tracking data.

---

## Storage Location

All data lives on an **orphan branch** (default: `star-tracker-data`). This branch has its own Git history, completely separate from your `main` branch.

The branch name is configurable via `data-branch`:

```yaml
with:
  data-branch: 'my-star-data'
```

The working directory for the branch is derived from the name: a dot followed by the branch name (e.g. `.star-tracker-data/`).

---

## Generated Files

| File | Description | When Created |
|---|---|---|
| `README.md` | Markdown report with embedded charts | Every run |
| `stars-data.json` | Historical snapshot data | Every run |
| `stars-data.csv` | Flat per-repo export (`repository,owner,name,stars,previous,delta,status`) | Every run |
| `stars-badge.svg` | Star count badge | Every run |
| `stargazers.json` | Stargazer login map | Only with `track-stargazers: true` |
| `charts/star-history.svg` | Total stars chart | Charts on, once the reconstructed history has at least 2 points |
| `charts/comparison.svg` | Top repos comparison | Same condition as `star-history.svg` |
| `charts/forecast.svg` | Growth forecast | Same, plus the 3 snapshots a forecast needs |
| `charts/{owner}-{repo}.svg` | Per-repo charts | Same, one per top repository, and only where that repository's own history has 2 points |

Charts this run did not produce are deleted from `charts/`, so a repository that drops out of `top-repos` does not leave its file behind. Nothing outside `charts/` is ever removed, and only `.svg` files are considered.

The HTML report is **not** on this branch. It is written to the runner's temp directory and exposed as the `report-html-path` output, so it never reaches a commit.

> Charts are reconstructed from the real star history (each stargazer's `starred_at` date), not from accumulated per-run snapshots, so they render on the first run.

---

## Snapshot Structure

Each run creates a snapshot appended to the `snapshots` array in `stars-data.json`:

```json
{
  "version": 1,
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

- `timestamp` - ISO 8601 datetime of when the run occurred
- `totalStars` - sum of all tracked repos' stars
- `repos[]` - per-repo data (fullName, name, owner, stars)
- `starsAtLastNotification` - the star total captured when the last notification fired; used by the notification threshold system and updated only when a notification is actually sent, so the accumulated change keeps growing across runs that do not notify. How it is compared depends on [`notification-mode`](Configuration#notification-mode): `net` uses the absolute change, `gains` only counts upward movement

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

Pruning is a pure domain function (`addSnapshot()` in `src/domain/snapshot.ts`). It returns a new `History` object with the snapshot appended and old entries trimmed - no mutation, no side effects.

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

Entries are added and overwritten, never removed. A repository that leaves the tracked set keeps its entry,
so returning does not report its existing stargazers as new; the file therefore grows with the number of
repositories ever tracked.

A repository whose stargazers could not be read — a failed request, an empty response for a repo that has
stars, or a repo covered by `smart-sampling` — **keeps its previous login list** rather than being written
as empty. Without that, one transient failure would wipe the entry and the next successful run would report
every existing stargazer as new. The trade-off is that such an entry can be stale, and if the repository is
permanently unreadable it will never report a new stargazer again. Each affected repository is named in a
warning in the run log. The full reasoning is
[ADR 0012](https://github.com/fbuireu/github-star-tracker/blob/main/docs/adr/0012-unreadable-stargazer-lists-keep-their-previous-logins.md).

---

## First Run Behavior

On the first run:

1. The action creates the data branch as an orphan branch
2. An initial empty commit is made
3. All repos are recorded with `delta: 0` (no previous data to compare against)
4. Stargazers are fetched (charts are on by default) and the real star-history curve is reconstructed from their starred_at dates - so charts are generated on the first run.
5. Forecasts are generated on the first run as well, provided the reconstructed history has at least 3 points.

---

## Idempotency

If no star counts change between runs, the action detects this via `git diff --cached --quiet` and **skips the commit**. No empty commits are created.

---

## Data Branch Isolation

The data branch uses Git worktrees for isolation:

- **Primary worktree:** your main repo checkout (`GITHUB_WORKSPACE`)
- **Secondary worktree:** created at the dot-prefixed branch name (e.g. `.star-tracker-data/`), pointing to the data branch
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

- **[Viewing Reports](Viewing-Reports)** - How to access your data
- **[Configuration](Configuration)** - `data-branch` and `max-history` options
- **[How It Works](How-It-Works)** - Full execution pipeline
