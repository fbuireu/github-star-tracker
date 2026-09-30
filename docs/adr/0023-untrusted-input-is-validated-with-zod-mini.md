# 23. Untrusted input is validated with `zod/mini` schemas

Date: 2026-09-30

## Status

Accepted

## Context

Everything this action reads from outside itself arrives typed by assertion rather than by check. The Stored
History came out of `JSON.parse(contents) as T`; a stargazer page out of `data as GitHubStargazerRow[]`;
the config file out of `yaml.load(content) as Record<string, unknown>`, then narrowed to a `FileConfig` type
that claimed strings where YAML supplies numbers. Octokit's response types are generated from GitHub's
OpenAPI description and exist at compile time only.

Hand-written guards covered some of it, each where a bug had already been found: the container, the version
and the `snapshots` key of `stars-data.json`
([ADR 0021](./0021-an-unreadable-stored-history-fails-the-run.md)), the entries of `stargazers.json`, the
config parsers. Below those guards nothing looked, and every gap had a concrete failure:

- A Snapshot with no `repos` was read as a Baseline holding no Repositories. The Run reported every Star as
  new and pushed, which is the outcome ADR 0021 exists to prevent, one level further down than its guards
  reached. A star count written as a string was compared as a number and silently miscounted.
- `data_branch: 2026` in `star-tracker.yml` failed the Run with `TypeError: value is not iterable`, and
  `chart_custom_milestones: 1000` with `value.trim is not a function`.
- A stargazer row with a `null` user, which GitHub's own schema allows, failed its page with
  `Cannot read properties of null`.

The alternatives were to keep writing guards by hand, one per bug, or to take a schema library. The action
ships as one committed bundle ([ADR 0003](./0003-commit-the-bundled-dist-directory.md)), so a dependency
costs every consumer bytes on every run, and the tree has turned down dependencies on that ground before (the
i18n engine, the chart renderer). What made it worth measuring is that a schema states the shape once, next
to the reader, and the same statement produces both the check and the TypeScript type.

The library is `zod` 4.6.5, and the real choice was between its two builds. Measured by building this tree's
`dist/index.js` with `esbuild.config.ts` (not minified, gzip at level 9), against 1,695,369 bytes raw and
355,205 gzipped before the change:

| Build | Raw | Gzipped |
| --- | --- | --- |
| `zod/mini` | +83,154 (+4.9%) | +17,179 (+4.8%) |
| full `zod` | +197,747 (+11.7%) | +39,307 (+11.1%) |

Full `zod` buys two things this tree does not use: method chaining (`z.number().optional()` rather than
`z.optional(z.number())`) and a bundled English locale for its error messages. Every message a user sees here
is written by this action, because ADR 0021 makes the remediation text part of the decision, so the locale
would ship unread.

## Decision

**Every value that crosses into the action from outside is checked by a `zod/mini` schema before it is
trusted, and nothing imports `zod` itself.** The schemas live beside the code that reads the value, never in
`@domain` (which may import `@i18n` only):

- `@infrastructure/persistence/storage`: `StoredHistorySchema` for `stars-data.json`, fatal on any issue with
  one message per guard; `StargazerFileSchema` and `LoginListSchema` for `stargazers.json`, which repairs.
- `@infrastructure/github`: `GitHubRepoSchema` and `GitHubStargazerRowSchema` in `types.ts`, from which
  `GitHubRepo` is inferred; `describeFetchError` reads `status` and `message` through a schema.
- `@infrastructure/notification/email`: `PortSchema` for `smtp-port` and `RecipientListSchema` for
  nodemailer's rejected list.
- `@config`: the validating parsers in `parsers.ts`, and `VisibilitySchema`, `DataBranchSchema`, the
  per-row enum schema and `ConfigFileSchema` in `loader.ts`.
- `@application/tracker`: `ApiUrlSchema` for `github-api-url` / `GITHUB_API_URL`.
- `@shared/errors`: `errorMessage`, plus `describeIssue`, which renders an issue's path and found value the
  same way for every caller that shows one.

`z.validate` is used where a yes/no is all the caller needs (the stargazer repair, the config file's top
level, the API URL); `safeParse` where the caller needs the parsed output or the issue for its message.
Parsers keep their behaviour: the schema replaces the check, not the policy of what warns, what falls back
and what throws.

Rejected: full `zod`, for the numbers above. Rejected: schemas for values TypeScript already proves
(`Object.keys(LOCALE_MAP) as Locale[]`, the field-table casts in `loader.ts`), for `RUNNER_TEMP` (a string or
nothing, with a fallback, so there is nothing to check), and for the list parsers, which split and
de-duplicate rather than validate.

## Consequences

- The bundle grows by the `zod/mini` row above on every release. Importing `zod` instead of `zod/mini`
  anywhere, even once, pulls in the classic build and costs the difference between the two rows. Nothing
  enforces that except review and this record.
- A malformed Stored History now fails the Run at any depth, not only at its top level. That is ADR 0021's
  accepted cost applied further down: a hand-edited file blocks every later Run until it is fixed, and the
  message names the exact path to fix.
- The schemas check types, not ranges or formats, wherever a stricter check would change what the action
  already accepts. A Snapshot `timestamp` is any string because
  [ADR 0017](./0017-velocity-and-forecast-read-unparseable-timestamps-differently.md) decides what an
  unparseable one means; stored objects are loose, so a key the schema does not name survives a round trip.
- A required field added to `Snapshot` or `SnapshotRepo` without its schema key is a type error in
  `readHistory`, whose return type is `History`. The reverse is not caught: a schema key the type lacks passes
  silently. `DATA_FORMAT_VERSION` still has to be bumped by hand.
- Where this bites is recorded in the persistence, `github/` and `notification/` sections of
  [`src/infrastructure/AGENTS.md`](../../src/infrastructure/AGENTS.md), in
  [`src/config/AGENTS.md`](../../src/config/AGENTS.md), and for users in
  [`docs/wiki/Troubleshooting.md`](../wiki/Troubleshooting.md).
