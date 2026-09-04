# CLAUDE.md

Agent-facing guide for **github-star-tracker**, a GitHub Action that tracks star counts across a token
owner's repositories. See [CONTEXT.md](./CONTEXT.md) for the domain glossary (snapshot, baseline, data
branch, sampled repo, read-only run…); do not duplicate it here. [ARCHITECTURE.md](./ARCHITECTURE.md) is
the big picture: layer map, end-to-end run, the data branch, build and release.

## What this is

A JavaScript action (TypeScript sources bundled by esbuild into [`dist/index.js`](./dist/index.js), `runs.using: node24` per
[`action.yml`](./action.yml)). On each run it lists the token owner's repositories, compares their star counts against a
snapshot stored on a dedicated data branch, and commits a markdown report, JSON/CSV data, a badge and
animated SVG charts back to that branch. It exposes eleven action outputs and can send an HTML digest over
SMTP. There is exactly one use case: `trackStars()`.

## Stack

- **TypeScript** with `verbatimModuleSyntax` and `isolatedModules`: type-only imports must be written
  `import type { … }` or `import { type X }`, or the build breaks. `resolveJsonModule` is on, which is how
  `src/i18n/*.json` is imported and type-checked.
- Runtime deps, all bundled: `@actions/core`, `@actions/github`, `@octokit/plugin-retry`, `js-yaml`,
  `nodemailer`. `node_modules` is not shipped.
- **esbuild** (`platform: node`, `target: node24`, `format: cjs`), **Vitest** (v8 coverage), **Biome**
  (lint + format), **semantic-release** + commitlint, **husky** + lint-staged.

## Versions

**This section names where each runtime is pinned and never what the pin says.** A digit written here is a
claim a bot invalidates on its own, and the two ways of defending one both cost more than they return.
Asserting it against the manifest fails every dependency pull request on a line the bot cannot edit, which is
what contribKit did until it stopped. Quoting it without asserting it rots, which is what two sibling guides
did. This repository took a third way and kept both, with `customManagers` rewriting the prose in the same
pull request as the manifest; that worked, and it was still two regexes over prose, a grouping rule holding
them together and a documented trap for whoever added the next pin. Read the file instead.

- Node (`engines.node`, and [`.nvmrc`](./.nvmrc), which every job in [`ci.yml`](./.github/workflows/ci.yml) installs from via `node-version-file`)
- pnpm (`packageManager`): always use pnpm, never npm/yarn

Both are deliberate pins rather than dependency ranges, and seven rules in
[`docs/docs-consistency.test.ts`](./docs/docs-consistency.test.ts) assert the shape a bump cannot change: both
runtimes are named here and neither is quoted, `.nvmrc` and `engines.node` agree, `packageManager` is the sole
declaration of the package manager, each pin is exact rather than a range, no workflow or composite action
sets `node-version` by hand, no document outside the ADRs names a runtime or a framework beside a version, and
the one number the guides do state, the shipped runtime below, is read out of `action.yml` rather than
written down twice.
Nothing compared `.nvmrc` with `engines.node` until that rule existed, so the two places this repository
declares Node could drift in silence; a workflow that pinned it by hand would be a third declaration with a
new hiding place. Every sibling repository carries the same set.

**`engines.node` is the development pin; the shipped runtime is `node24`** (`action.yml` `runs.using`, and
[`esbuild.config.ts`](./esbuild.config.ts) `target`). Those are different numbers on purpose. The gap is a trap: `@types/node` tracks
the *development* version, and esbuild's `target` lowers syntax without shimming runtime APIs, so a `node:*`
API that landed after 24.x type-checks, bundles, passes `pnpm verify` and then throws
`TypeError: … is not a function` on a GitHub runner. It fails in a user's workflow rather than in CI, because
`dist/` is committed and nothing executes the bundle. Today the tree only reaches for `node:fs`, `node:path`
and `node:child_process.execFileSync`, all long-standing. Check a new `node:` API against Node 24, not
against `engines.node`.

## Commands

```bash
pnpm build            # tsx esbuild.config.ts -> dist/index.js
pnpm lint             # biome lint, the root command the variants pass paths to
pnpm lint:all         # lint .
pnpm lint:all:fix     # lint:all --fix
pnpm lint:changed     # lint --write, over what changed against main
pnpm format           # biome check --write, the root command lint-staged appends files to
pnpm format:all       # format .
pnpm format:changed   # format, over what changed against main
pnpm format:check     # biome check, no writes; what verify runs
pnpm typecheck        # tsc --noEmit
pnpm test:ut          # vitest run
pnpm test:ut:watch    # vitest, watch mode
pnpm test:ut:coverage # test:ut --coverage (85% threshold, all four metrics)
pnpm test:ut:changed  # test:ut --changed origin/main
pnpm test:docs        # the docs contract alone
pnpm verify           # format:check && typecheck && test:ut:coverage && build
```

