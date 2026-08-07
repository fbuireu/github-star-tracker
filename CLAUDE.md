# CLAUDE.md

Agent-facing guide for **github-star-tracker** — a GitHub Action that tracks star counts across a token
owner's repositories. See [CONTEXT.md](./CONTEXT.md) for the domain glossary (snapshot, baseline, data
branch, sampled repo, read-only run…); do not duplicate it here. [ARCHITECTURE.md](./ARCHITECTURE.md) is
the big picture: layer map, end-to-end run, the data branch, build and release.

## What this is

A JavaScript action (TypeScript sources bundled by esbuild into `dist/index.js`, `runs.using: node24` per
`action.yml`). On each run it lists the token owner's repositories, compares their star counts against a
snapshot stored on a dedicated data branch, and commits a markdown report, JSON/CSV data, a badge and
animated SVG charts back to that branch. It exposes eleven action outputs and can send an HTML digest over
SMTP. There is exactly one use case: `trackStars()`.

## Stack

- **TypeScript 7** with `verbatimModuleSyntax` and `isolatedModules` — type-only imports must be written
  `import type { … }` or `import { type X }`, or the build breaks. `resolveJsonModule` is on, which is how
  `src/i18n/*.json` is imported and type-checked.
- Runtime deps, all bundled: `@actions/core`, `@actions/github`, `@octokit/plugin-retry`, `js-yaml`,
  `nodemailer`. `node_modules` is not shipped.
- **esbuild** (`platform: node`, `target: node24`, `format: cjs`), **Vitest** (v8 coverage), **Biome**
  (lint + format), **semantic-release** + commitlint, **husky** + lint-staged.

## Versions (pinned by hand — not enforced by the docs test, since routine dependency bumps would break CI on it)

- Node **26.2.0** (`engines.node`)
- pnpm **11.15.1** (`packageManager`) — always use pnpm, never npm/yarn

## Commands

```bash
pnpm build            # tsx esbuild.config.ts -> dist/index.js
pnpm lint             # biome check (base command)
pnpm format           # lint --write
pnpm typecheck        # tsc --noEmit
pnpm test             # vitest run
pnpm test:coverage    # vitest run --coverage (85% threshold, all four metrics)
pnpm check            # lint && typecheck && test:coverage
pnpm validate         # check && build — what the release job runs
```

Run one layer with `pnpm vitest run src/domain`, one file with `pnpm vitest run src/domain/forecast.test.ts`.

## Structure & aliases

`src/` is a mini-DDD tree — one entry point plus seven layers, each with an alias and an explicit set of
things it may depend on ([ADR 0004](./docs/adr/0004-layered-source-structure.md)), and one folder that is
not a layer at all: `assets/`, the brand files the README embeds. `index.ts` imports
`trackStars` from `@application/tracker` and calls it at module load; nothing else may import
`@application/*`. The full dependency graph, with the arrows that are forbidden, is the layer map in
[ARCHITECTURE.md](./ARCHITECTURE.md).

| Layer | Alias | Owns |
| --- | --- | --- |
| `application/` | `@application/*` | Orchestration: the single `trackStars()` run |
| `assets/` | `@assets/*` | The star mark the README embeds — no code, imported by nothing |
| `config/` | `@config/*` | Action inputs + `star-tracker.yml` -> a typed `Config` |
| `domain/` | `@domain/*` | Pure business logic and types |
| `i18n/` | `@i18n` | Locale bundles, `getTranslations`, `interpolate` |
| `infrastructure/` | `@infrastructure/*` | All I/O: octokit, `git` CLI, `fs`, nodemailer |
| `presentation/` | `@presentation/*` | Pure rendering: data in, markdown/HTML/SVG/CSV string out |
| `shared/` | `@shared/*` | Cross-cutting code owning no layer (today: test factories) |

Tests are colocated next to the file they cover (`src/**/*.test.ts`). The one test covering no module is
`docs/docs-consistency.test.ts` — the docs guard described below, colocated with the docs it checks.

