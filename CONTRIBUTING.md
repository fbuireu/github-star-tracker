# Contributing to GitHub Star Tracker

This action is a TypeScript codebase bundled into a committed `dist/index.js`. Two things catch out most
first pull requests: the bundle is expected to be rebuilt in the same commit as the source, which no check
enforces, and the documentation set is verified by a test, which does. Both are covered below.

## Code of Conduct

This project and everyone participating in it is governed by our
[Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you are expected to uphold it.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When creating a bug report,
include as many details as possible:

- **Use the bug report template**: it is there to help you provide all necessary information
- **Describe the issue**: a clear and concise description
- **Steps to reproduce**: how can we see the bug ourselves?
- **Expected behavior**: what should happen?
- **Actual behavior**: what actually happens?
- **Environment**: OS, Node version, action version
- **Logs**: GitHub Actions workflow logs if applicable

### Suggesting Features

Feature requests are welcome. To suggest a feature:

- **Use the feature request template**: helps structure your proposal
- **Describe the feature**: what should it do?
- **Use cases**: why is this feature valuable?
- **Alternatives**: have you considered other approaches?
- **Implementation ideas**: do you have thoughts on how to build it?

### Improving Documentation

Found a typo? Something unclear? Documentation improvements are always welcome:

- README updates
- Wiki pages: edit the `docs/wiki/*.md` files **in this repository**. The GitHub Wiki is generated from
  that folder by `.github/workflows/sync-wiki.yml`, which runs `rsync -a --delete` on every push touching
  `docs/wiki/**`, so an edit made in the wiki UI is overwritten on the next docs commit
- Per-folder `CLAUDE.md` notes
- Examples and tutorials

## Development Process

### Getting Started

1. **Fork the repository**
   ```bash
   # Click "Fork" on GitHub, then:
   git clone https://github.com/YOUR_USERNAME/github-star-tracker.git
   cd github-star-tracker
   ```

2. **Install dependencies**
   ```bash
   # .nvmrc holds the Node version; package.json pins pnpm in packageManager
   nvm use
   pnpm install
   ```

   The Node version lives in three places that must agree: [`.nvmrc`](./.nvmrc), which both CI workflows
   read through `node-version-file`; `engines.node` in `package.json`; and the *Versions* section of the
   root [`CLAUDE.md`](./CLAUDE.md), where `docs/docs-consistency.test.ts` asserts it against
   `package.json`. Bumping Node means editing all three in one commit. The pnpm version lives in
   `packageManager` and in that same `CLAUDE.md` section.

   Note that `engines.node` is the *development* pin. The shipped runtime is `node24`, set by
   `runs.using` in `action.yml` and by the esbuild `target`, so a `node:*` API newer than Node 24 will
   type-check and bundle here and then fail on a runner.

3. **Create a branch**
   ```bash
   git checkout -b feature/my-awesome-feature
   # Or: fix/issue-123
   # Or: docs/improve-readme
   ```

### Development Workflow

1. **Make your changes**

2. **Run tests**
   ```bash
   # Run all checks
   pnpm run verify

   # Or individually:
   pnpm run lint          # Biome, check only
   pnpm run test:ut       # Unit tests
   pnpm run test:ut:coverage # Tests with coverage report
   pnpm run typecheck     # Type checking
   pnpm run verify        # Format check + typecheck + coverage + build (what CI runs)
   ```

3. **Rebuild the bundle**
   ```bash
   pnpm run build
   ```

   `action.yml` runs `dist/index.js` directly, with no install step, so the bundle is committed
   ([ADR 0003](./docs/adr/0003-commit-the-bundled-dist-directory.md)). Commit the regenerated
   `dist/index.js` and `dist/index.js.map` alongside your source changes.

   Nothing fails your pull request if you forget, and a release will not ship the stale bundle either;
   `release.yml` rebuilds it before publishing. What you are keeping honest is `main` itself: a commit type
   that does not cut a release (`refactor`, `chore`, `test`, `docs`, `ci`) leaves `main`'s `dist/` behind its
   sources until the next `feat` or `fix`, which anyone referencing `@main` would run. The `pre-push` hook
   rebuilds the bundle for you, so in practice this is a matter of committing what it leaves behind.

4. **Test your changes in a real workflow** (see [Development Tips](#development-tips) below)

5. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add support for custom data branch names"
   ```

### Git Hooks

Husky installs three hooks on `pnpm install`, so some of the checks above run whether you ask for them or
not:

| Hook | Runs | What it means for you |
| --- | --- | --- |
| `.husky/pre-commit` | `pnpm lint-staged` | Staged files are linted and formatted before the commit lands |
| `.husky/commit-msg` | `pnpm exec commitlint --edit` | A commit message that breaks the conventions below is rejected here, not in review |
| `.husky/pre-push` | `pnpm verify` | A push runs a type-check, the tests affected since `origin/main`, and a full rebuild, so expect it to take a while |

Because `pre-push` rebuilds, a push can leave `dist/` dirty. Commit that result rather than discarding it.

### Code Style

We use **Biome** for linting and formatting:

```bash
# Check code style
pnpm run lint

# Auto-fix issues
pnpm run format
```

`pnpm run verify` is the wider gate: it adds type-checking, the coverage run and the bundle on top of `lint`.

**Guidelines:**
- TypeScript: strict type-checking is on by default in the pinned version, so `tsconfig.json` does not
  declare it
- Functional programming style preferred
- No `any` types (use `unknown` if needed)
- One argument is positional and two or more are a single object typed `<FunctionName>Params`:
  `makeRepoInfo({ name, stars }: MakeRepoInfoParams)`. The exception is a function a runtime calls back,
  such as the `sort` comparator `alphabetically`. `docs/docs-consistency.test.ts` asserts this over the
  whole of `src`, fixtures included
- Constants for magic numbers and strings
- No explanatory comments. The tree carries none by design; the `CLAUDE.md` guides carry the explanation
  instead

### Testing

All features should include tests, colocated next to the file they cover:

```typescript
// src/domain/feature.test.ts
import { describe, expect, it } from 'vitest';
import { myFeature } from './feature';

describe('myFeature', () => {
  it('should do something correctly', () => {
    const result = myFeature({ input: 'test' });
    expect(result).toBe('expected');
  });
});
```

Biome sorts named imports alphabetically, so `{ describe, expect, it }` is the only order that passes
`pnpm run lint`.

**Test requirements:**
- Unit tests for all functions
- Integration tests for complex flows
- Minimum 85% code coverage, on lines, functions, branches and statements alike
- Tests must pass before merging

Run tests:
```bash
pnpm run test:ut                            # Run once
pnpm run test:ut:watch                      # Watch mode
pnpm run test:ut:coverage                   # With coverage report
pnpm vitest run src/domain                  # One layer
pnpm vitest run src/domain/forecast.test.ts # One file
```

---

## Commit Message Guidelines

This project uses [semantic-release](https://semantic-release.gitbook.io/) for automated versioning and
releases, and `.husky/commit-msg` runs commitlint on every commit, so these conventions are enforced
locally before a message can land.

### Commit Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Commit Types

| Type | Description | Version Bump | Example |
|------|-------------|--------------|---------|
| `feat` | New feature | Minor (1.0.0 to 1.1.0) | `feat: add email notification support` |
| `fix` | Bug fix | Patch (1.0.0 to 1.0.1) | `fix: resolve chart rendering in emails` |
| `docs` | Documentation only | None | `docs: update installation guide` |
| `style` | Code style/formatting | None | `style: fix indentation` |
| `refactor` | Code restructuring | None | `refactor: simplify chart generation` |
| `perf` | Performance improvement | Patch | `perf: optimize star fetching` |
| `test` | Adding/updating tests | None | `test: add email tests` |
| `chore` | Maintenance tasks | None | `chore: update dependencies` |
| `ci` | CI/CD changes | None | `ci: add release workflow` |
| `build` | Build system changes | None | `build: update esbuild config` |
| `revert` | Revert previous commit | Patch | `revert: feat: add feature X` |

A scope in parentheses is optional and unconstrained: `commitlint.config.ts` extends
`@commitlint/config-conventional` and declares no `scope-enum`.

### Breaking Changes

For breaking changes, use `!` or a `BREAKING CHANGE:` footer:

```bash
# Option 1: ! after type
git commit -m "feat!: change configuration structure"

# Option 2: Footer
git commit -m "feat: redesign API

BREAKING CHANGE: Config file now uses YAML instead of JSON.
Users must migrate their configuration files."
```

**Result:** major version bump (1.0.0 to 2.0.0)

### Commit Examples

**Good commits:**
```bash
feat(charts): add comparison chart for top repositories
fix(email): resolve SMTP authentication with Gmail
docs: add troubleshooting guide to wiki
perf(api): reduce GitHub API calls by 50%
test(tracking): add integration tests for star tracking
chore(deps): update @actions/core to v1.11.1
```

**Bad commits:**
```bash
update stuff                    # Not descriptive
Fix bug                         # Does not follow the format
added new feature               # Wrong tense (use imperative)
feat add charts                 # Missing colon
WIP                             # Not descriptive at all
```

### Automated Releases

`.github/workflows/release.yml` runs on every push to `main`. It runs `pnpm run verify` first, so a
release only happens if lint, type-check, coverage and the build all pass. semantic-release then:

1. Analyzes the commits since the last release
2. Determines the version bump from the commit types
3. Updates `package.json`
4. Generates `CHANGELOG.md` from the commits
5. Creates the git tag and the GitHub release
6. Commits `package.json`, `pnpm-lock.yaml`, `CHANGELOG.md` and `dist/` back to `main` as
   `chore(release): <version> [skip ci]`

A final workflow step force-updates the floating `v1` tag to the new release, which is the tag consumers
reference. No manual versioning is needed.

---

## Pull Request Process

### Before Submitting

- [ ] **All checks pass**: `pnpm run verify` succeeds
- [ ] **`dist/` is rebuilt and committed** if you touched any bundled file under `src/` (that is,
      anything except `*.test.ts` and the fixtures in `src/shared/tests/`, neither of which the bundle reaches)
- [ ] **Code is formatted**: run `pnpm run format`
- [ ] **Types are correct**: no TypeScript errors
- [ ] **Documentation updated**: see the maintenance contract in the root [`CLAUDE.md`](./CLAUDE.md)
- [ ] **Commits follow conventions**: see above
- [ ] **Branch is up to date**: rebase on `main` if needed

### Creating a Pull Request

1. **Push your branch**
   ```bash
   git push origin feature/my-awesome-feature
   ```

2. **Open PR on GitHub**
   - Click "Compare & pull request"
   - Fill in the PR template
   - Link related issues
   - Add a GIF. The template's GIF section is mandatory, and it is the one requirement here that is
     enforced by nothing but good faith

3. **PR Title Format**
   Follow commit conventions:
   ```
   feat: add support for custom branch names
   fix: resolve email delivery issue
   docs: improve setup documentation
   ```

4. **Description**
   - What does this PR do?
   - Why is this change needed?
   - How has it been tested?
   - Screenshots or example output if applicable

### Review Process

- **Maintainers will review** your PR
- **Address feedback**: make the requested changes
- **Keep discussions respectful**: we are all learning
- **Be patient**: reviews may take a few days

### After Approval

- The PR is merged to `main`
- An automated release triggers if the commit types call for one
- Your contribution ships in the next version

---

## Project Structure

```
github-star-tracker/
├── .github/                # CI/CD workflows and issue templates
├── src/
│   ├── application/        # Orchestration layer: the single trackStars() run
│   ├── assets/             # Not a layer: the brand mark the README embeds
│   ├── config/             # Configuration: input parsing, YAML, validation, defaults
│   ├── domain/             # Pure business logic (see below)
│   ├── i18n/               # Internationalization: locale bundles and translation loaders
│   ├── index.ts            # Entry point: calls trackStars() at module load
│   ├── infrastructure/     # External services: GitHub API, Git CLI, persistence, SMTP
│   ├── presentation/       # Output generation: Markdown, HTML, SVG charts, CSV, badges
│   └── shared/             # Cross-cutting code owning no layer; today only test fixtures
├── dist/                   # Committed bundle, what action.yml actually runs (ADR 0003)
├── action.yml              # GitHub Action metadata
├── package.json            # Dependencies and scripts
└── tsconfig.json           # TypeScript configuration with path aliases
```

`src/domain/` is the largest layer and holds one module per concept: run measurement, comparison,
snapshots, forecasting, velocity, growth, stargazer diffing, star-history reconstruction, tracked-set
resolution, sampling, notification settlement, formatting and time parsing, plus `types.ts` and
`constants.ts`. [`src/domain/CLAUDE.md`](./src/domain/CLAUDE.md) is the guide.

> [!TIP]
> **Path aliases:** cross-layer imports use `@application/*`, `@assets/*`, `@config/*`, `@domain/*`,
> `@i18n`, `@infrastructure/*`, `@presentation/*` and `@shared/*`. Same-layer imports use relative paths.
> The aliases are declared once, in `tsconfig.json`, and the build and test configs derive theirs from it.
> `@i18n` is a file alias rather than a glob, so `@i18n/types` does not resolve. Tests are colocated as
> `*.test.ts` files next to the source.

### Documentation that ships with the code

Four kinds of document, one job each. `CLAUDE.md` appears twice below because it is the same artefact at
two scales, repo-wide and per layer. They are maintained by hand, so a code change that does not update
them leaves them lying:

| Document | Answers | Update it when |
| --- | --- | --- |
| `CLAUDE.md` (root) | *How do I work in this repo?* Commands, aliases, conventions, the maintenance contract | You change a script, an alias, a convention, or a repo-wide invariant |
| `CONTEXT.md` (root) | *What does this word mean?* A domain glossary, and nothing else: no file names, no libraries, no implementation detail | A domain term changes meaning, or a new one appears |
| `src/<layer>/CLAUDE.md` | *What does this layer guarantee?* Invariants and gotchas, one guide per layer | You change an invariant, or a rule the guide states |
| `ARCHITECTURE.md` | *How does it fit together?* Layer map, end-to-end run, data branch, build and release | You change the run order, the layering, or the pipeline |
| `docs/adr/` | *Why is it like this?* One decision per file | You make a decision that is hard to reverse, surprising without context, **and** the result of a real trade-off |

The root [`CLAUDE.md`](./CLAUDE.md) has the full table of what to update for a given change.

### The documentation test

`docs/docs-consistency.test.ts` runs with `pnpm run test`, so it gates every pull request. It reads the
whole documentation set and fails on, among other things:

- A markdown link pointing at a file that does not exist
- A cited source or test file that is not in the tree
- A `file.ts:123` citation anywhere; name the symbol instead, because line numbers rot silently
- An `action.yml` input or output missing from a surface that lists them, or listed out of alphabetical
  order
- An overridable input whose documented default is not the one `src/config/defaults.ts` declares, or whose
  documentation does not say the config file can override it
- A `pnpm` script named in the root `CLAUDE.md` that `package.json` does not declare
- An ADR that breaks the template shape, is numbered out of sequence, is missing from the
  `ARCHITECTURE.md` index, or has no contextual link from any document other than that index
- A translation-key table in `docs/wiki/Internationalization-(i18n).md` that does not match
  `src/i18n/en.json` section for section and key for key
- A documented `stars-data.json` example whose `version` is not the one the writer stamps
- A function or arrow taking two or more positional parameters
- A sample chart in `examples/README.md` with no corresponding SVG

"The whole documentation set" is meant literally: the root guides, everything under `docs/` and `.github/`,
every layer `CLAUDE.md`, `examples/README.md`, and this file along with `SECURITY.md` and
`CODE_OF_CONDUCT.md`. If you edit any of them, the test reads what you wrote.

A failure means the docs and the code disagree, so fix whichever is wrong. The test cannot check prose or
rationale; that part is still on you.

## Development Tips

### Testing Your Action Locally

Create a test workflow:

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

The action runs the committed `dist/index.js`, not your sources, so run `pnpm run build` before you
dispatch the workflow.

### Debugging

Use `@actions/core` rather than `console`. Its helpers annotate the workflow log, and `core.debug` output
only appears when the `ACTIONS_STEP_DEBUG` secret is set, which keeps normal runs readable:

```typescript
import * as core from '@actions/core';

core.debug('Detailed debug info');
core.info('General information');
core.warning('Warning message');
core.error('Error message');
```

---

## Use of AI

If you use AI tools when contributing:

- **Review all generated code**: you are responsible for the code you submit
- **Test thoroughly**: AI-generated code must pass all existing tests and include new tests where
  appropriate
- **Disclose significant AI usage**: if an entire feature or module was AI-generated, mention it in the PR
  description
- **Do not blindly copy**: understand what the code does before submitting

AI is a tool, not a substitute for understanding the codebase.

---

## Questions?

- **Discussions**: [GitHub Discussions](https://github.com/fbuireu/github-star-tracker/discussions)
- **Documentation**: [Wiki](https://github.com/fbuireu/github-star-tracker/wiki)
- **Issues**: [GitHub Issues](https://github.com/fbuireu/github-star-tracker/issues)

---
<div align="center">

Thank you for contributing!

</div>
