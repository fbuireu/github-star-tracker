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
     - `Metadata`: **Read-only**, mandatory. It is what lists the repositories and reads their star counts, and GitHub selects it for any token that reaches a repository
     - `Contents`: **Read and write**, only if the workflow's checkout step sets `persist-credentials: false`. With `actions/checkout`'s default, git pushes the data branch with the workflow's own `GITHUB_TOKEN` (which is why the workflow keeps `permissions: contents: write`), and this token never writes anything. With `persist-credentials: false` the checkout keeps no credential, so the action pushes with *this* token, which then needs write access to the repository the workflow runs in. A fine-grained token grants a permission on every repository it selects, so leave the default checkout alone if you want the token to stay read-only
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

| Permission | What it allows | When the action needs it |
|---|---|---|
| `Metadata: Read-only` | List the repositories and read their star counts | Always; GitHub selects it for you |
| `Contents: Read-only` | Fetch the data branch | Only when the checkout sets `persist-credentials: false`, on a [`read-only: true`](Configuration#read-only) run, which never pushes |
| `Contents: Read and write` | Fetch and push the data branch | Only when the checkout sets `persist-credentials: false`, on a writing run |

With the default checkout, git fetches and pushes the data branch with the workflow's own `GITHUB_TOKEN`, so the
workflow's `permissions:` block is what has to grant `contents: write`, and the token itself only reads metadata.

> **Minimum scope:** if you only need to track public repositories, `public_repo` (classic) is sufficient.
>
> **A read-only run cannot create the data branch.** With [`read-only: true`](Configuration#read-only) the action never pushes, so the workflow needs only `permissions: contents: read`. But the branch must already exist on the remote: on a fresh setup, do the first run as a writing run, or point `data-branch` at the branch another workflow already maintains.

---

## Security Best Practices

- Set expiration: 90 days is a reasonable default; set a calendar reminder to rotate. An expired token does not degrade the run, it fails it
- Store in GitHub Secrets only: never commit tokens to code
- Rotate regularly: revoke and regenerate periodically
- Monitor usage: check token activity at [GitHub Settings > Tokens](https://github.com/settings/tokens)

---

## Troubleshooting

| Error | Cause | Solution |
|---|---|---|
| `Failed to fetch repositories from GitHub API: HTTP 401 Bad credentials. Verify that your github-token has the correct permissions.` | Token expired or revoked. The run fails outright, it does not fall back to a smaller report | Generate a new token and update the secret |
| `Resource not accessible by integration` | Using `GITHUB_TOKEN` instead of a PAT | Create a PAT with a suitable scope |
| `Not Found` for private repos | Token has `public_repo` but not `repo` scope | Edit the token to add `repo` scope |
| Push rejected with `403` | With the default checkout, the workflow lacks `permissions: contents: write`. With `persist-credentials: false`, the token lacks write access to the workflow's repository | Grant `contents: write` in the workflow, or `Contents: Read and write` on the token, and re-run |
| Charts and stargazer sections empty on a fine-grained token | The stargazer endpoint is admin/collaborator-only | See [Fine-Grained Tokens and Stargazers](#fine-grained-tokens-and-stargazers) above |
| `Bad credentials` after copy/paste | Extra whitespace in the secret value | Re-copy the token carefully and trim whitespace |

---

## Next Steps

- [Getting Started](Getting-Started): continue setup after creating your token
- [Configuration](Configuration): customize tracking options