Run one layer with `pnpm vitest run src/domain`, one file with `pnpm vitest run src/domain/forecast.test.ts`.

## Structure & aliases

`src/` is a mini-DDD tree: one entry point plus seven layers, each with an alias and an explicit set of
things it may depend on ([ADR 0004](./docs/adr/0004-layered-source-structure.md)), and one folder that is
not a layer at all, `assets/`, holding the brand files the README embeds. The `(ish)` means **DDD applied
where it pays, not by the book**: what carries the design is the ubiquitous language of
[`CONTEXT.md`](./CONTEXT.md) and the layer boundaries, and the tactical catalogue is taken where it fits.
ADR 0004 weighs aggregates, the Repository pattern, domain events and a service layer one at a time, and
[ADR 0022](./docs/adr/0022-a-concept-earns-a-type-when-it-crosses-a-boundary.md) decides value objects per
concept. `index.ts` imports
`trackStars` from `@application/tracker` and calls it at module load; nothing else may import
`@application/*`. The full dependency graph, with the arrows that are forbidden, is the layer map in
[ARCHITECTURE.md](./ARCHITECTURE.md).

| Layer | Alias | Owns |
| --- | --- | --- |
| `application/` | `@application/*` | Orchestration: the single `trackStars()` run |
| `assets/` | `@assets/*` | The star mark the README embeds: no code, imported by nothing |
| `config/` | `@config/*` | Action inputs + `star-tracker.yml` -> a typed `Config` |
| `domain/` | `@domain/*` | Pure business logic and types |
| `i18n/` | `@i18n` | Locale bundles, `getTranslations`, `interpolate` |
| `infrastructure/` | `@infrastructure/*` | All I/O: octokit, `git` CLI, `fs`, nodemailer |
| `presentation/` | `@presentation/*` | Pure rendering: data in, markdown/HTML/SVG/CSV string out |
| `shared/` | `@shared/*` | Cross-cutting code owning no layer: `errorMessage`, and the test factories |

Tests are colocated next to the file they cover, as `src/**/*.test.ts`. The test files covering no module are:
[`src/config/action-inputs.test.ts`](./src/config/action-inputs.test.ts), which asserts against `action.yml` rather than against a module, and
[`docs/docs-consistency.test.ts`](./docs/docs-consistency.test.ts), the docs guard described below, which lives with the documents it checks
instead of under `src/`.

Aliases are declared **once**, in [`tsconfig.json`](./tsconfig.json) `compilerOptions.paths`. `esbuild.config.ts` derives its
`alias` map from that object at build time and [`vitest.config.ts`](./vitest.config.ts) sets `resolve.tsconfigPaths: true`, so a
new alias needs exactly one edit, in `tsconfig.json` rather than in the build or test config. `@i18n` is a
**file** alias (`"@i18n": ["./src/i18n/index.ts"]`), not a glob: `@i18n/types` does not resolve, so
re-export from [`src/i18n/index.ts`](./src/i18n/index.ts) instead.

**Nested guides.** Read the one for the layer you are touching; they carry the detail this file omits.

| Folder | Covers |
| --- | --- |
| [`src/application/`](./src/application/CLAUDE.md) | Run sequence, the output contract, failure policy |
| [`src/assets/`](./src/assets/CLAUDE.md) | The mark, why it needs no light/dark pair, and why the README heading stays |
| [`src/config/`](./src/config/CLAUDE.md) | Input + YAML precedence, what throws vs warns, parser vocabularies |
| [`src/domain/`](./src/domain/CLAUDE.md) | Comparison semantics, snapshots, forecast/velocity maths, star-history |
| [`src/i18n/`](./src/i18n/CLAUDE.md) | Bundles, placeholder rules, adding a locale |
| [`src/infrastructure/`](./src/infrastructure/CLAUDE.md) | The four adapters: octokit, git worktree, persistence, SMTP |
| [`src/presentation/`](./src/presentation/CLAUDE.md) | Renderers, the chart quartet, escaping and injection rules |
| [`src/shared/`](./src/shared/CLAUDE.md) | `errorMessage`, the fixture factories, and why this folder stays almost empty |

