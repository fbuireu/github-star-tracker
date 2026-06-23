GitHub Star Tracker requires a Personal Access Token rather than the default `GITHUB_TOKEN`. This page explains why and walks through creating one.

---

## Why a PAT Is Required

The `GITHUB_TOKEN` provided automatically by GitHub Actions is scoped to the **current repository only**. GitHub Star Tracker needs to list **all repositories owned by the authenticated user** via `GET /user/repos`, which requires broader access. This is a GitHub API restriction — the automatic token simply cannot enumerate repos outside the triggering repository.

---

## Option A: Classic Token (Recommended)

Simpler setup, proven reliability, optional expiration.

### Step 1: Generate the Token

1. Go to **[GitHub Settings > Developer settings > Personal access tokens > Tokens (classic)](https://github.com/settings/tokens)**
2. Click **"Generate new token (classic)"**
3. Configure:
   - **Note:** `GitHub Star Tracker`
   - **Expiration:** 90 days recommended (set a calendar reminder)
   - **Scopes:**
     - `repo` — for tracking private + public repositories
     - OR `public_repo` — for public repositories only
4. Click **"Generate token"**
5. **Copy the token immediately** — it starts with `ghp_` and won't be shown again

### Step 2: Add to Repository Secrets

1. Go to your repository's **Settings > Secrets and variables > Actions**
2. Click **"New repository secret"**
3. Create:
   - **Name:** `STAR_TRACKER_TOKEN`
   - **Value:** paste the token
4. Click **"Add secret"**

### Step 3: Use in Workflow

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
```

---

## Option B: Fine-Grained Token

More granular control, required expiration, better for team environments.

### Step 1: Generate the Token

1. Go to **[GitHub Settings > Developer settings > Personal access tokens > Fine-grained tokens](https://github.com/settings/tokens?type=beta)**
2. Click **"Generate new token"**
3. Configure:
   - **Token name:** `GitHub Star Tracker`
   - **Description:** `Star tracking across repositories`
   - **Expiration:** 90 days recommended
   - **Resource owner:** your account
   - **Repository access:** `All repositories`
   - **Permissions > Repository permissions:**
     - `Metadata`: **Read-only** (minimum required)
4. Click **"Generate token"**
5. **Copy the token immediately** — it starts with `github_pat_`

### Step 2: Add to Repository Secrets

Same as Classic Token — see Step 2 above.

---

## Scope Reference

| Scope | Token Type | Access |
|---|---|---|
| `repo` | Classic | All repos (private + public) |
| `public_repo` | Classic | Public repos only |
| `Metadata: Read-only` | Fine-grained | Depends on repository access selection |

> **Minimum scope:** if you only need to track public repositories, `public_repo` (classic) is sufficient.

---

## Security Best Practices

- **Minimum permissions:** use `public_repo` if you only track public repos
- **Set expiration:** 90 days recommended; set a calendar reminder to rotate
- **Store in GitHub Secrets only:** never commit tokens to code
- **Rotate regularly:** revoke and regenerate periodically
- **Monitor usage:** check token activity at [GitHub Settings > Tokens](https://github.com/settings/tokens)

---

## Troubleshooting

| Error | Cause | Solution |
|---|---|---|
| `Bad credentials` | Token expired or revoked | Generate a new token and update the secret |
| `Resource not accessible by integration` | Using `GITHUB_TOKEN` instead of PAT | Create a PAT with proper scope |
| `Not Found` for private repos | Token has `public_repo` but not `repo` scope | Edit token to add `repo` scope |
| `Bad credentials` after copy/paste | Extra whitespace in secret value | Re-copy the token carefully, trim whitespace |

---

## Next Steps

- **[Getting Started](Getting-Started)** — Continue setup after creating your token
- **[Configuration](Configuration)** — Customize tracking options
