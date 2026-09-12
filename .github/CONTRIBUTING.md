# Contributing to GitHub Star Tracker

Thanks for considering it. This action is a TypeScript codebase bundled into a committed
[`dist/index.js`](../dist/index.js), and that one fact shapes most of what is unusual about contributing
here: the bundle is expected to be rebuilt in the same commit as the source, which no check enforces, and the
documentation set is verified by a test, which does. Read this before your first pull request; it will save
you a rejected commit.

If you want the shape of the codebase, that is [CLAUDE.md](../CLAUDE.md) and the nested guides it links, and
[ARCHITECTURE.md](../ARCHITECTURE.md) for the big picture. If you want the vocabulary, that is
[CONTEXT.md](../CONTEXT.md). If you want the *why*, that is [docs/adr/](../docs/adr/).

## Code of Conduct

By participating you are expected to uphold the [Code of Conduct](./CODE_OF_CONDUCT.md). In short:

- **Be respectful**: different viewpoints and experiences are valuable
- **Be constructive**: focus on what is best for the project
- **Be collaborative**: work together towards common goals
- **Be patient**: we all have different levels of experience

## How can I contribute?

### Reporting bugs

Check the existing issues first, then use the [bug report template](ISSUE_TEMPLATE/bug_report.yml). Include
what you did, what you expected, and what actually happened, with the action version, the workflow log and
the `star-tracker.yml` you ran it with, minus anything secret.

Security issues go through the [Security Policy](./SECURITY.md), never a public issue.

### Suggesting features

