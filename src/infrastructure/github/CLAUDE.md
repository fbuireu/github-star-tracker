# src/infrastructure/github — GitHub REST adapter: repo discovery, filtering, stargazer fetching

Everything that talks to the GitHub REST API. It lists the token owner's repositories, applies the
config's include/exclude rules, maps the raw API shape onto `RepoInfo`, and pages through
`/repos/{owner}/{repo}/stargazers` to collect `Stargazer` records with timestamps. It does **not**
construct the `Octokit` client (that happens in `@application/tracker`), does not persist anything, does
not compute deltas or star history, and renders nothing.

The token it is handed is always a user-supplied PAT, never the injected `GITHUB_TOKEN`, and the *role*
that token carries decides whether the stargazer endpoint answers at all —
[ADR 0002](../../../docs/adr/0002-require-a-personal-access-token.md).

## Files
| File | Responsibility |
| --- | --- |
| `client.ts` | Paginated `repos.listForAuthenticatedUser` fetch; translates the visibility config into API params |
| `filters.ts` | Include/exclude filtering (org, repo, fork, archived, min-stars), mapping to `RepoInfo`, and the `getRepos` façade |
| `stargazers.ts` | Stargazer pagination, smart sampling, per-page/per-repo failure handling, unreconstructable-history warnings |
| `errors.ts` | `describeFetchError` — turns any thrown value into a non-empty human string |
| `types.ts` | `Octokit`, `GitHubRepo`, `GitHubStargazerRow` structural types |

## Public API

### `filters.ts`
```ts
async function getRepos({ octokit, config }: GetReposParams): Promise<RepoInfo[]>
```
The only entry point the application layer uses for repositories. Fetch → filter → map, in that order.

```ts
function filterRepos({ repos, config }: FilterReposParams): GitHubRepo[]
function mapRepos(repos: GitHubRepo[]): RepoInfo[]
```
Both are exported for direct unit testing and are not imported outside this folder.

### `stargazers.ts`
```ts
async function fetchAllStargazers({ octokit, repos, config }: FetchAllStargazersParams): Promise<RepoStargazers[]>
```
Called by `@application/tracker` when `config.includeCharts || config.trackStargazers`. Never rejects for
a single bad repo — see invariants. All other functions in the file (`fetchRepoStargazers`,
`fetchSampledStargazers`, `fetchStargazerPage`, `selectSampledPages`,
`warnWhenHistoryIsUnreconstructable`) are module-private.

### `client.ts`
```ts
async function fetchRepos({ octokit, config }: FetchReposParams): Promise<GitHubRepo[]>
```
Used by `filters.getRepos` and by tests only.

### `errors.ts`
```ts
function describeFetchError(error: unknown): string
```
Used by `client.ts` and `stargazers.ts` whenever an API failure is turned into a message.

## Key types
`types.ts` — deliberately minimal structural types, not the full octokit response schemas:

| Type | Shape |
| --- | --- |
| `Octokit` | `InstanceType<typeof GitHub>` from `@actions/github/lib/utils` |
| `GitHubRepo` | `name`, `full_name`, `owner.login`, `private`, `archived`, `fork`, `stargazers_count` |
| `GitHubStargazerRow` | `user: { login, avatar_url, html_url }`, `starred_at: string` |

Outputs are domain types, not API types: `RepoInfo` (`@domain/types`) and `RepoStargazers` / `Stargazer`
(`@domain/stargazers`).

## Octokit construction (outside this folder)
`src/application/tracker.ts:55-56`:
```ts
const apiUrl = core.getInput('github-api-url') || process.env.GITHUB_API_URL || '';
const octokit = github.getOctokit(token, apiUrl ? { baseUrl: apiUrl } : undefined, retry);
```
- `retry` is `@octokit/plugin-retry`, passed as an octokit plugin. Transient failures and secondary
  rate-limit responses are retried *inside* octokit; the code in this folder only ever sees the final
  failure, so its own error handling is "give up on this page/repo", never "retry".
- GHES: `github-api-url` input wins over the `GITHUB_API_URL` env var (auto-set on GHES runners). When
  both are empty no `baseUrl` is passed at all — `getOctokit(token, undefined, retry)` — so github.com
  defaults apply.
- `github-token` must be a PAT with `repo`/`public_repo`; `GITHUB_TOKEN` cannot list repos across owners
  (see `action.yml`).

## Repository discovery and filtering

Order of operations in `filterRepos` — the sequence is part of the contract:

1. `onlyOrgs` (if non-empty) narrows the candidate set by `repo.owner.login`.
2. `onlyRepos` (if non-empty) **short-circuits**: it returns the org-narrowed candidates whose `repo.name`
   matches, and skips steps 3-7 entirely.
