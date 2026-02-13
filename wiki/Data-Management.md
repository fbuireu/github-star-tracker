# Data Management

Complete guide to how GitHub Star Tracker stores, manages, and processes your star data.

## 📊 Data Overview

GitHub Star Tracker uses a **dedicated Git branch** to store historical data persistently across workflow runs.

### Data Files

| File              | Format   | Purpose                           | Size            |
| ----------------- | -------- | --------------------------------- | --------------- |
| `README.md`       | Markdown | Human-readable report with charts | ~5-20 KB        |
| `stars-data.json` | JSON     | Historical snapshots              | Grows over time |
| `stars-badge.svg` | SVG      | Star count badge                  | ~1 KB           |

---

## 🌳 Data Branch Architecture

### Branch Name

**Default:** `star-tracker-data`

**Characteristics:**

- **Orphan branch** — No shared history with `main`
- **Independent timeline** — Separate commit history
- **Persistent** — Survives across workflow runs
- **Not merged** — Never merges into main branch

### Why Orphan Branch?

| Benefit            | Description                                     |
| ------------------ | ----------------------------------------------- |
| **Clean history**  | Data commits don't clutter main branch          |
| **Size isolation** | Large data files don't bloat main repo          |
| **Easy deletion**  | Can delete entire branch without affecting code |
| **Performance**    | Faster checkouts (no full history needed)       |

### Branch Creation

The action automatically creates the branch on first run:

```bash
# What happens internally
git checkout --orphan star-tracker-data
git rm -rf .
# Create initial files
git add .
git commit -m "Initialize star tracking data"
git push origin star-tracker-data
```

---

## 📁 File Structures

### 1. stars-data.json

**Purpose:** Complete historical record of all snapshots

**Structure:**

```json
[
  {
    "timestamp": "2026-02-13T00:00:00.000Z",
    "repositories": [
      {
        "name": "repo-name",
        "fullName": "username/repo-name",
        "stars": 123,
        "url": "https://github.com/username/repo-name"
      },
      {
        "name": "another-repo",
        "fullName": "username/another-repo",
        "stars": 45,
        "url": "https://github.com/username/another-repo"
      }
    ],
    "totalStars": 168
  },
  {
    "timestamp": "2026-02-12T00:00:00.000Z",
    "repositories": [
      {
        "name": "repo-name",
        "fullName": "username/repo-name",
        "stars": 120,
        "url": "https://github.com/username/repo-name"
      },
      {
        "name": "another-repo",
        "fullName": "username/another-repo",
        "stars": 44,
        "url": "https://github.com/username/another-repo"
      }
    ],
    "totalStars": 164
  }
]
```

**Key Points:**

- **Array of snapshots** — Most recent first
- **Chronological order** — Newest at index 0
- **Immutable history** — Old snapshots never modified
- **Append-only** — New data added to front

### 2. README.md

**Purpose:** Human-readable report with visualizations

**Structure:**

```markdown
# GitHub Stars Report

## Summary

- **Total Stars:** 168
- **Change:** +4 ⬆️
- **Last Updated:** February 13, 2026

## ⭐ Star Trend

![Star Trend](https://quickchart.io/chart?c=...)

## Repositories

| Repository            | Stars  |
| --------------------- | ------ |
| username/repo-name    | 123 ⭐ |
| username/another-repo | 45 ⭐  |

## 📊 Top 5 Repositories - Star Comparison

![Top Repositories](https://quickchart.io/chart?c=...)
```

**Generation:**

- Recreated on every run
- Reflects current state + latest changes
- Includes charts if `include-charts: true`

### 3. stars-badge.svg

**Purpose:** Embeddable badge showing total star count

**Structure:**

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="20">
  <rect width="50" height="20" fill="#555"/>
  <text x="25" y="14" fill="#fff">stars</text>
  <rect x="50" width="50" height="20" fill="#007ec6"/>
  <text x="75" y="14" fill="#fff">168</text>
</svg>
```

**Features:**

- Standard shields.io-style badge
- Updates automatically
- Can be embedded in any README

---

## 🔄 Data Flow

### Complete Workflow

```
┌─────────────────┐
│  GitHub Actions │
│   (Scheduled)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Fetch Current  │
│ Repo Star Counts│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Checkout      │
│  Data Branch    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Load Previous   │
│ stars-data.json │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Compare Current │
│  vs. Previous   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Create New     │
│    Snapshot     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Prepend to JSON │
│   (Most Recent  │
│    First)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Generate      │
│  Reports & Badge│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Commit & Push   │
│  to Data Branch │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Set Action    │
│    Outputs      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Send Email     │
│   (Optional)    │
└─────────────────┘
```

### Step-by-Step Details

#### 1. Fetch Current Stars

```typescript
const repos = await octokit.repos.listForAuthenticatedUser({
  visibility: config.visibility,
  per_page: 100,
});