Use the [feature request template](ISSUE_TEMPLATE/feature_request.yml). Describe the problem before the
solution, and check [Discussions](https://github.com/fbuireu/github-star-tracker/discussions) first; some
ideas are already being talked about.

### Improving documentation

Use the [documentation template](ISSUE_TEMPLATE/documentation.yml), or just open a pull request. The
user-facing documentation is the [wiki](../docs/wiki/), edited **in this repository** and published by
[`sync-wiki.yml`](./workflows/sync-wiki.yml) on every push touching it, so an edit made in the wiki UI is
overwritten on the next sync. The agent-facing guides (`CLAUDE.md` and friends) are held to the code by a
test, so read *The docs are part of the change* below before editing one.

## Getting started

Both runtimes are pinned exactly and must match: Node in [`.nvmrc`](../.nvmrc), mirrored in `engines.node`,
and pnpm in `packageManager`. Read the pin from the file; it is not written down anywhere else on purpose.

Note that `engines.node` is the *development* pin. The shipped runtime is Node 24, set by `runs.using` in
[`action.yml`](../action.yml) and by the esbuild `target`, so a `node:*` API newer than Node 24 will
type-check and bundle here and then fail on a runner.

```bash
git clone https://github.com/YOUR_USERNAME/github-star-tracker.git
cd github-star-tracker

# Always pnpm, never npm or yarn. This also installs the git hooks
nvm use
pnpm install
```

## Checks

Everything CI runs, you can run locally:

```bash
pnpm lint:all           # biome lint (append :fix to autofix)
pnpm format:all         # biome check --write
pnpm typecheck          # tsc --noEmit
pnpm test:ut            # unit tests (vitest), the docs contract included
pnpm test:docs          # the docs contract alone
pnpm build              # bundle src/index.ts into dist/index.js
pnpm verify             # format check, typecheck, build and coverage: what CI runs
```

Run one layer with `pnpm vitest run src/domain`, one file with `pnpm vitest run src/domain/forecast.test.ts`.

Husky runs lint-staged on `pre-commit`, commitlint on `commit-msg` and `pnpm verify:changed` on `pre-push`.
The hook runs the changed-only variant rather than `verify` because the coverage floor and a subset run
cannot both hold; CI runs the full `pnpm verify` on the pushed sha, so a push whose coverage dropped still
fails its check. [CLAUDE.md](../CLAUDE.md) explains the trade. Because `pre-push` rebuilds the bundle, a
push can leave `dist/` dirty; commit that result rather than discarding it.

### The bundle

`action.yml` runs `dist/index.js` directly, with no install step, so the bundle is committed
([ADR 0003](../docs/adr/0003-commit-the-bundled-dist-directory.md)). Run `pnpm build` and commit the
regenerated `dist/index.js` and `dist/index.js.map` alongside your source changes, whenever you touch any
bundled file under `src/` (that is, anything except `*.test.ts` and the fixtures in
[`src/shared/tests/`](../src/shared/tests), neither of which the bundle reaches).

Nothing fails your pull request if you forget, and a release will not ship the stale bundle either: the
`release` job in [`ci.yml`](./workflows/ci.yml) rebuilds it before publishing. What you are keeping honest is
`main` itself: a commit type that does not cut a release (`refactor`, `chore`, `test`, `docs`, `ci`) leaves
`main`'s `dist/` behind its sources until the next `feat` or `fix`, which anyone referencing `@main` would
run.

### Testing the action locally

Create a throwaway workflow that uses the checked-out action:

```yaml
# .github/workflows/test-local.yml
name: Test Local Changes
on: workflow_dispatch

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: ./  # Uses local action code
        with:
          github-token: ${{ secrets.STAR_TRACKER_TOKEN }}
```

The action runs the committed `dist/index.js`, not your sources, so run `pnpm build` before you dispatch
the workflow. For logging use `@actions/core` rather than `console`, which Biome rejects: its helpers annotate
the workflow log, and `core.debug` output only appears when the `ACTIONS_STEP_DEBUG` secret is set.

## Conventions that will bite you if you skip them

- **Use the glossary's words.** [CONTEXT.md](../CONTEXT.md) names one canonical term per concept: snapshot,
  baseline, data branch, sampled repo. A variable named after a retired term is a defect, not a style
  preference.
- **No explanatory comments in `.ts` files**, without exception; the tree contains none. The `CLAUDE.md`
  guides carry the explanation instead.
- **One argument is positional and two or more are a single object typed `<FunctionName>Params`**:
  `makeRepoInfo({ name, stars }: MakeRepoInfoParams)`. The exception is a function a runtime calls back,
  such as the `sort` comparator `alphabetically`. The docs contract asserts this over the whole of `src`,
  fixtures included.
- **Cross-layer imports use the path aliases; same-layer imports stay relative.** `domain`, `presentation`
  and `i18n` stay pure: no `@actions/*`, no `node:*`, no network, no clock beyond an injectable `now`.
- **No Biome suppressions.** Fix the root cause instead of `biome-ignore`. `noConsole` is an error with no
  allowlist: report through `@actions/core`.
- **Tests are colocated** next to the file they cover, as `src/**/*.test.ts`, and coverage is global at
  85% on every metric. Biome sorts named imports, so `import { describe, expect, it } from "vitest"` is the
  only order that passes `pnpm lint:all`.
- **Defaults live in `src/config/defaults.ts`, not in `action.yml`.** Overridable inputs deliberately
  carry an empty `default:` so the config file can win, and a test reads the real `action.yml` and fails if
  you add one.

## Commit rules

Conventional Commits, enforced by commitlint on `commit-msg`. semantic-release owns versioning, so the type
you choose is the version bump you get.

| Type | Bump | Example |
| --- | --- | --- |
| `feat` | minor | `feat(charts): add a comparison chart for the top repositories` |
| `fix` | patch | `fix(email): resolve SMTP authentication with Gmail` |
| `perf` | patch | `perf(api): halve the GitHub API calls per run` |
| `revert` | patch | `revert: feat(charts): add a comparison chart for the top repositories` |
| `docs`, `style`, `refactor`, `test`, `chore`, `ci`, `build` | none | `docs: add a troubleshooting page to the wiki` |

Breaking changes take a `!` after the type or a `BREAKING CHANGE:` footer, and bump the major.

A scope is optional and unconstrained: [`commitlint.config.ts`](../commitlint.config.ts) extends
`@commitlint/config-conventional` and declares no `scope-enum`.

**`main` takes squash merges, so the pull request title is the commit that lands.** The `commit-msg` hook
lints what you type locally, and [`commit-message.yml`](./workflows/commit-message.yml) lints the pull
request title on every open and edit, because that title is what semantic-release parses. Title the pull
request the way you would title a commit.

Do **not** add a `Co-Authored-By` trailer for an AI assistant to a commit or a pull request.

## The docs are part of the change

This repo treats its documentation as part of the code: change one, update the other **in the same
commit**. A follow-up commit is a promise, not a fix.
[`docs/docs-consistency.test.ts`](../docs/docs-consistency.test.ts) runs with the unit tests and fails the
build when the docs and the repo disagree: a dead link, a cited file that is not in the tree, an
`action.yml` input missing from a surface that lists them or out of alphabetical order, a documented default
that is not the one the code declares, an ADR off its template. "The documentation set" is meant literally:
the root guides, everything under `docs/` and `.github/`, this file included. When it fails, fix whichever
side is wrong, and never delete an assertion to get green. [CLAUDE.md](../CLAUDE.md) has the full table of
what to update for a given change, and [ARCHITECTURE.md](../ARCHITECTURE.md) holds the ADR index.

Changed inputs, outputs or defaults are reflected in [`action.yml`](../action.yml), the wiki, the README and
the *Outputs* section of [`src/application/CLAUDE.md`](../src/application/CLAUDE.md), always alphabetically.

## Pull requests

1. Fork, branch from `main`, make the change.
2. Run the checks above; rebuild and commit `dist/`; fill in the pull request template, GIF included.
3. CI runs `pnpm verify` on the pushed sha, so a pull request cannot merge while it is red.
4. After merge to `main`, the `release` job rebuilds the bundle and semantic-release versions, publishes and
   commits `package.json`, [`CHANGELOG.md`](../CHANGELOG.md) and `dist/` back as
   `chore(release): <version> [skip ci]`; a final step moves the floating `v1` tag, which is what consumers
   reference. There is no manual release step.

## Use of AI

If you use AI tools when contributing:

- **Review everything it produces.** You are responsible for what you submit.
- **Check its claims against the code.** A doc claim nobody verified is a doc claim that is wrong.
- **Disclose significant use** in the pull request description.
- **Do not add a Claude or Copilot co-author trailer** to commits or pull requests.

## Questions

- **Issues**: <https://github.com/fbuireu/github-star-tracker/issues>
- **Discussions**: <https://github.com/fbuireu/github-star-tracker/discussions>
- **Wiki**: <https://github.com/fbuireu/github-star-tracker/wiki>
- **Security**: [SECURITY.md](./SECURITY.md)

Thanks for contributing! 🎉
