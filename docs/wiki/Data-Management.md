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
| [`README.md`](https://github.com/fbuireu/github-star-tracker/blob/main/README.md) | Markdown report with embedded charts | Every run |
| `stars-data.json` | Historical snapshot data | Every run |
| `stars-data.csv` | Flat per-repo export (`repository,owner,name,stars,previous,delta,status`) | Every run |
| [`stars-badge.svg`](https://github.com/fbuireu/github-star-tracker/blob/main/examples/stars-badge.svg) | Star count badge | Every run |
| `stargazers.json` | Stargazer login map | Only with `track-stargazers: true` |
| `charts/star-history.svg` | Total stars chart | Charts on, once the charted series has at least 2 points |
| `charts/comparison.svg` | Top repos comparison | Same condition, plus at least one top repository |
| `charts/forecast.svg` | Growth forecast | Same, plus the 3 points a forecast needs |
| `charts/{owner}-{repo}.svg` | Per-repo charts | Same condition, one per top repository |

**"The charted series" is not always the reconstruction.** Charts prefer the **Reconstructed History**, built
from each stargazer's `starred_at` date, which is why they render on the very first run. When that
reconstruction has fewer than 2 points, for a repository whose stargazers could not be read at all, the chart
falls back to the **Stored History** instead. It is still drawn; it just spans the tracker's own runs rather
than the repository's life, so on a first run there may be too little of it and the file is skipped.

Charts this run did not produce are deleted from `charts/`, so a repository that drops out of `top-repos` does not leave its file behind. Nothing outside `charts/` is ever removed, and only `.svg` files are considered.

The HTML report is **not** on this branch. It is written to the runner's temp directory and exposed as the `report-html-path` output, so it never reaches a commit. It is written on every run, including read-only ones and runs where no repository matched.

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

- `version` - the on-disk format version, stamped by the writer as the first key. It is not part of a
  snapshot and never appears in a report; it exists so a newer branch cannot be misread by an older action
- `timestamp` - ISO 8601 datetime of when the run occurred
- `totalStars` - sum of all tracked repos' stars
- `repos[]` - per-repo data (fullName, name, owner, stars)
- `starsAtLastNotification` - **optional.** The star total captured when the notification baseline last
  advanced. It is absent until the first notification fires, and an absent value is read as `0`. How it is
  compared depends on [`notification-mode`](Configuration#notification-mode): `net` uses the absolute change,
  `gains` only counts upward movement

**When the baseline advances** is not simply "when an email is sent". A run that decides to notify advances
it both when the send succeeds *and* when no SMTP transport is configured at all, because in that case the
`should-notify` output is itself the notification. Only a send that was configured and **failed** holds it
back, so the accumulated change is not lost. A run that does not decide to notify never touches it, which is
what makes the counter keep growing across quiet runs.

### What the reader must not do to this file

The three things that make a run stop rather than continue on a guess:

| If `stars-data.json` | The run |
|---|---|
| is not valid JSON | fails, naming the parse error, and asks you to fix or delete the file on the data branch |
| is valid JSON but not an object (`null`, an array, a number, a string) | fails rather than reading it as an empty history and pushing over your record |
| declares a `version` higher than this action writes | fails and asks you to upgrade the action, or to point `data-branch` at a branch this version wrote |

An **absent** `version` is fine and always will be: every data branch predating the field has none, so it is
read as version 1. A `snapshots` key that is not an array is the one tolerated case; it normalizes to an
empty list while `starsAtLastNotification` survives.

Why all three stop the run rather than starting over, and the accepted cost that a broken file blocks every
later run until a human fixes it, is
[ADR 0021](https://github.com/fbuireu/github-star-tracker/blob/main/docs/adr/0021-an-unreadable-stored-history-fails-the-run.md).
The `version` field itself is
[ADR 0015](https://github.com/fbuireu/github-star-tracker/blob/main/docs/adr/0015-the-stored-history-declares-its-format-version.md).

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

**Lowering `max-history` throws snapshots away.** When more snapshots are stored than the new limit allows,
the run logs a warning naming how many it is about to drop and telling you to raise `max-history` *before*
this run if you want to keep them. Once that run pushes, they are gone; the data branch is the only copy.

### How Pruning Works

Pruning is a pure domain function (`addSnapshot()` in [`src/domain/snapshot.ts`](https://github.com/fbuireu/github-star-tracker/blob/main/src/domain/snapshot.ts)). It returns a new `History` object with the snapshot appended and old entries trimmed - no mutation, no side effects.

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

A repository whose stargazers could not be read (a failed request, an empty response for a repo that has
stars, or a repo covered by `smart-sampling`) **keeps its previous login list** rather than being written
as empty. Without that, one transient failure would wipe the entry and the next successful run would report
every existing stargazer as new. The trade-off is that such an entry can be stale, and if the repository is
permanently unreadable it will never report a new stargazer again. Each affected repository is named in a
warning in the run log. The full reasoning is
[ADR 0012](https://github.com/fbuireu/github-star-tracker/blob/main/docs/adr/0012-unreadable-stargazer-lists-keep-their-previous-logins.md).

---

## First Run Behavior

On the first **writing** run:

1. The action creates the data branch as an orphan branch
2. An initial empty commit is made
3. All repos are recorded with `delta: 0` (no previous data to compare against)
4. Stargazers are fetched (charts are on by default) and the Reconstructed History is built from their
   `starred_at` dates, so charts are generated on the first run
5. Forecasts are generated on the first run too, provided that reconstruction has at least 3 points

The data branch is a Git worktree checked out beside your main checkout at the dot-prefixed branch name
(`.star-tracker-data/`), so the action never runs `git checkout` on the branch your workflow is using.

---

## Read-Only Runs

With [`read-only: true`](Configuration#read-only) a run touches the data branch **only to read it**. It
still opens the worktree, reads `stars-data.json` and `stargazers.json`, computes, renders and writes every
artefact above into that worktree, sends the email and sets every output. It then logs
`Read-only run: leaving <branch> untouched` and throws the worktree away without committing.

Two things follow, and both surprise people:

- **The branch must already exist.** A read-only run refuses to create one and fails outright, so the "First
  Run Behavior" above does not apply to it. Point `data-branch` at the branch your tracking workflow
  maintains, or drop `read-only` for one run so it can be created.
- **Nothing is remembered.** No snapshot is appended and `starsAtLastNotification` never advances, so a
  `notification-threshold` other than `0` cannot work on a read-only run. The action warns when both are set.

This is what lets a second workflow, typically a weekly digest, share a data branch with the workflow that
maintains it without the two racing to push.

---

## Manual Data Management

### Resetting Data

Delete the data branch to start fresh:

```bash
git push origin --delete star-tracker-data
```

The next writing run will recreate it. A read-only run will not.

Cloning the branch, downloading `stars-data.json` and querying it with `jq` are all in
**[Viewing Reports](Viewing-Reports#accessing-raw-data)**, which is where the raw-data recipes live.

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