3. `includeArchived === false` drops `repo.archived`.
4. `includeForks === false` drops `repo.fork`.
5. `excludeRepos` drops matches on `repo.name`.
6. `excludeOrgs` drops matches on `repo.owner.login`.
7. `minStars > 0` drops `repo.stargazers_count < minStars`.

Pattern matching (`matchesPattern`, `filters.ts:14`) accepts either an exact string or a
`/body/flags` literal parsed by `/^\/(.+)\/([gimsuy]*)$/`.

`fetchRepos` visibility mapping comes from `VISIBILITY_CONFIG` in `@config/defaults`:

| `config.visibility` | API params |
| --- | --- |
| `public` / `private` / `all` | `{ visibility: <value> }` |
| `owned` | `{ visibility: 'all', affiliation: 'owner' }` |

## Stargazer fetching

- Media type: every page request sends `headers: { accept: 'application/vnd.github.star+json' }`
  (`stargazers.ts:99-101`). Without it GitHub returns bare user objects with **no `starred_at`**, and the
  whole star-history reconstruction silently degrades. Do not drop or rename this header.
- Page size 100 (`STARGAZERS_PER_PAGE`). `MAX_REACHABLE_PAGE = floor(MAX_REACHABLE_STARGAZERS / 100) = 400`,
  because GitHub only pages through the oldest 40,000 stargazers of a repo.
- Full fetch (`fetchRepoStargazers`): pages 1..400, stops early when a page returns fewer than 100 rows.
- Sampled fetch (`fetchSampledStargazers`), used when
  `config.smartSampling && repo.stars > config.smartSamplingThreshold`. A repo fetched this way is flagged
  `sampled`, which costs it New Stargazer detection downstream
  ([ADR 0008](../../../docs/adr/0008-sampled-repositories-are-excluded-from-stargazer-diffing.md)):
  `totalPages = min(400, max(1, ceil(totalStars / 100)))`, then `selectSampledPages` picks evenly spaced
  page numbers `1 + round(i * (totalPages - 1) / (pages - 1))` for `i` in `[0, pages)`, de-duplicated via a
  `Set` and sorted ascending. It always includes page 1 and page `totalPages`.

## Invariants & rules

**Filtering**
- `filterRepos` never mutates its input; every step produces a new array via `filter`, and repo objects are
  passed through by reference.
- All four list filters (`onlyRepos`, `onlyOrgs`, `excludeOrgs`, `excludeRepos`) go through
  `matchesPattern`, so each accepts an exact name or a `/body/flags` literal. Exact-name matching is
  **case-sensitive**; regex patterns honour their own flags, so `/^my/i` matches case-insensitively
  (`filters.test.ts`).
- `onlyRepos` overrides archived/fork/exclude/min-stars, but **not** `onlyOrgs`: a repo excluded by
  `onlyOrgs` can never be brought back by `onlyRepos` (`filters.test.ts`).
- Matching is on the short `repo.name`, not `full_name`; org matching is on `owner.login`. A repo with the
  same name in two orgs matches both unless `onlyOrgs`/`excludeOrgs` disambiguates.
- A fresh `RegExp` is constructed per pattern per candidate, so a `g` flag never leaves stale `lastIndex`
  state between `.test()` calls.

**Repo pagination**
- `fetchRepos` requests `sort: 'full_name'`, so downstream ordering of `RepoInfo[]` is GitHub's ascending
  full-name order. Anything relying on stable report ordering depends on this.
- The loop stops on an empty page *or* on any page shorter than 100. A page of exactly 100 always triggers
  one more request (`filters.test.ts`).
- Any failure aborts the whole fetch and throws
  `Failed to fetch repositories from GitHub API: <describeFetchError>. Verify that your github-token has the correct permissions.`
  There is no partial-repo-list mode. Callers treat this as fatal.

**Stargazers**
- `fetchAllStargazers` returns exactly one `RepoStargazers` entry per input repo, in input order, even when
  the fetch failed (`{ stargazers: [], sampled }`). Downstream code may assume 1:1 alignment.
- `coveredStars` is `undefined` when the fetch completed cleanly; it is only set when coverage was cut
  short, and it is the meaningful signal for `@domain/star-history` that the tail must be ramped:
  - full fetch interrupted mid-pagination → `coveredStars = stargazers.length`;
  - sampled fetch with some failed pages → `coveredStars = min(lastPageThatReturnedRows * 100, totalStars)`
    (`stargazers.ts:201,217`; `stargazers.test.ts:144` pins 1300). A page that succeeds but comes back
    empty does not advance that counter.