const current = repos.data.map((repo) => ({
  name: repo.name,
  fullName: repo.full_name,
  stars: repo.stargazers_count,
  url: repo.html_url,
}));
```

#### 2. Load Historical Data

```typescript
// Clone data branch
await git.clone(repo, dataPath, { branch: 'star-tracker-data' });

// Read previous data
const dataFile = path.join(dataPath, 'stars-data.json');
const history = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
```

#### 3. Compare and Create Snapshot

```typescript
const previous = history[0]?.repositories || [];

const newStars = calculateDiff(current, previous);
const lostStars = calculateDiff(previous, current);

const snapshot = {
  timestamp: new Date().toISOString(),
  repositories: current,
  totalStars: current.reduce((sum, r) => sum + r.stars, 0),
};
```

#### 4. Update Data File

```typescript
// Prepend new snapshot
history.unshift(snapshot);

// Write back to file
fs.writeFileSync(dataFile, JSON.stringify(history, null, 2));
```

#### 5. Commit Changes

```typescript
await git.add('.');
await git.commit('Update star tracking data');
await git.push('origin', 'star-tracker-data');
```

---

## 📈 Data Growth

### Size Estimations

**Per snapshot:**

```
Base: ~100 bytes
+ ~80 bytes per repository
```

**Example calculations:**

| Repositories | Per Snapshot | Daily (1yr) | Weekly (1yr) |
| ------------ | ------------ | ----------- | ------------ |
| 10           | 900 B        | 329 KB      | 47 KB        |
| 50           | 4.1 KB       | 1.5 MB      | 214 KB       |
| 100          | 8.1 KB       | 3.0 MB      | 422 KB       |
| 500          | 40.1 KB      | 14.6 MB     | 2.1 MB       |

### Growth Mitigation

Currently **no automatic cleanup** — data grows indefinitely.

**Future enhancements** may include:

- Snapshot retention policies (e.g., keep last 365 days)
- Automatic archiving of old data
- Compression for historical data

**Manual cleanup:**

```bash
# Clone data branch
git clone -b star-tracker-data YOUR_REPO data

cd data

# Edit stars-data.json to remove old snapshots
# (Keep first N entries)

git add stars-data.json
git commit -m "Archive old data"
git push
```

---

## 🔍 Data Access Methods

### 1. GitHub Web UI

**Navigate to:**

```
https://github.com/USERNAME/REPO/tree/star-tracker-data
```

**View:**

- README.md (rendered)
- stars-data.json (raw or formatted)
- stars-badge.svg (rendered)

### 2. Git Clone

```bash
# Clone only data branch
git clone -b star-tracker-data --single-branch \
  https://github.com/USERNAME/REPO.git star-data

cd star-data
ls -l
```

### 3. Raw File Access

```bash
# Download specific file
curl -O https://raw.githubusercontent.com/USERNAME/REPO/star-tracker-data/stars-data.json

# View in terminal
curl https://raw.githubusercontent.com/USERNAME/REPO/star-tracker-data/README.md
```

### 4. GitHub API

```bash
# Get file contents via API
curl -H "Authorization: token YOUR_TOKEN" \
  https://api.github.com/repos/USERNAME/REPO/contents/stars-data.json?ref=star-tracker-data
```

### 5. Action Outputs

```yaml
- name: Track stars
  id: tracker
  uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}

- name: Access data
  run: |
    echo "${{ steps.tracker.outputs.report }}" > report.md
    echo "${{ steps.tracker.outputs.total-stars }}"
```

---

## 🔒 Data Privacy

### What's Stored

**Public repositories:**

- ✅ Repository name
- ✅ Full name (username/repo)
- ✅ Star count
- ✅ Repository URL
- ✅ Timestamp

**NOT stored:**

- ❌ Repository contents
- ❌ Commit history
- ❌ Issues/PRs
- ❌ Contributors
- ❌ Personal tokens

### Data Visibility

**Public repositories:**

- Data branch is **public**
- Anyone can view star reports
- Reports are indexed by search engines

**Private repositories:**

- Data branch is **private**
- Only users with repo access can view
- Not indexed by search engines

### GDPR Compliance

**Personal data:** None collected beyond repository metadata

**Right to deletion:**

```bash
# Delete entire data branch
git push origin --delete star-tracker-data
```

---

## 🛠️ Data Operations

### Manual Backup

```bash
# Clone data branch
git clone -b star-tracker-data --single-branch YOUR_REPO backup

