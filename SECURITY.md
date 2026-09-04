# Security Policy

## Supported Versions

Only the newest release on the v1 line receives security fixes, and it is reached through the floating
`v1` tag that the release workflow force-updates after every release. There is no backporting: a fix ships
in the next patch or minor release, and pointing your workflow at `@v1` is how you get it.

| Version | Supported |
| ------- | --------- |
| Latest v1 release, via the `v1` tag | Yes |
| Any older v1.x tag you pinned | No, upgrade to the `v1` tag |

There has never been a pre-1.0 release line, so nothing older exists to support.

## What Counts as a Vulnerability

The action runs inside a GitHub Actions runner with a Personal Access Token, reads a repository-controlled
config file, and writes rendered files to a branch. That shapes what is interesting to report.

**In scope:**

- **Token exposure.** Any path that leaks the `github-token` or `smtp-password` into the workflow log, an
  action output, a committed file, or an outbound request other than the GitHub API and your SMTP server.
- **Injection through the config file.** `star-tracker.yml` comes from the repository being tracked. A
  value in it that reaches a shell, a file path outside the workspace, or an unescaped position in
  rendered output is a vulnerability.
- **Injection through GitHub-sourced data.** Repository names, descriptions and stargazer logins are
  attacker-influenceable and are interpolated into markdown, HTML, SVG and CSV. Output that escapes them
  incorrectly, for example a stargazer login that becomes live markup in the emailed digest or the
  committed report, is in scope.
- **Writes outside the data branch.** The action is supposed to touch only the branch named by
  `data-branch`. Anything that makes it write elsewhere is a vulnerability.

**Out of scope:**

- The data branch being readable by anyone who can read the repository. That is by design, and it is what
  makes the badge and charts embeddable. See [Data Storage](#data-storage) below.
- A workflow that supplies a token with more scope than it needs, or hardcodes a secret. That is a
  configuration problem in your repository, and [Security Best Practices](#security-best-practices)
  covers it.
- Rate limiting, quota exhaustion or API cost caused by tracking a very large set of repositories.
- Vulnerabilities in GitHub Actions, GitHub itself, or your SMTP provider. Report those to them.

Two defences are worth knowing about before you write a report, because they already hold:

- Git is invoked through `execFileSync` with an argument array ([`src/infrastructure/git/commands.ts`](./src/infrastructure/git/commands.ts)), so
  no config value reaches a shell. There is no `git` string to break out of.
- The git credential header is a base64 blob registered with `core.setSecret` the moment it is built, so
  it is masked in the log even when git echoes the command.

If you have found a way around either, that is exactly the kind of report this policy is for.

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability, please report it privately:

### Preferred Method: GitHub Private Vulnerability Reporting

1. Go to the [Security tab](https://github.com/fbuireu/github-star-tracker/security)
2. Click "Report a vulnerability"
3. Fill in the details about the vulnerability

### If private reporting is unavailable

Private reporting is open to any GitHub account and is the channel this project uses. If it is not available
to you, open an issue asking me to get in touch and **say nothing about the finding in it**: a public issue is
not the place for the details. Whichever way it reaches me, include:

- Type of issue (for example token exposure or code injection)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code, if possible
- Impact of the issue, including how an attacker might exploit it

### What to Expect

- **Acknowledgment**: we will acknowledge receipt within 48 hours
- **Updates**: we will provide updates on the fix progress
- **Timeline**: we aim to fix critical issues within 7 days
- **Credit**: we will credit you in the security advisory, unless you prefer to remain anonymous
- **Disclosure**: we follow a 90-day responsible disclosure policy

## Security Best Practices

When using this GitHub Action:

### 1. Token Permissions

The action needs a **Personal Access Token**, not the injected `GITHUB_TOKEN`. That one is scoped to the
triggering repository and cannot list your repositories at all
([ADR 0002](docs/adr/0002-require-a-personal-access-token.md)). Give it the least it can work with:

- **Classic:** `public_repo` if you only track public repositories, `repo` if you track private ones
- **Fine-grained:** `Contents: Read and write`, because the action pushes to the data branch with this
  token. `Contents: Read-only` is enough for a [`read-only`](../../wiki/Configuration) run

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
    github-token: ${{ secrets.STAR_TRACKER_TOKEN }} # Correct: your PAT, from a secret
    # github-token: ${{ secrets.GITHUB_TOKEN }}     # Wrong: cannot enumerate your repositories
    # github-token: ghp_xxxxx                       # Wrong: never hardcode a token
```

`smtp-password` is passed to `core.setSecret` the moment it is read, so it stays masked in the Action log
even if a workflow supplies it literally. Supply it from a secret anyway.

### 3. Configuration Files

`star-tracker.yml` is committed to your repository and carries **no credentials**: the SMTP inputs are read
from the workflow only and have no config-file counterpart. Keep it to tracking options:

```yaml
# star-tracker.yml, safe to commit
visibility: public
min_stars: 5
```

```yaml
# the workflow, where the secrets live
with:
  smtp-password: ${{ secrets.SMTP_PASSWORD }}
```

### 4. Regular Updates

Keep the action updated to the latest version:

```yaml
- uses: fbuireu/github-star-tracker@v1 # Correct: picks up minor and patch releases
# - uses: fbuireu/github-star-tracker@v1.0.0 # Pinned, so it will not receive security fixes
```

## Known Security Considerations

### GitHub Token Access

This action requires a Personal Access Token with repository access. The token is used to:

- List the repositories the token's owner can see
- Read star counts, and stargazer lists when `track-stargazers` or charts are on
- Push the report, data, badge and charts to the data branch

Email is sent over SMTP with the credentials you supply separately; the GitHub token has no part in it.

### Data Storage

A git branch is the only storage backend the action has. That is how a stateless Action remembers anything
([ADR 0001](docs/adr/0001-star-data-lives-on-a-dedicated-data-branch.md)), and there is no alternative
backend to point it at. A [`read-only`](../../wiki/Configuration) run still reads that branch; it simply
never writes to it.

- Historical star data, the report, the badge and the charts live on that branch
- Anyone who can read the repository can read them, and the raw URLs are what make the badge and charts
  embeddable
- On a private repository they inherit its access; on a public one they are public. If your star history
  should not be public, point `data-branch` at a branch in a private repository

## Security Updates

Security fixes ship as ordinary releases, tagged `[Security]` in the release notes, and reach you
automatically if your workflow references the `v1` tag.
