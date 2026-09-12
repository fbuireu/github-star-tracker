# Security Policy

## Supported Versions

Only the newest release on the v1 line receives security fixes, and it is
reached through the floating `v1` tag that the release workflow force-updates
after every release. There is no backporting: a fix ships in the next patch or
minor release, and pointing your workflow at `@v1` is how you get it.

| Component | Supported |
| --- | --- |
| The latest v1 release, via the `v1` tag | Yes |
| Any older v1.x tag you pinned | No, upgrade to the `v1` tag |

There has never been a pre-1.0 release line, so nothing older exists to support.

## Scope

The action runs inside a GitHub Actions runner with a Personal Access Token,
reads a repository-controlled config file, and writes rendered files to a
branch. That shapes what is interesting to report.

### In scope

- **Token exposure.** Any path that leaks the `github-token` or
  `smtp-password` into the workflow log, an action output, a committed file, or
  an outbound request other than the GitHub API and your SMTP server.
- **Injection through the config file.** `star-tracker.yml` comes from the
  repository being tracked. A value in it that reaches a shell, a file path
  outside the workspace, or an unescaped position in rendered output is a
  vulnerability.
- **Injection through GitHub-sourced data.** Repository names, descriptions
  and stargazer logins are attacker-influenceable and are interpolated into
  markdown, HTML, SVG and CSV. Output that escapes them incorrectly, for
  example a stargazer login that becomes live markup in the emailed digest or
  the committed report, is in scope.
- **Writes outside the data branch.** The action is supposed to touch only the
  branch named by `data-branch`. Anything that makes it write elsewhere is a
  vulnerability.

### Out of scope

- Vulnerabilities in the platforms and services the action is built on: GitHub
  Actions, GitHub itself, or your SMTP provider. Report those to them.
- Rate limiting, quota exhaustion or API cost caused by tracking a very large
  set of repositories.
- A workflow that supplies a token with more scope than it needs, or hardcodes
  a secret. That is a configuration problem in that repository; the wiki's
  [Personal Access Token](https://github.com/fbuireu/github-star-tracker/wiki/Personal-Access-Token-(PAT))
  page names the least scope that works.

### Documented trade-offs, not vulnerabilities

Some behaviour that looks reportable is a documented, deliberate decision.
Please check these before reporting:

- **The data branch is readable by anyone who can read the repository**, and
  on a public repository that is public. A git branch is the only storage
  backend the action has, which is how a stateless Action remembers anything
  ([ADR 0001](../docs/adr/0001-star-data-lives-on-a-dedicated-data-branch.md)),
  and that visibility is what makes the badge and charts embeddable. The
  wiki's
  [Known Limitations](https://github.com/fbuireu/github-star-tracker/wiki/Known-Limitations)
  page says what is and is not exposed; if your star history should not be
  public, point `data-branch` at a branch in a private repository.
- **The action needs a Personal Access Token, not the injected
  `GITHUB_TOKEN`.** That one is scoped to the triggering repository and cannot
  list your repositories at all
  ([ADR 0002](../docs/adr/0002-require-a-personal-access-token.md)). A
  [`read-only`](https://github.com/fbuireu/github-star-tracker/wiki/Configuration)
  run needs only read access to contents.
- **Two defences already hold, and a way around either is exactly the kind of
  report this policy is for.** Git is invoked through `execFileSync` with an
  argument array
  ([`src/infrastructure/git/commands.ts`](../src/infrastructure/git/commands.ts)),
  so no config value reaches a shell; and the git credential header and
  `smtp-password` are registered with `core.setSecret` the moment they exist,
  so they are masked in the log even when git echoes the command or a workflow
  supplies the password literally.

A report that one of these exposes something *beyond* its documented scope is
very much welcome.

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
pull requests or discussions.** Report them privately instead.

### Preferred: GitHub private vulnerability reporting

1. Open [Report a vulnerability](https://github.com/fbuireu/github-star-tracker/security/advisories/new)
2. Fill in the form with the details below

Private reporting is open to any GitHub account and is the channel this project
uses.

### If private reporting is unavailable

Open an issue asking me to get in touch and **say nothing about the finding in
it**: a public issue is not the place for the details.

Whichever way it reaches me, include:

- The type of issue (token exposure, code injection…)
- The affected file or component, and the location of the relevant source
  code if you found it (tag, branch, commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code, if possible
- The impact of the issue, including how an attacker might exploit it

### What to expect

- **Acknowledgment**: I will acknowledge receipt within 48 hours
- **Updates**: I will keep you informed of the fix's progress
- **Timeline**: I aim to fix critical issues within 7 days
- **Credit**: I will credit you in the security advisory, unless you prefer to
  remain anonymous
- **Disclosure**: this project follows a 90-day responsible disclosure policy

Reports made in good faith will not result in legal action. Thank you for
helping keep the action and its users safe.

## Security Updates

Security fixes ship as ordinary releases, tagged `[Security]` in the release
notes, and reach you automatically if your workflow references the `v1` tag.