## Conventions

- **Cross-layer imports use the alias; same-layer imports stay relative.** `@domain/snapshot` from
  `presentation`, `./snapshot` from inside `domain`. Mixed forms of the same module break Biome's import
  sorting and duplicate it in the bundle. "Same layer" means all of [`src/infrastructure`](./src/infrastructure), not one adapter.
- **One argument is positional; two or more are one object, typed `<FunctionName>Params`.**
  `coveredStars(totalStars)`, `describeFetchError(error)`; `makeRepoInfo({ name, stars }): MakeRepoInfoParams`,
  `repoStargazers({ fullName, dates, sampled }): RepoStargazersParams`. The interface is named after the
  function, not after the concept, so a reader landing on the type knows what takes it. A comparator handed
  to `sort` is the exception: it is called back positionally, so `alphabetically` keeps its two arguments.
  `docs/docs-consistency.test.ts` asserts the rule over the whole of `src`, with no exemption: the fixture
  factories in [`src/shared/tests`](./src/shared/tests) and the co-located test helpers used to be excused, which is exactly where
  the rule had drifted, and a fixture is the code a reader copies from.
- **No explanatory comments in `.ts` files**, without exception; the tree contains none. These `CLAUDE.md`
  files carry the explanation instead. If something needs explaining it goes in the folder's *Invariants* or
  *Gotchas* section, not above the line.
- **`domain`, `presentation` and `i18n` must stay pure.** No `@actions/*`, no `node:*`, no network, no fs, and
  no clock beyond an injectable `now`. Rendering returns strings; writing files is `application`'s job. The
  impure layers each own a different side effect: `config` reads the action inputs and the YAML file
  (`node:fs`), `infrastructure` owns everything outbound, and `application` writes the Action log and the
  outputs. `infrastructure` is the only layer that reaches the network, not the only one that does I/O.
- **A primitive earns a type only when it crosses a boundary.** Ask, in order: is the illegal state
  reachable, does anything read it, does it leave the layer. Three noes mean writing the rule down instead,
  in the folder's guide, in `CONTEXT.md` or in `docs/docs-consistency.test.ts`, and a named divergence is
  finished work rather than a debt. [ADR 0022](./docs/adr/0022-a-concept-earns-a-type-when-it-crosses-a-boundary.md)
  carries the criterion and seven worked cases from this tree, including the ones it decided **not** to
  model. Say in the commit message which answer applied, because "this is a guard" tells the next reader the
  test constructs an unreachable state on purpose.
- **Conventional commits** (commitlint + husky). semantic-release owns versioning. Do NOT add a
  Co-Authored-By / Claude trailer to commits or PRs.

## Maintenance contract

These documents are not generated. A change that does not update them leaves the tree describing code that
no longer exists, so when you change code, update the docs **in the same commit**: a follow-up commit is a
promise, not a fix.

`docs/docs-consistency.test.ts` makes the mechanical half of that contract executable. It reads every
document and asserts the checkable claims against the repo: no dead markdown links, no citation of a source
or test file that does not exist, no sample chart in [`examples/README.md`](./examples/README.md) without its SVG, every `action.yml`
input and output named on the surfaces that list them **and listed alphabetically** there, the translation-key table in
`docs/wiki/Internationalization-(i18n).md` matching [`src/i18n/en.json`](./src/i18n/en.json) section for section and key for key,
every documented `stars-data.json` example showing the `version` the writer actually stamps,
every cross-layer import in `src` allowed by the *May import* column of the layer table in `ARCHITECTURE.md`
(with same-layer imports relative, the pure layers free of `node:*` / `@actions/*` / `@octokit/*` /
`nodemailer` / `js-yaml`, and every test file that reaches past its own layer named rather than exempted),
the Node and pnpm pins above matching `package.json` and `.nvmrc`, every overridable `action.yml` input stating its real
default in prose and saying the config file can override it,
and the ADR set held to its template (sequential
numbering, `NNNN-kebab-title.md` filenames, the `# N. Title` / date / status / *Context* / *Decision* /
*Consequences* shape, a row in the [`ARCHITECTURE.md`](./ARCHITECTURE.md) index, and, the one that rots quietly, a link from
some document **other** than that index, since an ADR only the index points at will not be read). It runs
with `pnpm test:ut`, so in CI on every PR. A failure means the docs and the code disagree; fix whichever is
wrong. It cannot check prose or rationale; that part is still on you. Keep its assertions **aggregated**
(one failing list per rule) rather than `it.each` per document.

