# AGENTS.md

Agent-facing guide for **github-star-tracker**, a GitHub Action that tracks star counts across a token
owner's repositories. [CONTEXT.md](./CONTEXT.md) is the domain glossary and [ARCHITECTURE.md](./ARCHITECTURE.md)
the big picture: layer map, end-to-end Run, the Data Branch, build and release.

Reviewing a diff: [CODING_STANDARDS.md](./CODING_STANDARDS.md).

## What this is

A JavaScript action. [`src/index.ts`](./src/index.ts) calls `trackStars()` in
[`src/application/tracker.ts`](./src/application/tracker.ts), the one use case, at module load; esbuild bundles it
into the committed [`dist/index.js`](./dist/index.js), which [`action.yml`](./action.yml) runs.

## Versions

This section names where each runtime is pinned and never what the pin says: read the file named beside each one.

- Node (`engines.node`, and [`.nvmrc`](./.nvmrc), which every job in [`ci.yml`](./.github/workflows/ci.yml) installs from via `node-version-file`)
- pnpm (`packageManager`): every install and every script goes through pnpm

Each runtime is pinned once and exactly: `.nvmrc` and `engines.node` agree, no workflow pins either again, and no
document outside the ADRs and `CHANGELOG.md` names a runtime, or a framework `package.json` declares, beside a
version, the shipped runtime below excepted. `pnpm test:docs` asserts all of it.

`engines.node` is the development pin; the shipped runtime is `node24` (`action.yml` `runs.using`, and
[`esbuild.config.ts`](./esbuild.config.ts) `target`). `@types/node` tracks the development version and esbuild's
`target` lowers syntax without shimming runtime APIs, so a `node:*` API that landed after 24.x type-checks, bundles,
passes `pnpm verify` and then throws `TypeError: … is not a function` on a GitHub runner, where nothing here runs the
bundle first. Check a new `node:` API against Node 24, not against `engines.node`.

## Commands

```bash
pnpm build            # tsx esbuild.config.ts -> dist/index.js
pnpm lint             # biome lint, the root command the variants pass paths to
pnpm lint:all         # lint .
pnpm lint:all:fix     # lint:all --fix
pnpm lint:changed     # lint --write, over what biome sees as changed; see below
pnpm format           # biome check --write, the root command lint-staged appends files to
pnpm format:all       # format .
pnpm format:changed   # format, over the same; see below
pnpm format:check     # biome check, no writes; what verify runs
pnpm typecheck        # tsc --noEmit
pnpm test:ut          # vitest run
pnpm test:ut:watch    # vitest, watch mode
pnpm test:ut:coverage # test:ut --coverage (85% threshold, every metric)
pnpm test:ut:changed  # test:ut --changed origin/main
pnpm test:docs        # the docs contract alone
pnpm verify:static    # format:check && typecheck && build: everything verify does but the suite
pnpm verify           # verify:static && test:ut:coverage; what CI runs
pnpm verify:changed   # verify:static && test:ut:changed; what pre-push runs
```

Run one layer with `pnpm vitest run src/domain`, one file with `pnpm vitest run src/domain/forecast.test.ts`.

`test:ut:changed` picks tests through the import graph, which no Markdown file is in, so after a change to the docs
alone run `pnpm test:docs`.

Biome's `--changed` diffs against `vcs.defaultBranch`, which is `main`, so on `main` `pnpm format:changed` answers
*Checked 0 files* however much has changed. Reach for `format:all` there.

The hooks: `pre-commit` runs lint-staged, `commit-msg` runs commitlint, `pre-push` runs `verify:changed`, and CI runs
the full `pnpm verify`; [ARCHITECTURE.md](./ARCHITECTURE.md) says why the hook stops short of it. `pre-push`
rebuilds the bundle, so a push can leave `dist/` dirty: commit that result rather than discarding it.

## Structure & aliases

