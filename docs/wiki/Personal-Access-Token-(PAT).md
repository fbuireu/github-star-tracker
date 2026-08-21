GitHub Star Tracker requires a Personal Access Token rather than the default `GITHUB_TOKEN`. This page explains why and walks through creating one. It is the canonical walkthrough; the other pages link here rather than repeating it.

---

## Why a PAT Is Required

The `GITHUB_TOKEN` provided automatically by GitHub Actions is scoped to the **current repository only**. GitHub Star Tracker needs to list **all repositories owned by the authenticated user** via `GET /user/repos`, which requires broader access. That is a GitHub API restriction: the automatic token simply cannot enumerate repos outside the triggering repository. The trade-off behind requiring one anyway, and how the *kind* of token silently decides how much of the product works, is recorded in [ADR 0002](https://github.com/fbuireu/github-star-tracker/blob/main/docs/adr/0002-require-a-personal-access-token.md).

---

## Option A: Classic Token (Recommended)

Simpler setup, proven reliability, optional expiration.

### Step 1: Generate the Token

1. Go to **[GitHub Settings > Developer settings > Personal access tokens > Tokens (classic)](https://github.com/settings/tokens)**
2. Click **"Generate new token (classic)"**
3. Configure:
   - **Note:** `GitHub Star Tracker`
   - **Expiration:** 90 days
   - **Scopes:**
     - `repo` for tracking private and public repositories
     - or `public_repo` for public repositories only
4. Click **"Generate token"**
5. **Copy the token immediately.** It starts with `ghp_` and will not be shown again

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

### Step 1: Generate the Fine-Grained Token

1. Go to **[GitHub Settings > Developer settings > Personal access tokens > Fine-grained tokens](https://github.com/settings/personal-access-tokens)**
2. Click **"Generate new token"**
3. Configure:
   - **Token name:** `GitHub Star Tracker`
   - **Description:** `Star tracking across repositories`
   - **Expiration:** 90 days
   - **Resource owner:** your account
   - **Repository access:** `All repositories`
   - **Permissions > Repository permissions:**
     - `Contents`: **Read and write**, required. The action commits the report, data, badge and charts to the data branch, and it pushes with *this* token, not with the workflow's `GITHUB_TOKEN`. A token without it fails at the push
     - `Metadata`: **Read-only**, mandatory. GitHub selects it automatically alongside `Contents`
4. Click **"Generate token"**
5. **Copy the token immediately.** It starts with `github_pat_`

### Step 2: Store It the Same Way

The secret and the workflow step are identical to the classic path: see [Add to Repository Secrets](#step-2-add-to-repository-secrets) and [Use in Workflow](#step-3-use-in-workflow) above.

---

## Fine-Grained Tokens and Stargazers

A fine-grained token can track star *counts* perfectly well and still produce empty charts and stargazer sections. The stargazer endpoint answers only to repository admins and collaborators, and a fine-grained token without an explicit grant on the owning organization is neither.

Star counts, reports and badges are unaffected, so the run succeeds and the gap is easy to miss. Use a classic token, or grant the organization explicitly. The reasoning is in [ADR 0002](https://github.com/fbuireu/github-star-tracker/blob/main/docs/adr/0002-require-a-personal-access-token.md).

---

## Scope Reference

**Classic token scopes:** what the token can reach.

| Scope | Repositories it reaches |
|---|---|
| `repo` | All repos, private and public |
| `public_repo` | Public repos only |

**Fine-grained token permissions:** what the action is allowed to do.

| Permission | What it allows |
|---|---|
| `Contents: Read and write` | Read repositories and push to the data branch. This is the default requirement |
| `Contents: Read-only` | Read repositories. Enough only for a [`read-only: true`](Configuration#read-only) run, and only when the data branch already exists |
| `Metadata: Read-only` | Mandatory companion to any repository permission; GitHub selects it for you |

> **Minimum scope:** if you only need to track public repositories, `public_repo` (classic) is sufficient.
>
> **A read-only run needs less, with a catch.** With [`read-only: true`](Configuration#read-only) the action never pushes, so `Contents: Read-only` is enough for a fine-grained token. But a read-only run cannot *create* the data branch either, so the branch must already exist on the remote. On a fresh setup, do the first run with write access, or point `data-branch` at the branch another workflow already maintains.

---

## Security Best Practices

- **Set expiration:** 90 days is a reasonable default; set a calendar reminder to rotate. An expired token does not degrade the run, it fails it
- **Store in GitHub Secrets only:** never commit tokens to code
- **Rotate regularly:** revoke and regenerate periodically
- **Monitor usage:** check token activity at [GitHub Settings > Tokens](https://github.com/settings/tokens)

---

## Troubleshooting

| Error | Cause | Solution |
|---|---|---|
| `Failed to fetch repositories from GitHub API: HTTP 401 Bad credentials. Verify that your github-token has the correct permissions.` | Token expired or revoked. The run fails outright, it does not fall back to a smaller report | Generate a new token and update the secret |
| `Resource not accessible by integration` | Using `GITHUB_TOKEN` instead of a PAT | Create a PAT with a suitable scope |
| `Not Found` for private repos | Token has `public_repo` but not `repo` scope | Edit the token to add `repo` scope |
| Push rejected with `403` on a fine-grained token | Token lacks `Contents: Read and write` | Edit the token's repository permissions and re-run |
| Charts and stargazer sections empty on a fine-grained token | The stargazer endpoint is admin/collaborator-only | See [Fine-Grained Tokens and Stargazers](#fine-grained-tokens-and-stargazers) above |
| `Bad credentials` after copy/paste | Extra whitespace in the secret value | Re-copy the token carefully and trim whitespace |

---

## Next Steps

- **[Getting Started](Getting-Started)**: continue setup after creating your token
- **[Configuration](Configuration)**: customize tracking options