| If you change | Update |
| --- | --- |
| What a domain word means, or introduce a new one | [`CONTEXT.md`](./CONTEXT.md), the glossary: vocabulary only |
| A behaviour a doc states as an invariant or a gotcha | that bullet, or delete it if it stopped being true |
| A layer's rules, or the files a concept is made of | that layer's nested `CLAUDE.md` (table above) |
| A default, an input name, or an output | `action.yml`, [`docs/wiki/Configuration.md`](./docs/wiki/Configuration.md), [`docs/wiki/API-Reference.md`](./docs/wiki/API-Reference.md), the README table, [`docs/wiki/Viewing-Reports.md`](./docs/wiki/Viewing-Reports.md), and the *Outputs* section of [`src/application/CLAUDE.md`](./src/application/CLAUDE.md), always **alphabetically** and never appended at the end (`github-token` stays pinned first) |
| A package script, a path alias, or a layer boundary | the *Commands* / *Structure & aliases* sections here |
| The run order, the layer map, or the build pipeline | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| A decision an ADR records | that ADR: amend it, or supersede it with a new one and say so in both `## Status` blocks |

Propose an ADR in [`docs/adr/`](./docs/adr/) when a decision is **hard to reverse**, **surprising without
context** and **the result of a real trade-off**. All three, or it is not an ADR. Copy
[ADR 0000](./docs/adr/0000-adr-template.md), the template, number it one above the highest existing file,
add it to the index in `ARCHITECTURE.md`, and link it from wherever it bites: a gotcha here, a nested
guide, a wiki page. Both the template shape and the incoming contextual link are asserted.

Two traps worth naming, because both have already happened here: deleting a resolved entry from a "known
inconsistencies" list is part of the fix, not tidying to do later; and a `file.ts:123` citation silently rots
the moment anything above it moves, so prefer naming the symbol.

## Gotchas

- **`dist/index.js` is committed** and is what `action.yml` (`runs.main`) executes, because GitHub runs a JS
  action straight from the repository with no install step ([ADR 0003](./docs/adr/0003-commit-the-bundled-dist-directory.md)).
  What keeps a released version's bundle honest is that the `release` job in `ci.yml` runs `pnpm build` in its
  own checkout immediately before `semantic-release`, which commits `dist/` as a release asset, not any pull-request check.
  Between releases `main` can still carry a bundle behind its sources, since a `refactor` or `chore` commit
  cuts no release; that is what committing your rebuild alongside the source is for.
- **Defaults live in [`src/config/defaults.ts`](./src/config/defaults.ts), not in `action.yml`.** Overridable inputs deliberately carry
  an empty `default:` so the config file can win ([ADR 0020](./docs/adr/0020-overridable-inputs-declare-an-empty-default.md));
  `src/config/action-inputs.test.ts` reads the real `action.yml` and fails if you add one, and
  [`src/config/`](./src/config/CLAUDE.md) names the handful of inputs that do carry a default, and why.
- **Coverage is global at 85%** for lines/functions/branches/statements. Excluded: [`src/index.ts`](./src/index.ts),
  `src/**/{types,defaults,constants}.ts`, `src/**/*.test.ts`, `src/shared/tests/**`. Changing a constant
  therefore produces no coverage signal, but many tests assert the resulting literals, so expect failures far
  from the edit.
- **One test file can cover two modules.** Exactly one such pair is sanctioned and
  [`src/infrastructure/`](./src/infrastructure/CLAUDE.md) names it; `src/config/action-inputs.test.ts` covers
  the manifest rather than a module. [`client.ts`](./src/infrastructure/github/client.ts) is the sole module with no colocated test, so anything else
  missing one is drift, not a convention.
- **Biome allows no suppressions.** Fix the root cause instead of `biome-ignore`. 120-col, tabs, LF,
  double quotes: Biome's defaults bar the line width, and the same config every sibling repo runs;
  [`.gitattributes`](./.gitattributes) pins `* text=auto eol=lf`. `noConsole` is an error with no allowlist: no `console`
  at any level, report through `@actions/core`.

## Build & release

`esbuild.config.ts`, run via `tsx`, bundles `src/index.ts` into the committed `dist/index.js` with a
sourcemap. Everything else (the husky hooks, semantic-release, and every workflow) is in
[ARCHITECTURE.md](./ARCHITECTURE.md).
