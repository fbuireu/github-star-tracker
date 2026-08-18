# Security Policy

## Supported Versions

We release patches for security vulnerabilities. Currently supported versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability, please report it privately:

### Preferred Method: GitHub Private Vulnerability Reporting

1. Go to the [Security tab](https://github.com/fbuireu/github-star-tracker/security)
2. Click "Report a vulnerability"
3. Fill in the details about the vulnerability

### Alternative: Email

Send an email to **fbuireu@gmail.com** with:

- Type of issue (e.g., token exposure, code injection, etc.)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit it

### What to Expect

- **Acknowledgment**: We'll acknowledge receipt within 48 hours
- **Updates**: We'll provide updates on the fix progress
- **Timeline**: We aim to fix critical issues within 7 days
- **Credit**: We'll credit you in the security advisory (unless you prefer to remain anonymous)
- **Disclosure**: We follow a 90-day responsible disclosure policy

## Security Best Practices

When using this GitHub Action:

### 1. Token Permissions

The action needs a **Personal Access Token**, not the injected `GITHUB_TOKEN` — that one is scoped to the
triggering repository and cannot list your repositories at all
([ADR 0002](docs/adr/0002-require-a-personal-access-token.md)). Give it the least it can work with:

- **Classic:** `public_repo` if you only track public repositories, `repo` if you track private ones
- **Fine-grained:** `Contents: Read and write` — the action pushes to the data branch with this token.
  `Contents: Read-only` is enough for a [`read-only`](docs/wiki/Configuration.md) run

The workflow's own `permissions:` block only governs `GITHUB_TOKEN`, which `actions/checkout` uses:

```yaml
permissions:
  contents: write
```

### 2. Secrets Management

Never expose tokens in logs or outputs:

```yaml
- uses: fbuireu/github-star-tracker@v1
  with:
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }} # ✅ Your PAT, from a secret
    # github-token: ${{ secrets.GITHUB_TOKEN }}     # ❌ Cannot enumerate your repositories
    # github-token: ghp_xxxxx                       # ❌ Never hardcode
```

`smtp-password` is passed to `core.setSecret` the moment it is read, so it stays masked in the Action log
even if a workflow supplies it literally — but supply it from a secret anyway.

### 3. Configuration Files

`star-tracker.yml` is committed to your repository and carries **no credentials**: the SMTP inputs are read
from the workflow only and have no config-file counterpart. Keep it to tracking options:

```yaml
# star-tracker.yml — safe to commit
visibility: public
min_stars: 5
```

```yaml
# the workflow — where the secrets live
with:
  smtp-password: ${{ secrets.SMTP_PASSWORD }}
```

### 4. Regular Updates

Keep the action updated to the latest version:

```yaml
- uses: fbuireu/github-star-tracker@v1 # ✅ Auto-updates minor/patch
# - uses: fbuireu/github-star-tracker@v1.0.0  # ⚠️ Pinned, won't get security fixes
```

## Known Security Considerations

### GitHub Token Access

This action requires a Personal Access Token with repository access. The token is used to:

- List the repositories the token's owner can see
- Read star counts, and stargazer lists when `track-stargazers` or charts are on
- Push the report, data, badge and charts to the data branch

Email is sent over SMTP with the credentials you supply separately; the GitHub token has no part in it.

### Data Storage

The action always keeps its data on a branch — that is how a stateless Action remembers anything
([ADR 0001](docs/adr/0001-star-data-lives-on-a-dedicated-data-branch.md)), and there is no mode that skips
it:

- Historical star data, the report, the badge and the charts live on that branch
- Anyone who can read the repository can read them, and the raw URLs are what make the badge and charts
  embeddable
- On a private repository they inherit its access; on a public one they are public. If your star history
  should not be public, point `data-branch` at a branch in a private repository

## Security Updates

Security updates will be released as:

- Patch versions (e.g., 1.0.1) for backward-compatible fixes
- Minor versions (e.g., 1.1.0) if changes affect functionality
- Documented in release notes with [Security] tag

Subscribe to releases to stay informed:

- Watch > Custom > Releases
- Enable security alerts in repository settings