Aliases are declared **once**, in `tsconfig.json` `compilerOptions.paths`. `esbuild.config.ts` derives its
`alias` map from that object at build time and `vitest.config.ts` sets `resolve.tsconfigPaths: true`, so a
new alias needs exactly one edit — in `tsconfig.json`, not in the build or test config. `@i18n` is a **file**
alias (`"@i18n": ["./src/i18n/index.ts"]`), not a glob: `@i18n/types` does not resolve, so re-export from
`src/i18n/index.ts` instead.

**Nested guides** — read the one for the layer you are touching, they carry the detail this file omits:

| Folder | Covers |
| --- | --- |
| [`src/application/`](./src/application/CLAUDE.md) | Run sequence, the output contract, failure policy |
| [`src/assets/`](./src/assets/CLAUDE.md) | The mark, why it needs no light/dark pair, and why the README heading stays |
| [`src/config/`](./src/config/CLAUDE.md) | Input + YAML precedence, what throws vs warns, parser vocabularies |
| [`src/domain/`](./src/domain/CLAUDE.md) | Comparison semantics, snapshots, forecast/velocity maths, star-history |
| [`src/i18n/`](./src/i18n/CLAUDE.md) | Bundles, placeholder rules, adding a locale |
| [`src/infrastructure/`](./src/infrastructure/CLAUDE.md) | The four adapters: octokit, git worktree, persistence, SMTP |
| [`src/presentation/`](./src/presentation/CLAUDE.md) | Renderers, the chart trio, escaping rules |
| [`src/shared/`](./src/shared/CLAUDE.md) | Fixture factories and why this folder stays almost empty |

## Conventions

- **Cross-layer imports use the alias; same-layer imports stay relative.** `@domain/snapshot` from
  `presentation`, `./snapshot` from inside `domain`. Mixed forms of the same module break Biome's import
  sorting and duplicate it in the bundle. "Same layer" means all of `src/infrastructure`, not one adapter.
- **Named params for 2+ arguments.** Any function taking two or more arguments takes one destructured
  object typed by an interface: `function foo({ a, b }: FooParams)`. Single-argument functions stay
  positional. The fixture factories in `src/shared/tests` are the only sanctioned exception.
- **No explanatory comments in `.ts` files**, without exception — the tree contains none. These `CLAUDE.md`
  files carry the explanation instead. If something needs explaining it goes in the folder's *Invariants* or
  *Gotchas* section, not above the line.
- **`domain`, `presentation` and `i18n` must stay pure.** No `@actions/*`, no `node:*`, no network, no fs, and
  no clock beyond an injectable `now`. Rendering returns strings; writing files is `application`'s job. The
  impure layers each own a different side effect: `config` reads the action inputs and the YAML file
  (`node:fs`), `infrastructure` owns everything outbound, and `application` writes the Action log and the
  outputs. `infrastructure` is the only layer that reaches the network — not the only one that does I/O.
- **Conventional commits** (commitlint + husky). semantic-release owns versioning. Do NOT add a
  Co-Authored-By / Claude trailer to commits or PRs.

## Maintenance contract

These documents are not generated. A change that does not update them leaves the tree describing code that
no longer exists, so when you change code, update the docs **in the same commit** — a follow-up commit is a
promise, not a fix.

`docs/docs-consistency.test.ts` makes the mechanical half of that contract executable: it reads every
document and asserts the checkable claims against the repo — no dead markdown links, no citation of a source
or test file that does not exist, no sample chart in `examples/README.md` without its SVG, every `action.yml`
input and output named on the surfaces that list them, and the ADR set held to its template (sequential
numbering, `NNNN-kebab-title.md` filenames, the `# N. Title` / date / status / *Context* / *Decision* /
*Consequences* shape, a row in the `ARCHITECTURE.md` index, and — the one that rots quietly — a link from
some document **other** than that index, since an ADR only the index points at will not be read). It runs
with `pnpm test`, so in CI on every PR. A failure means the docs and the code disagree; fix whichever is
wrong. It cannot check prose or rationale — that part is still on you. Keep its assertions **aggregated**
(one failing list per rule) rather than `it.each` per document.