`src/` is one entry point plus its layers, each with an alias and an explicit set of things it may depend on
([ADR 0004](./docs/adr/0004-layered-source-structure.md)). The full dependency graph, forbidden arrows included, is
the layer table in [ARCHITECTURE.md](./ARCHITECTURE.md), which `pnpm test:docs` reads as the import contract.
`assets/` is not a layer: it holds the brand files the README embeds.

| Layer | Alias | Owns |
| --- | --- | --- |
| `application/` | `@application/*` | Orchestration: the single `trackStars()` run |
| `assets/` | `@assets/*` | The star mark the README embeds: no code, imported by nothing |
| `config/` | `@config/*` | Action inputs + `star-tracker.yml` -> a typed `Config` |
| `domain/` | `@domain/*` | Pure business logic and types |
| `i18n/` | `@i18n` | Locale bundles, `getTranslations`, `interpolate` |
| `infrastructure/` | `@infrastructure/*` | The Run's outbound side effects: octokit, the `git` CLI, the files it writes, nodemailer |
| `presentation/` | `@presentation/*` | Pure rendering: data in, markdown/HTML/SVG/CSV string out |
| `shared/` | `@shared/*` | Cross-cutting code owning no layer: `errorMessage`, the schema-issue wording, and the test factories |

Aliases are declared **once**, in [`tsconfig.json`](./tsconfig.json) `compilerOptions.paths`. `esbuild.config.ts` derives its
`alias` map from that object at build time and [`vitest.config.mts`](./vitest.config.mts) sets `resolve.tsconfigPaths: true`, so a
new alias needs exactly one edit, in `tsconfig.json` rather than in the build or test config. `@i18n` is a
**file** alias (`"@i18n": ["./src/i18n/index.ts"]`), not a glob: `@i18n/types` does not resolve, so
re-export from [`src/i18n/index.ts`](./src/i18n/index.ts) instead.

Nested guides: read the one for the layer you are touching; they carry the detail this file omits.

| Folder | Covers |
| --- | --- |
| [`src/application/`](./src/application/AGENTS.md) | The Run's wiring, the output contract |
| [`src/assets/`](./src/assets/AGENTS.md) | The mark, why it needs no light/dark pair, and why the README heading stays |
| [`src/config/`](./src/config/AGENTS.md) | Input + YAML precedence, what throws vs warns, parser vocabularies |
| [`src/domain/`](./src/domain/AGENTS.md) | Comparison semantics, snapshots, forecast/velocity maths, star-history |
| [`src/i18n/`](./src/i18n/AGENTS.md) | Bundles, placeholder rules, adding a locale |
| [`src/infrastructure/`](./src/infrastructure/AGENTS.md) | The adapters: octokit, git worktree, persistence, SMTP |
| [`src/presentation/`](./src/presentation/AGENTS.md) | Renderers, the chart set, the report model |
| [`src/shared/`](./src/shared/AGENTS.md) | `errors.ts` and the fixture factories |

## Conventions

- **One argument is positional; two or more are one object**, typed `<FunctionName>Params`.
- **`domain`, `presentation` and `i18n` must stay pure**: no `node:*`, no `@actions/*`, no network, and no clock
  beyond an injectable `now`.
- **No comments** in hand-written source, doc comments and suppressions included. The reason for a line goes in the
  commit message, the pull request, an ADR or [CODING_STANDARDS.md](./CODING_STANDARDS.md).
- `pnpm test:docs` fails on a breach of any of the three.
- **Data from outside the action goes through a `zod/mini` schema**, never a cast, and `zod` is imported only as
  `import * as z from "zod/mini"`, which `pnpm test:docs` checks too
  ([ADR 0023](./docs/adr/0023-untrusted-input-is-validated-with-zod-mini.md)).
- **Conventional commits** (commitlint + husky). semantic-release owns versioning and reads the type as the version
  bump, per the table in [CONTRIBUTING.md](./.github/CONTRIBUTING.md), so the type states what the change does for a
  user. Do NOT add a Co-Authored-By / Claude trailer to commits or PRs.

