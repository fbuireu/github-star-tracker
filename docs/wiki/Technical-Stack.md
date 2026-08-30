Why GitHub Star Tracker is built out of these tools and these five dependencies, and what each one buys.

For the shape of the code itself, read **[Architecture](Architecture)** for the layering and **[How It Works](How-It-Works)** for a run end to end, with [`ARCHITECTURE.md`](https://github.com/fbuireu/github-star-tracker/blob/main/ARCHITECTURE.md) in the repository as the normative version of both. This page does not restate them.

---

## Architecture in Three Sentences

The codebase is a Functional Core, Imperative Shell split across seven layers: `domain`, `presentation` and `i18n` are pure, `config`, `infrastructure` and `application` own the side effects, and `shared` holds cross-cutting test fixtures. Dependencies flow inward only, cross-layer imports go through a TypeScript path alias declared once in [`tsconfig.json`](https://github.com/fbuireu/github-star-tracker/blob/main/tsconfig.json), and every function taking two or more arguments takes a single destructured object instead.

That shape is **Domain-Driven Design<sub>(ish)</sub>**, and the parenthesis is load-bearing: what is adopted is the ubiquitous language and the layer boundaries, not the tactical pattern catalogue. **[Architecture](Architecture)** says which patterns were dropped and why. The normative version of all of it is `ARCHITECTURE.md` and the per-layer `CLAUDE.md` files in the repository.

---

## Language & Runtime

**TypeScript 7**, bundled by esbuild into a single committed [`dist/index.js`](https://github.com/fbuireu/github-star-tracker/blob/main/dist/index.js).

There are two Node versions in play, deliberately, and they are different numbers:

| Number | Where it is pinned | What it governs |
|---|---|---|
| **Node 24** | `runs.using: 'node24'` in [`action.yml`](https://github.com/fbuireu/github-star-tracker/blob/main/action.yml), and `target: 'node24'` in [`esbuild.config.ts`](https://github.com/fbuireu/github-star-tracker/blob/main/esbuild.config.ts) | The runtime that actually executes the action on a GitHub runner. This is the version a `node:` API has to exist in |
| **Node 26.2.0** | `engines.node` in [`package.json`](https://github.com/fbuireu/github-star-tracker/blob/main/package.json) | The development pin: what contributors install, and what `@types/node` describes |

The gap is a trap worth knowing about before you contribute. esbuild's `target` lowers syntax but does not shim runtime APIs, so a `node:` API added after 24.x will type-check, bundle and pass the full local check, then throw on a runner. Check new `node:` usage against Node 24, not against `engines.node`.

`tsconfig.json` targets ES2022 with `moduleResolution: bundler`, plus `isolatedModules` and `verbatimModuleSyntax`, so every file transpiles standalone and import elision stays explicit. Strict type-checking is on by default in the pinned TypeScript version, so the config no longer declares it.

---

## Tooling

| Tool | Purpose | Why |
|---|---|---|
| **Biome** | Linting + formatting | One tool replaces ESLint + Prettier, with one config and one pass over the tree |
| **esbuild** | Bundling | Tree shaking and single-file output, fast enough to run on every `pre-push` hook without anyone noticing |
| **Vitest** | Testing | ESM-native, and it resolves the `tsconfig.json` path aliases natively, so the test config needs no plugin and cannot drift from the build |
| **pnpm** | Package manager | Strict dependency resolution prevents phantom dependencies from reaching the bundle |
| **Husky** | Git hooks | Formatting and commit linting before the mistake reaches CI |
| **semantic-release** | Versioning & releases | Version numbers derived from conventional commits, never hand-edited |
| **commitlint** | Commit message validation | Makes the conventional-commit format the release process depends on non-optional |

---

## Dependencies

Five runtime packages, all bundled into `dist/index.js`:

| Package | Purpose |
|---|---|
| `@actions/core` | GitHub Actions I/O (inputs, outputs, logging) |
| `@actions/github` | Octokit client for the GitHub API |
| `@octokit/plugin-retry` | Automatic retries for transient GitHub API failures |
| `js-yaml` | YAML config file parsing |
| `nodemailer` | SMTP email delivery |

Because the bundle carries them, the action installs nothing at run time: GitHub executes `dist/index.js` straight from the repository, and the consumer has **zero runtime dependencies** to audit or resolve.

---

## Design Decisions Behind Those Choices

The full reasoning, alternatives and costs of the larger decisions are recorded as [architecture decision records](https://github.com/fbuireu/github-star-tracker/tree/main/docs/adr) in the repository. The short version of the four that shape the dependency list:

### YAML for the config file, not JSON

Config files are parsed with `js-yaml` and use `snake_case` keys. YAML was chosen over JSON because a tracking config is something a human edits by hand: it wants comments next to the values they explain, and it wants lists without trailing-comma accidents.

### `git worktree`, not `git checkout`

The action creates a temporary working directory for the data branch with `git worktree add`. A `git checkout` would swap the branch under the job's existing working tree, destroying whatever the workflow had checked out and breaking any step that runs alongside it. A worktree leaves the original tree untouched.

### A custom i18n engine, not a library

[`src/i18n/index.ts`](https://github.com/fbuireu/github-star-tracker/blob/main/src/i18n/index.ts) is roughly 30 lines: a bundle lookup plus a `{placeholder}` interpolation function. That covers the whole requirement (four languages, flat key substitution, no plurals or dates), and it means one fewer dependency inside a bundle that ships to every consumer.

### Nodemailer, with `secure` inferred from the port

Nodemailer talks to any SMTP provider, so nobody is locked into a transactional-email vendor. The `secure` flag is derived from `smtp-port` rather than asked for separately (`465` means implicit TLS, anything else means STARTTLS), because the two are never independently chosen in practice and one fewer input is one fewer way to misconfigure a mailer.

---

## Testing

- Coverage floor of 85% for lines, functions, branches and statements, enforced by the threshold in [`vitest.config.ts`](https://github.com/fbuireu/github-star-tracker/blob/main/vitest.config.ts). The build fails below it
- Coverage excludes [`src/index.ts`](https://github.com/fbuireu/github-star-tracker/blob/main/src/index.ts), type/constant/default files, test files, and the shared test helpers in [`src/shared/tests/`](https://github.com/fbuireu/github-star-tracker/blob/main/src/shared/tests)
- Tests are colocated next to the module they cover, as `src/**/*.test.ts`
- Philosophy: mock at the boundary, not in the middle. Real code paths are exercised, and only external dependencies (the GitHub API, the filesystem, Git, SMTP) are replaced

---

## Security

- Minimal PAT scopes: `public_repo` is sufficient for public-only tracking
- Ephemeral credential handling: the token is passed to `git` as a per-command header and registered as a secret, never logged or persisted
- No sensitive data in outputs: star counts and repository names are already public
- Stargazer data is opt-in, and stores only publicly available information