| If you change | Update |
| --- | --- |
| What a domain word means, or introduce a new one | [`CONTEXT.md`](./CONTEXT.md) — the glossary, vocabulary only |
| A behaviour a doc states as an invariant or a gotcha | that bullet, or delete it if it stopped being true |
| A layer's rules, or the files a concept is made of | that layer's nested `CLAUDE.md` (table above) |
| A default, an input name, or an output | `action.yml`, `docs/wiki/Configuration.md`, `docs/wiki/API-Reference.md`, the README table, and the *Outputs* section of `src/application/CLAUDE.md` |
| A package script, a path alias, or a layer boundary | the *Commands* / *Structure & aliases* sections here |
| The run order, the layer map, or the build pipeline | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| A decision an ADR records | that ADR — amend it, or supersede it with a new one and say so in both `## Status` blocks |

Propose an ADR in [`docs/adr/`](./docs/adr/) when a decision is **hard to reverse**, **surprising without
context** and **the result of a real trade-off**. All three, or it is not an ADR. Copy
[ADR 0000](./docs/adr/0000-adr-template.md), the template, number it one above the highest existing file,
add it to the index in `ARCHITECTURE.md`, and link it from wherever it bites — a gotcha here, a nested
guide, a wiki page. Both the template shape and the incoming contextual link are asserted.

Two traps worth naming, because both have already happened here: deleting a resolved entry from a "known
inconsistencies" list is part of the fix, not tidying to do later; and a `file.ts:123` citation silently rots
the moment anything above it moves — prefer naming the symbol.

## Gotchas

- **`dist/index.js` is committed** and is what `action.yml` (`runs.main`) executes, because GitHub runs a JS
  action straight from the repository with no install step ([ADR 0003](./docs/adr/0003-commit-the-bundled-dist-directory.md)).
  A source change is not shipped until `pnpm build` has regenerated it.
- **Defaults live in `src/config/defaults.ts`, not in `action.yml`.** Overridable inputs deliberately carry
  an empty `default:` so the config file can win; `src/config/action-inputs.test.ts` reads the real
  `action.yml` and fails if you add one. Only `config-path`, `send-on-no-changes` and `smtp-port` carry a
  non-empty default.
- **Coverage is global at 85%** for lines/functions/branches/statements. Excluded: `src/index.ts`,
  `src/**/{types,defaults,constants}.ts`, `src/**/*.test.ts`, `src/shared/tests/**`. Changing a constant
  therefore produces no coverage signal, but many tests assert the resulting literals — expect failures far
  from the edit.
- **One test file can cover two modules.** `src/infrastructure/github/filters.test.ts` is the spec for both
  `filters.ts` and `client.ts`, and `src/config/action-inputs.test.ts` covers the manifest, not a module.
- **Biome allows no suppressions.** Fix the root cause instead of `biome-ignore`. 100-col, 2-space, LF,
  single quotes; `.gitattributes` pins `* text=auto eol=lf`.

## Build & release

`esbuild.config.ts` (run via `tsx`) bundles `src/index.ts` into the committed `dist/index.js` with a
sourcemap. Husky runs `lint-staged` on `pre-commit`, `commitlint` on `commit-msg` and
`typecheck && test:changed && build` on `pre-push`. `.releaserc.json` runs semantic-release on `main`,
committing `package.json`, `pnpm-lock.yaml`, `CHANGELOG.md` and `dist/`. `ci.yml` runs check (which
includes coverage) + Codecov upload + build; `release.yml` runs `pnpm validate` then semantic-release; `sync-wiki.yml` publishes `docs/wiki/` to
the GitHub Wiki. Full detail, including every workflow, is in [ARCHITECTURE.md](./ARCHITECTURE.md).