## Maintenance contract

These documents are not generated. When you change code, update the docs **in the same commit**: a follow-up commit
is a promise, not a fix.

`pnpm test:docs` runs [`docs/docs-consistency.test.ts`](./docs/docs-consistency.test.ts), which holds every document
to the claims it can check against the repository. A failure means the docs and the code disagree; fix whichever is
wrong. What it cannot check is prose or rationale, and that part is still on you.

| If you change | Update |
| --- | --- |
| What a domain word means, or introduce a new one | [`CONTEXT.md`](./CONTEXT.md): the glossary, vocabulary only |
| A rule about how code is written | [`CODING_STANDARDS.md`](./CODING_STANDARDS.md) |
| A behaviour a doc states as an invariant or a gotcha | that bullet, or delete it if it stopped being true |
| What a layer does, or the files a concept is made of | that layer's nested `AGENTS.md` (table above) |
| A default, an input name, or an output | `action.yml`, [`docs/wiki/Configuration.md`](./docs/wiki/Configuration.md), [`docs/wiki/API-Reference.md`](./docs/wiki/API-Reference.md), the README table, [`docs/wiki/Viewing-Reports.md`](./docs/wiki/Viewing-Reports.md), the *Outputs* section of [`src/application/AGENTS.md`](./src/application/AGENTS.md) and the outputs line of [`ARCHITECTURE.md`](./ARCHITECTURE.md), always **alphabetically** and never appended at the end (`github-token` stays pinned first) |
| A package script or a path alias | the *Commands* / *Structure & aliases* sections here |
| A layer boundary, the run order, or the build pipeline | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| A decision an ADR records | that ADR: amend it, or supersede it with a new one and say so in both `## Status` blocks |

A new ADR starts as a copy of [ADR 0000](./docs/adr/0000-adr-template.md), the template, which says when a decision
earns one and where to link it from.

## Gotchas

- `dist/index.js` is committed and is what `action.yml` (`runs.main`) executes, because GitHub runs a JS action
  straight from the repository with no install step ([ADR 0003](./docs/adr/0003-commit-the-bundled-dist-directory.md)).
  The `release` job rebuilds it before `semantic-release` commits it, and no pull-request check does, so a `refactor`
  or `chore` commit, which cuts no release, leaves `main`'s bundle behind its sources. Commit your rebuild alongside
  the source.
- **Defaults live in [`src/config/defaults.ts`](./src/config/defaults.ts), not in `action.yml`.** Overridable inputs carry
  an empty `default:` so the config file can win ([ADR 0020](./docs/adr/0020-overridable-inputs-declare-an-empty-default.md));
  `src/config/action-inputs.test.ts` reads the real `action.yml` and fails if you add one, and
  [`src/config/`](./src/config/AGENTS.md) names the handful of inputs that do carry a default, and why.
- Coverage excludes [`src/index.ts`](./src/index.ts), `src/**/{types,defaults,constants}.ts`, `src/**/*.test.ts` and
  `src/shared/tests/**`. Changing a constant therefore produces no coverage signal, but many tests assert the
  resulting literals, so expect failures far from the edit.
- `minimumReleaseAge` in [`pnpm-workspace.yaml`](./pnpm-workspace.yaml) counts minutes, not days. When a security
  fix is younger than that, Renovate adds it to `minimumReleaseAgeExclude` with a `# Renovate security update:`
  comment above it; that line is Renovate's, as `pnpm-lock.yaml` is pnpm's, and the YAML check in `pnpm test:docs`
  lets it through.
- The release config teaches both commit-parsing plugins the `!` grammar through `parserOpts`. Without it a
  `feat(x)!:` commit is analysed with no type, the job ends green and nothing is released. `pnpm test:docs` asserts
  that both plugins carry the same `parserOpts`, and [ARCHITECTURE.md](./ARCHITECTURE.md) says why the `preset` route
  does not work here.