- Partial-failure semantics differ between the two paths:
  - full fetch: page 1 failing rethrows; a later page failing keeps what was fetched and warns
    "Stopped fetching stargazers for … at page N";
  - sampled fetch: it attempts **all** selected pages regardless of failures, then rethrows the first error
    only if nothing at all was collected (`stargazers.ts:209` tests `stargazers.length === 0`, not "every
    page failed"); otherwise it warns "Skipped X/Y sampled stargazer pages …" and keeps the rest.
- A rethrown error is caught by the outer loop, which warns
  `Failed to fetch stargazers for <fullName>: <describeFetchError>` and continues with the next repo. One
  bad repo never fails the run.
- `sampled` is `shouldSample`, decided *before* the request — it stays `true` on failure and stays `false`
  for a repo whose stars are at or below the threshold (`>` is strict; 1500 stars with threshold 1500 is
  not sampled).
- `selectSampledPages` returns *at most* `maxPages` pages; deduplication can yield fewer. When
  `totalPages <= maxPages` it returns every page `1..totalPages` (so `smartSampling` can be on and still
  fetch everything, with `sampled: true`). `maxPages <= 0` is clamped to 1; `maxPages === 1` returns `[1]`.
- Sampled pages are fetched even if an earlier one came back short — unlike the full fetch, there is no
  early break, so gaps in the page sequence are expected and intentional.
- `warnWhenHistoryIsUnreconstructable` runs only on the success path and only for `repo.stars > 0`. It
  warns once for an empty stargazer list, and once when **no** row has a parseable `starred_at`
  (`Number.isFinite(Date.parse(...))`). A single valid date suppresses the warning.
- `starredAt` is passed through verbatim as the raw ISO-8601 UTC string from the API. This folder never
  parses, normalizes or timezone-shifts it — that is `@domain/star-history`'s job.

**Errors**
- `describeFetchError` never returns an empty string and never throws: `HTTP <status> <message>`, falling
  back to status alone, message alone, or `String(error)`. `new Error('')` → `"Error"`, `null` → `"null"`,
  `{}` → `"[object Object]"` (`errors.test.ts`). Log assertions in tests depend on this exact shape.

## Dependencies
Allowed: `@actions/core` (logging only), `@actions/github` types, `@config/defaults`, `@config/types`,
`@domain/constants`, `@domain/stargazers`, `@domain/types`, and relative same-folder imports.

Never import `@presentation/*` or `@application/*` — this folder is a leaf adapter and importing upward
would create a cycle. Do not import `@config/loader`: config arrives as a parameter, this folder never
reads action inputs. Do not import `node:fs` or `../persistence/*`; fetching and persisting stay separate.

## Gotchas
- **`filters.test.ts` also covers `client.ts`.** It is the spec for both modules, so a change to
  `client.ts` that breaks nothing in `client`-named tests may still fail here.
- **`GitHubRepo` is a hand-written structural subset**, not octokit's generated type. Reading a new field
  (e.g. `description`, `pushed_at`) means adding it here first, and the tests' `makeRepo` factory builds
  the same shape.
- **An invalid regex is skipped, not fatal.** `@config/*` does no `RegExp` validation, so a malformed
  `/[/` reaches `matchesPattern`, which catches the `SyntaxError`, warns `Ignoring invalid pattern "…"`
  and treats that one pattern as non-matching. The run continues with the remaining patterns.
- **`REGEX_PATTERN`'s body group is greedy** (`/^\/(.+)\/([gimsuy]*)$/`), so `/a/b/` is parsed as the body
  `a/b` with no flags rather than as `a` with an invalid flag.
- **A plain string in `exclude-orgs` that happens to start and end with `/`** is treated as a regex, never
  as a literal name.
- **The `accept: application/vnd.github.star+json` header is load-bearing** and is set per-request, not on
  the client. Any new stargazer request must set it too.
- **`fetchAllStargazers` is sequential** — a `for…of` over repos, and a sequential loop over pages. That is
  deliberate: parallelizing would blow through the secondary rate limit that `@octokit/plugin-retry` is
  there to absorb.
- **Sampling costs are per repo**: a 50,000-star repo with sampling off issues the full 400 requests
  (`stargazers.test.ts:375`). `smart-sampling` exists to bound that.

## Testing
| Test file | Covers |
| --- | --- |
| `filters.test.ts` | `filterRepos` ordering/override rules, regex + flags, case sensitivity, `mapRepos` shape, `fetchRepos` pagination and visibility params, error message text, `getRepos` end-to-end |
| `stargazers.test.ts` | Pagination, per-repo error isolation, mid-pagination and sampled partial failures, `coveredStars` values, the 400-page reachable cap, sampled page selection, the two unreconstructable-history warnings |
| `errors.test.ts` | Every `describeFetchError` fallback branch |

`filters.test.ts` and `stargazers.test.ts` mock `@actions/core` and cast a hand-rolled object to `Octokit`;
there is no HTTP in the tests. `errors.test.ts` is a plain unit test with no mocks. Fixtures come from
`@shared/testing` (`makeConfig`, `makeRepoInfo`).

Run just this folder: `pnpm vitest run src/infrastructure/github`.
`types.ts` is excluded from coverage by `vitest.config.ts`.
