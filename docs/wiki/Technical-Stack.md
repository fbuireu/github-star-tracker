Technologies, design decisions, and architecture overview.

---

## Architecture

The project implements **Domain-Driven Design<sub>(ish)</sub>** with a **Functional Core, Imperative Shell** pattern. Five bounded contexts organize the codebase:

| Context | Directory | Responsibility | Purity |
|---|---|---|---|
| **Domain** | `src/domain/` | Core types, comparison, snapshots, forecasts, notifications, stargazers | Pure functions |
| **Config** | `src/config/` | Schema, defaults, parsing, loading | Mostly pure |
| **Infrastructure** | `src/infrastructure/` | GitHub API, Git operations, file I/O, email | Side effects |
| **Presentation** | `src/presentation/` | Markdown, HTML, SVG charts, badges | Pure functions |
| **Application** | `src/application/` | Orchestration (`trackStars()`) | Coordinator |

### Principles

- Dependencies flow inward only (infrastructure depends on domain, never the reverse)
- Anti-corruption layer isolates external systems (GitHub API types ≠ domain types)
- Immutable data structures (snapshot operations return new objects)
- Pure functions for all business logic
- Side effects isolated at infrastructure edges
- Named parameters for functions with 2+ arguments (destructured objects with typed interfaces)

### Path Aliases

Cross-layer imports use TypeScript path aliases for clean boundaries:

```typescript
import { loadConfig } from '@config/loader';
import { compareStars } from '@domain/comparison';
import { getRepos } from '@infrastructure/github/filters';
import { generateMarkdownReport } from '@presentation/markdown';
import { getTranslations } from '@i18n';
```

Same-layer imports stay relative (`./commands`, `../git/commands`).

Aliases are configured in `tsconfig.json` paths, resolved by `vite-tsconfig-paths` in Vitest, and mapped in `esbuild.config.ts` for the build.

---

## Technology Choices

### Language & Runtime

**TypeScript** (strict mode) on **Node.js 24+** - native GitHub Actions runtime support, first-class type safety.

### Tooling

| Tool | Purpose | Why |
|---|---|---|
| **Biome** | Linting + formatting | Single tool replaces ESLint + Prettier; significantly faster |
| **esbuild** | Bundling | 10-100x faster than alternatives; tree shaking; single-file output |
| **Vitest** | Testing | Modern, ESM-native, better DX than Jest; `vite-tsconfig-paths` integration |
| **pnpm** | Package manager | Strict dependency resolution prevents phantom dependencies |
| **Husky** | Git hooks | Pre-commit formatting and commit linting |
| **semantic-release** | Versioning & releases | Automated from conventional commits |
| **commitlint** | Commit message validation | Enforces conventional commits format |

### Dependencies

**Runtime (bundled):**

| Package | Purpose |
|---|---|
| `@actions/core` | GitHub Actions I/O (inputs, outputs, logging) |
| `@actions/github` | Octokit client for GitHub API |
| `js-yaml` | YAML config file parsing |
| `nodemailer` | SMTP email delivery |

The action ships as a single bundled `dist/index.js` with **zero runtime dependencies** for the consumer.

---

## Key Design Decisions

### Orphan Branch for Data

Historical snapshots, reports, charts, and badges are stored on an isolated orphan branch (`star-tracker-data` by default). This branch has its own Git history, completely separate from `main`.

**Benefits:**
- Main branch stays clean - no data commits polluting your project history
- Force-push independence - data branch can be reset without affecting code
- Portable - data travels with the repository

### YAML Configuration

Config files use YAML (parsed via `js-yaml`) with `snake_case` keys. YAML was chosen over JSON for readability and comment support.

### Git Worktrees

The action uses `git worktree add` to create a temporary working directory for the data branch, avoiding `git checkout` which would destroy the current working tree and disrupt concurrent operations.

### Custom i18n

A lightweight custom interpolation engine (`{placeholder}` templates) replaces heavyweight i18n libraries. At ~50 lines of code, it's ~14x smaller than alternatives while covering the requirements: 4 languages, simple key substitution.

### Nodemailer

Supports any SMTP provider without vendor lock-in. The `secure` flag is auto-detected from the port (`465` = SSL, else STARTTLS).

### Dual Chart Systems

- **SVG charts** (`src/presentation/svg-chart.ts`): Self-contained animated SVGs with CSS draw-line animations, committed to the data branch. Render natively in GitHub Markdown.
- **QuickChart URLs** (`src/presentation/chart.ts`): Chart.js configs encoded as URLs, used in HTML email reports where CSS animations aren't supported.

---

## Data & Testing

### Snapshot Retention

Configurable sliding window (default 52 snapshots). Pruning is a pure domain function - `addSnapshot()` returns a new `History` with old entries trimmed. Infrastructure handles serialization only.

### Test Coverage

- **300+ tests** across all layers
- **95%+ statement coverage** (enforced via threshold in `vitest.config.ts`)
- Coverage excludes: `src/index.ts`, type/constant/default files, test files
- Philosophy: "Mock at the boundary, not in the middle" - real code paths are exercised; only external dependencies (GitHub API, filesystem, Git) are mocked

### Security

- Minimal PAT scopes - `public_repo` sufficient for public-only tracking
- Ephemeral credential handling - tokens never logged or persisted
- No sensitive data in outputs - star counts and repo names are already public
- Stargazer data is opt-in and stores only publicly available information

---

## CI/CD

### Validation Pipeline

```
pnpm run validate
  └── pnpm run check
  │     ├── biome check .        (lint)
  │     ├── tsc --noEmit         (typecheck)
  │     └── vitest --coverage    (test + coverage)
  └── pnpm run build             (esbuild bundle)
```

### Release

[semantic-release](https://semantic-release.gitbook.io/) automates versioning from conventional commits:

- `feat:` → minor bump
- `fix:` → patch bump
- `feat!:` / `BREAKING CHANGE:` → major bump

The `v1` tag auto-updates to point to the latest `v1.x.x` release.
