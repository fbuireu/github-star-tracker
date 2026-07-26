# src/infrastructure — the only layer allowed to perform I/O

Everything that touches the outside world lives here: the GitHub REST API (octokit), the `git` CLI, the
filesystem, and SMTP. It is a set of adapters, not a framework — the only cross-folder dependency is
`persistence/storage.ts` importing `../git/commands`, and none of them decide *when* work happens. It
holds no business logic: comparison, forecasting,
snapshot pruning and star-history reconstruction all live in `@domain/*`, and every string a user reads is
built in `@presentation/*`.

## Sub-folders
| Folder | Responsibility | Side effects |
| --- | --- | --- |
| [`github/`](./github/CLAUDE.md) | Repository discovery, filtering and stargazer fetching over the GitHub REST API | Network (octokit) |
| [`git/`](./git/CLAUDE.md) | `git` CLI wrapper and the data-branch worktree lifecycle | `child_process`, filesystem |
| [`persistence/`](./persistence/CLAUDE.md) | Reads/writes history, stargazer maps, reports, badges and charts inside the worktree; commits and pushes | Filesystem, `git` (via `git/commands`) |
| [`notification/`](./notification/CLAUDE.md) | SMTP config resolution from action inputs and sending the HTML digest | `@actions/core` inputs, nodemailer/SMTP |

## Boundary rule
The layer table, the allowed import directions and the repo-wide conventions (aliases across layers,
relative imports within a layer, named params for 2+ arguments, no explanatory comments in `.ts` sources)
are defined once in [`../CLAUDE.md`](../CLAUDE.md) and are not repeated here. What is specific to this
layer:

- `@application/tracker` is the only consumer. It is the composition root: it builds the `Octokit`
  instance, calls the adapters in order, and hands their results to domain/presentation.
  Current import surface (`src/application/tracker.ts:13-28`):
  `cleanup`, `initializeDataBranch` · `getRepos` · `fetchAllStargazers` · `getEmailConfig`, `sendEmail` ·
  `commitAndPush`, `readHistory`, `readStargazers`, `writeBadge`, `writeChart`, `writeCsv`,
  `writeHistory`, `writeHtmlReport`, `writeReport`, `writeStargazers`.
- "Same layer" here means all of `src/infrastructure`, not one sub-folder: `persistence/storage.ts`
  imports `../git/commands` relatively, exactly like `github/filters.ts` imports `./client`.
- Single-argument adapters keep a positional parameter (`readHistory(dataDir)`, `cleanup(dataDir)`,
  `getEmailConfig(locale)`, `mapRepos(repos)`) — the named-params rule starts at two arguments.

## Failure policy
- Fatal for the run: repository fetching (`github/client.ts`) and worktree setup (`git/worktree.ts`) throw
  wrapped `Error`s with remediation text; `trackStars` lets them fail the action.
- Degradable: per-repo stargazer failures are swallowed inside `github/stargazers.ts` and downgraded to
  `core.warning`, so the run continues with partial data. `sendEmail` still rejects on SMTP failure, but
  `trackStars` wraps the call in a try/catch and warns (`src/application/tracker.ts:235-239`).

## Testing
Every sub-folder has colocated `*.test.ts`. Run the whole layer with `pnpm vitest run src/infrastructure`.
Coverage includes this layer except `**/types.ts` (see `vitest.config.ts`).