# Archive
tar -czf star-data-$(date +%Y%m%d).tar.gz backup/

# Store securely
```

### Restore from Backup

```bash
# Extract backup
tar -xzf star-data-20260213.tar.gz

# Force push to restore
cd backup
git push origin star-tracker-data --force
```

### Migrate to New Repository

```bash
# Clone data from old repo
git clone -b star-tracker-data --single-branch OLD_REPO data

cd data

# Update remote
git remote set-url origin NEW_REPO

# Push to new repo
git push origin star-tracker-data
```

### Reset Data

**Warning:** This deletes all historical data.

```bash
# Delete remote branch
git push origin --delete star-tracker-data

# Next workflow run will recreate with fresh data
```

---

## 📊 Data Analysis

### Query with jq

```bash
# Get total stars from latest snapshot
curl -s STARS_DATA_URL | jq '.[0].totalStars'

# List all repositories
curl -s STARS_DATA_URL | jq '.[0].repositories[].fullName'

# Calculate star growth (last 7 days)
curl -s STARS_DATA_URL | jq '.[0].totalStars - .[6].totalStars'

# Find fastest growing repo
curl -s STARS_DATA_URL | jq '
  .[0].repositories as $latest |
  .[1].repositories as $previous |
  $latest | map(. as $curr |
    ($previous | map(select(.name == $curr.name))[0]) as $prev |
    {name: .name, growth: (.stars - ($prev.stars // 0))}
  ) | sort_by(.growth) | reverse | .[0]
'
```

### Python Analysis

```python
import json
import requests
from datetime import datetime

# Fetch data
url = 'https://raw.githubusercontent.com/USER/REPO/star-tracker-data/stars-data.json'
data = json.loads(requests.get(url).text)

# Latest snapshot
latest = data[0]
print(f"Total stars: {latest['totalStars']}")

# Calculate daily average growth (last 30 days)
if len(data) >= 30:
    growth = latest['totalStars'] - data[29]['totalStars']
    avg = growth / 30
    print(f"Average daily growth: {avg:.2f} stars")

# Find top 5 repositories
repos = sorted(latest['repositories'],
               key=lambda x: x['stars'],
               reverse=True)[:5]
for i, repo in enumerate(repos, 1):
    print(f"{i}. {repo['fullName']}: {repo['stars']} stars")
```

---

## 🔧 Advanced Configuration

### Custom Data Branch (Future)

Currently not supported. All data stored in `star-tracker-data`.

**Potential future syntax:**

```yaml
with:
  data-branch: 'custom-branch-name'
```

### Data Retention Policy (Future)

Currently not supported. Data grows indefinitely.

**Potential future syntax:**

```yaml
with:
  retention-days: 365 # Keep last 365 days only
```

### Data Compression (Future)

Currently not supported. Data stored as plain JSON.

**Potential future enhancements:**

- gzip compression for old snapshots
- Separate file per year
- Database storage option

---

## 🐛 Troubleshooting

### Data Branch Not Created

**Symptoms:** Branch doesn't exist after first run

**Causes:**

- Workflow failed before push
- Insufficient permissions
- Git configuration error

**Solutions:**

1. Check workflow logs for errors
2. Verify PAT has `repo` scope
3. Re-run workflow manually

### Data File Corrupted

**Symptoms:** JSON parse errors in logs

**Causes:**

- Manual editing mistakes
- Concurrent workflow runs
- Git merge conflicts

**Solutions:**

1. Restore from backup
2. Fix JSON syntax manually
3. Reset branch and restart

### Missing Historical Data

**Symptoms:** Only one snapshot in history

**Causes:**

- Data branch was reset
- File was recreated from scratch
- New repository

**Solutions:**

- Wait for more workflow runs to accumulate data
- Restore from backup if available
- Accept fresh start if intentional

---

## 📚 Related Documentation

- **[Getting Started](Getting-Started)** — Initial setup
- **[Viewing Reports](Viewing-Reports)** — Accessing data
- **[Configuration](Configuration)** — All options
- **[Troubleshooting](Troubleshooting)** — Common issues

---

## 🔗 External Resources

- **Git Orphan Branches:** [git-scm.com/docs/git-checkout](https://git-scm.com/docs/git-checkout)
- **JSON Specification:** [json.org](https://www.json.org/)
- **SVG Format:** [w3.org/Graphics/SVG](https://www.w3.org/Graphics/SVG/)
- **jq Manual:** [stedolan.github.io/jq](https://stedolan.github.io/jq/)
