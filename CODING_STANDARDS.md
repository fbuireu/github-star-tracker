# Coding standards

What a review checks a diff against. The words are the ones [GLOSSARY.md](./GLOSSARY.md) defines, the reasons are in
[docs/adr/](./docs/adr/), and what an implementer needs while working is in the `AGENTS.md` guides.

**hard** marks a rule whose breach is a defect: report it with the rule. **judgement** marks a call the reviewer
weighs against the diff: report it as a question. A rule here outranks the smell baseline; where it endorses
something a smell would flag, the case is listed under *Deliberate overrides of the smell baseline* at the end.

Every rule carries an id, and a finding cites it with this file: `CODING_STANDARDS.md A3`. An id is never reused, so a
retired rule leaves a gap in its section's numbering. A rule marked *check pending* is mechanical, and it leaves this
body in the commit that lands its check. The process around a change (commit types, the pull request title) is
[CONTRIBUTING.md](./.github/CONTRIBUTING.md)'s.

## Tooling already enforces

No rule below restates these, and a diff that breaks one fails CI:

- Biome ([`biome.json`](./biome.json)): formatting, import order and lint, `noConsole` included, and every object shape
  declared an `interface`, never a `type` alias of an object literal (`useConsistentTypeDefinitions`).
- `pnpm typecheck`: type-only imports (`verbatimModuleSyntax`), and a tabled `Config` key without its
  `FIELD_SOURCES` row (the `TabledKey` mapped type in `src/config/loader.ts`).
- The test suite: empty defaults on overridable inputs (`action-inputs.test.ts`), every bundle carrying exactly
  the keys of `en.json` (`src/i18n/index.test.ts`), no phrase of the English bundle in a Run rendered in another
  Locale (`src/presentation/run.test.ts`), and the coverage floor (`vitest.config.mts`).
- commitlint: the commit format, on the commit and on the pull request title.
- `pnpm test:docs` ([`docs/docs-consistency.test.ts`](./docs/docs-consistency.test.ts)), which holds every document
  to the claims it can check and holds the source to these:
  - no comment in hand-written source (the TypeScript in `src` and `docs` and the root configs), doc comments and
    suppressions included;
  - which layer may import which, cross-layer imports through the alias and same-layer imports relative, tests
    included, and the pure layers free of the shell's packages (the layer table in
    [ARCHITECTURE.md](./ARCHITECTURE.md));
  - one argument passed positionally and two or more as one object: no function with two or more positional
    parameters, and no `*Params` type or inline parameter type with a single field of its own; a destructured
    parameter typed `<FunctionName>Params`, a type several functions share (`RenderReportParams`, `ReportParams`)
    or the record it unpacks, never an inline type; and no other `*Params` type exported;
  - a production reader for every runtime export, bar the values `action-inputs.test.ts` compares against
    `action.yml`, and for every key of `en.json`, read by name or through its section's index, since an unread key is
    still translated and reviewed in every Locale;
  - a colocated test for every module but `types.ts`, `defaults.ts`, `constants.ts`, `src/index.ts` and
    `src/shared/tests`, with `filters.test.ts` covering `client.ts`; the fixture factories imported by tests only,
    and free of assertions, mocks and setup;
  - no test writing the process environment; every `vi.stubGlobal`, `vi.stubEnv`, `vi.spyOn` and
    `vi.useFakeTimers` in a test file undone by `vi.unstubAllGlobals()`, `vi.unstubAllEnvs()`,
    `vi.restoreAllMocks()` or the spy's `mockRestore()`, or `vi.useRealTimers()` in an `afterEach` or `afterAll`;
    every mock a test gives an implementation through `vi.mocked` reset in a `beforeEach` by `vi.resetAllMocks()`
    or its own `mockReset()`, with no `vi.clearAllMocks()` in that file, and `vi.restoreAllMocks()` only in a file
    that calls `vi.spyOn`, the one kind of mock it restores, so it never reads as cleanup that is not happening; and
    no year read off the real clock and no `Date.now()` bracket in a unit test;
  - a module-level global regex used with `replaceAll` or `matchAll` only;
  - a pure layer reading the clock only as the default of an injectable `now`, and no `Date` built from
    local-time parts nor a timestamp written without its zone;
  - the steps `measureRun` composes imported nowhere outside `@domain`, and `@application` reaching
    `@presentation` only through `renderRun`, `renderEmptyRun` and `resolveChartHistories`;
  - `@infrastructure` importing `@config` for types only; `persistence` importing `git` as the one import between
    adapters; nothing outside `persistence` importing more of it than `withDataBranch` and `writeHtmlReport`; and
    `dataDir` named nowhere outside `@infrastructure`;
  - a child process started only in `src/infrastructure/git/commands.ts`, through `execFileSync` and never a
    shell;
  - `zod` imported only as `import * as z from "zod/mini"`, every module-level schema named `<Concept>Schema`, no
    schema's `parse` called, every `safeParse` of a module that imports `describeIssue` run with
    `{ reportInput: true }`, and no `JSON.parse` or `yaml.load` result cast;
  - an escape entity written only in `src/presentation/escaping.ts`, each renderer binding its escaper once at
    module load, and `formatCount` called in `@presentation` only by `badge.ts`, `chart-spec.ts` and
    `svg-chart.ts`, so the Reports print raw Star Counts;
  - a rule that names its one owner read nowhere else: the Snapshots a Chart needs (`MIN_SNAPSHOTS_FOR_CHART`), the
    Snapshots a Forecast needs (`MIN_SNAPSHOTS_FOR_FORECAST`) and the ISO date of a timestamp (`isoDate`);
  - the inputs and outputs listed alphabetically, `github-token` first, on every surface that lists them, and a
    wiki page reaching a repository file by an absolute URL;
  - no guide keeping a list of known inconsistencies, since an entry is a claim about the code that nothing keeps true;
  - this file: every rule between this list and the smell overrides opening with its id and its **hard** or
    **judgement** label, no id carried by two rules, and every id in a section drawn from one letter;
  - no object literal in a type alias but as a member of its union or beside the primitive it brands, nor one wrapped in
    `Readonly`, `Partial` or `Required`, so a shape built on others is an `interface` that `extends` them: `extends`
    reports a field the shapes disagree on where it is declared, where `&` folds it into `never` in silence, and the
    compiler caches an interface's relations by name and names it in an error, where it recomputes an intersection and
    spells it out;
  - every `.releaserc.json` the release configuration the sibling repositories share, with no key or plugin beyond
    what the repository's shape adds and laid out as Biome lays it out, its release commit
    `chore(<scope>): release ${nextRelease.version} [skip ci]` scoped to the package it releases, and every plugin
    it names, and `semantic-release`, declared at one version in the `package.json` that runs it, beside no other
    release package, and the release commit let past commitlint by its `ignores`, whatever its notes say;
  - every Mermaid diagram held to the `layout: dagre` it was drawn with, so a renderer that defaults to ELK cannot
    redraw it;
  - every `uses:` of another repository pinned to a full commit SHA with its version or branch in a trailing
    comment, and no comment in a YAML file (`pnpm-lock.yaml`, which pnpm writes, aside) but that one, a tool
    directive and the line Renovate writes above an entry it adds to `minimumReleaseAgeExclude`.

## Every change

- `G0` **hard**: A change carries everything the maintenance contract in [AGENTS.md](./AGENTS.md) and the guide of each
  folder it touches ask of it, in the same commit, and keeps every guardrail those guides state: the Data Branch format,
  the push, a secret passed in argv. A follow-up commit is a promise, not a fix.

## All layers

- `B1` **hard**: Code and prose use the GLOSSARY.md term for each concept, `Artefact` rather than `artifact`, because
  one word per concept keeps the arithmetic, a Chart title and a log line meaning the same thing
  ([ADR 0004](./docs/adr/0004-layered-source-structure.md)). A retired term in an identifier is a defect.
- `B2` **judgement**: Name a parameter object a method takes, or one a function takes without destructuring it, after
  the function that takes it, `<FunctionName>Params`, as the contract suite holds a destructured one to, so a reader
  landing on the type finds what takes it; a function handed one record keeps that record's type, whether or not it
  unpacks it (`generateCsvReport` takes `ComparisonResults`), and a single positional value, an overrides bag included,
  keeps its own. Sibling functions that take the same input may share one type named for that role
  (`RenderReportParams`, which both Report dialects take,
  [ADR 0016](./docs/adr/0016-the-report-renderers-read-config-themselves.md)); a test that needs a `*Params` shape
  derives it (`Parameters<typeof settleNotification>[0]`).
- `B3` **hard**: Fix a lint finding at its cause; an `_` prefix whose only job is to silence `noUnusedVariables` is a
  suppression too.
- `B4` **hard**: A type is exported when it names an exported function's result or another module imports it
  ([ADR 0022](./docs/adr/0022-a-concept-earns-a-type-when-it-crosses-a-boundary.md), question 2). A function that loses
  its export is tested through the interface that calls it.
- `B5` **hard**: Implement a rule once and call it from every site that needs it, because a second copy drifts with
  nothing to catch it; restating an owned rule inline is a defect even while it agrees. The owners are named per layer
  below.
- `B6` **hard**: A name that arrives from outside is resolved by searching the allowed values (`find`, `Object.hasOwn`,
  a `z.enum` schema), so `toString` and other prototype keys are rejected rather than resolved.
- `B7` **hard**: A value whose shape the types cannot prove (a Data Branch file, a GitHub response, `star-tracker.yml`,
  a caught error, nodemailer's rejected list) is read as `unknown` and checked with a zod schema before any field of it
  is read, never with a cast, because a cast checks nothing at run time and a malformed value then fails far from its
  source: `data_branch: 2026` in `star-tracker.yml` fails as `value is not iterable`, naming neither the file nor the
  key ([ADR 0023](./docs/adr/0023-untrusted-input-is-validated-with-zod-mini.md)). The schema is named after the concept
  it checks, declared beside its one reader (`github/types.ts` for the shape of a GitHub row), and the type is inferred
  from it; a value is checked with `z.validate` where the answer is a yes or no, and with `safeParse` where the caller
  reads the parsed value or the issue. An input or `GITHUB_API_URL` that must parse goes through a schema too, and a
  rejected path reaches its message through `describeIssue` in `src/shared/errors.ts`. The `@domain` types `storage.ts`
  checks are restated rather than inferred (*Deliberate overrides*), and the one `.stack` read narrows with
  `instanceof Error` (*Errors*).

## Types

- `M1` **judgement**: Before a concept gets a type of its own, ask in order whether the illegal state can be reached,
  whether anything reads it and whether it crosses a boundary (leaves `@domain`, reaches an action output, is written to
  the Data Branch, or is spelled in two dialects); a no to all three means writing the rule down (an assertion in
  `docs/docs-consistency.test.ts`, a guide line, a rule here, an ADR) instead of encoding it
  ([ADR 0022](./docs/adr/0022-a-concept-earns-a-type-when-it-crosses-a-boundary.md)). The fixed order is what lets two
  reviews of one finding reach one answer; when reachability is not conclusive, treat the state as reachable.
- `M2` **hard**: Say in the commit message when a change guards rather than fixes, and call a test that builds an
  unreachable state on purpose a guard, so the next reader does not mistake it for a reproduction; the commit that adds
  or declines a type also says which answer applied
  ([ADR 0022](./docs/adr/0022-a-concept-earns-a-type-when-it-crosses-a-boundary.md)).
- `M3` **judgement**: A finding closed by a written rule stays closed until one of the answers changes, because the
  rejected cases in ADR 0022 were weighed on purpose.
- `M4` **hard**: Compose object shapes declared elsewhere as `interface X extends A, B`, never `type X = A & B`, which
  no check tells from an intersection with a union, because that takes the types. Keep `&` for a member an interface
  cannot extend (a union, a type parameter, a conditional type), and `type` for what an interface cannot say: a union, a
  mapped or conditional type, an alias of a primitive, a tuple or a function, and a computed type on its own (`z.infer`,
  `Pick`, `(typeof X)[keyof typeof X]`).
- `M5` **hard**: Give an interface a name no other interface in its scope carries, because two declarations of one name
  merge in silence; merging is for an augmentation of a global or a vendor's module made on purpose, in a declaration
  file or a `declare global` or `declare module` block.

## Errors

- `E1` **hard**: `trackStars` never rejects: its top-level catch is the one place an error becomes `core.setFailed`, so
  every failure reaches the Action with the same prefix and its stack in the debug log.
- `E2` **hard**: Failures keep their class. Listing repositories and setting up the worktree are fatal; one repository's
  failed Stargazer fetch becomes a `core.warning` so the Run continues with partial data; a failed Notification warns,
  because email is non-fatal by design
  ([ADR 0011](./docs/adr/0011-the-notification-baseline-advances-only-on-delivery.md)).
- `E3` **hard**: An unreadable Stored History fails the Run and is never reset to empty, because a silent reset destroys
  the user's tracking record ([ADR 0021](./docs/adr/0021-an-unreadable-stored-history-fails-the-run.md)). Only an absent
  `snapshots` key reads as a first Run, and `stargazers.json`, which that ADR calls disposable, is the one file repaired
  entry by entry.
- `E4` **hard**: A caught error reaches a message through `errorMessage(error)` from `src/shared/errors.ts`, or through
  a schema of its own where more than the message is read (`status`, `stderr`), because a catch binding is `unknown` and
  a cast to `Error` lies whenever the throw is a string, a plain object or `undefined`. The one site that needs `.stack`
  narrows with `instanceof Error` inline.
- `E5` **hard**: Every fetch-failure message is built by `describeFetchError` in `src/infrastructure/github/errors.ts`,
  so the shape of that text changes in one place.
- `E6` **hard**: A handler that replaces a failure's text does so only for the failure it understands and rethrows the
  rest untouched, as `commitAndPush` does with `PUSH_REJECTED_PATTERN` and `initializeDataBranch` with
  `NOT_A_REPOSITORY_PATTERN`, because the original message is the useful part of any other failure (a checkout git
  refuses as unsafe is not a missing `actions/checkout`); a wrapper that adds context keeps the original detail
  (`describeFetchError`).
- `E7` **judgement**: An error raised for a condition the user can fix names the file or input and ends with the action
  that fixes it ("Fix or delete the file on that branch and re-run.").
- `E8` **judgement**: A best-effort git step (removing a stale worktree, emptying an orphan branch, `cleanup`) swallows
  its failure, logs it with `core.debug` and carries on, because the Run does not depend on it. Retries belong to
  `@octokit/plugin-retry` alone.
- `E9` **hard**: `sendEmail` rejects on failure and its caller catches and warns, so a mail outage is reported without
  turning the Run red.

## Domain

- `D1` **hard**: A `now` a function accepts reaches every clock read beneath it, so an injected clock dates the appended
  Snapshot as well as the Baseline Snapshot.
- `D2` **hard**: Production code under `src/domain` parses timestamps through `toEpochMs` in `src/domain/time.ts`, which
  guarantees a finite number or `null` and never `NaN`.
- `D3` **judgement**: A result that can be missing is `null`, never `undefined`, and a field that can be missing is
  optional (`toEpochMs`, `getBaselineSnapshot` against `History.starsAtLastNotification?`), so a reader knows which
  question the absence answers.
- `D4` **judgement**: A callback or comparator names its parameters for their role (`(earlier, later)`,
  `(repoA, repoB)`), never a single letter.
- `D5` **hard**: Return a changed value as a new one and leave the input untouched, as `recordNotification` returns a
  new History, because every value here is built once per Run and never updated in place
  ([ADR 0004](./docs/adr/0004-layered-source-structure.md)). The one parameter written to is private to the layer: the
  `invalidPatterns` accumulator `resolveTrackedSet` creates.
- `D6` **hard**: Each of these rules has one owner, so a Chart and its Report agree on the top repositories and Velocity
  and Forecast agree on the Rate Interval: `rankByStars` and `topRepositories` for Top Repositories;
  `settleNotification` for the Delivery rules and `notificationIsDue` for the send gate; `latestRateInterval` in
  `src/domain/growth.ts` for the Rate Interval minimum
  ([ADR 0017](./docs/adr/0017-velocity-and-forecast-read-unparseable-timestamps-differently.md)).
- `D7` **hard**: A per-repository Forecast is fitted only to the Snapshots that hold the repository, and a repository
  fewer than `MIN_SNAPSHOTS_FOR_FORECAST` of them hold gets none, because `repoStarSeries` reads a Snapshot without the
  repository as `0`, and a fit over the Snapshots from before it joined the Tracked Set extrapolates the `0 → total`
  ramp issue #148 guards against.
- `D8` **hard**: Inside `src/domain/forecast.ts`, the module the contract suite confines `MIN_SNAPSHOTS_FOR_FORECAST`
  to, `holdsEnoughToForecast` is the one function that reads it, so the aggregate, a repository's own History and the
  Snapshots that hold it are held to one minimum.
- `D9` **judgement**: A figure derived from a rule reads the rule's result, as `droppedSnapshots` is counted from the
  History `addSnapshot` returned, so the count cannot disagree with the array it describes.
- `D10` **judgement**: Arithmetic that decides what the shell fetches lives here and returns plain data (the Tracked Set
  narrowing in `resolveTrackedSet`, the Smart Sampling plan in `src/domain/sampling.ts`), so it is asserted on plain
  values without a fake octokit; the shell turns the counts it reports into log lines.

## Application

- `A1` **hard**: `src/application` sequences the Run and computes nothing itself: a figure it needs comes from the layer
  that owns it, through that layer's entry point, because each entry point exists so its layer's order cannot be got
  wrong from outside ([ADR 0013](./docs/adr/0013-a-run-is-measured-in-one-place.md)).
- `A2` **hard**: The renderers read `Config` themselves and the shell relays no chart or report option, so a new option
  costs no edit here ([ADR 0016](./docs/adr/0016-the-report-renderers-read-config-themselves.md)).
- `A3` **hard**: The shell reports what the transport did as one `Delivery` and reads `shouldNotify`, `notificationSent`
  and the History to persist off `settleNotification`, because the decision and the Delivery are different facts
  ([ADR 0011](./docs/adr/0011-the-notification-baseline-advances-only-on-delivery.md)).
- `A4` **hard**: The shell passes `readOnly` to `withDataBranch` and leaves the decision there, because the guard lives
  inside it.
- `A5` **hard**: One `setOutputs` serves the empty-repositories path and the full path, so the output keys cannot drift
  between them.
- `A6` **hard**: Octokit is built only from an absolute https API URL (`ApiUrlSchema`), and any other `github-api-url`,
  or `GITHUB_API_URL` when the input is empty, fails the Run naming both and saying why, because every request carries
  the token and plain http would send it in clear text.

## Config

- `K1` **hard**: A rejected input is reported as `Invalid <input-name> "<value>".`, with the kebab-case name and the raw
  value, and names a fallback only when nothing later in the precedence chain can supply one, because the config file
  may still supply the value.
- `K2` **hard**: A parser in `src/config/parsers.ts` never throws and answers `undefined` for a value it cannot use;
  whether that warns, throws or falls through to the next source is `loader.ts`'s decision.
- `K3` **judgement**: A module that owns a group of action inputs reads that group ambiently and its callers never learn
  the input names: `loadConfig` for tracking, `getEmailConfig` for SMTP, `trackStars` for `github-token` and
  `github-api-url`. `loadConfig` stays zero-argument and a new input group gets its own ambient reader, because
  parameterising it makes the orchestrator relearn every input name
  ([ADR 0018](./docs/adr/0018-loadconfig-reads-the-ambient-action-inputs.md)).
- `K4` **hard**: Each input is parsed once, and the fold takes the value and the warning from that one result, so the
  two cannot disagree.
- `K5` **hard**: GitHub's REST dialect lives in `src/infrastructure/github/client.ts` (`VISIBILITY_PARAMS` among it) and
  never in `@config`, the layer that reads the inputs and must not know octokit exists.

## Infrastructure

- `I1` **judgement**: Adapters fetch, map GitHub's rows onto domain types, and log. A decision over fetched data that
  can be made on plain values, Smart Sampling arithmetic included, belongs to `@domain`, so it is tested without a fake
  octokit or a mocked logger.
- `I2` **hard**: Strings built here are log lines, error text and git arguments, all literal English, because Report
  text comes from the locale bundles; the one bundle key is `email.defaultFrom`, the Notification's default sender,
  since text that reaches a Notification is a bundle key. The same holds in `src/application` and `src/config`, whose
  log lines are literal English.
- `I3` **hard**: The read-only guard lives in `publish` in `src/infrastructure/persistence/data-branch.ts` and
  `commitAndPush` stays unaware of it, because `commitAndPush` called on a read-only Run would push.
- `I4` **hard**: A plain-text Artefact on the Data Branch is written by `writeArtefact` from its `DATA_FILES` row, never
  by a writer of its own, so a new format costs an entry rather than another function.
- `I5` **hard**: `starredAt` passes through as GitHub's raw ISO string, and a `starred_at` that is not a string reads as
  `""`, an unusable date, because `diffStargazers` sorts the raw strings and that is correct only while every value has
  the same format ([ADR 0022](./docs/adr/0022-a-concept-earns-a-type-when-it-crosses-a-boundary.md)).

## Presentation

- `U1` **hard**: Renderers are synchronous and return a string or `null`, so every rendered Artefact is exercised on
  plain values ([ADR 0004](./docs/adr/0004-layered-source-structure.md)). Whether to render is the caller's decision and
  what a number means is `@domain`'s.
- `U2` **hard**: A Chart's content is decided once, in `src/presentation/chart-spec.ts`: the window, the axis labels,
  the series and their colours, the default title, and the Milestones to draw with their labels. `svg-chart.ts` and
  `chart.ts` draw the `ChartSpec` they are handed, so the two renderers cannot drift on content. A new chart kind is one
  `ChartRequest` variant and one `case` in `buildChartSpec`
  ([ADR 0014](./docs/adr/0014-charts-are-built-as-a-spec-and-rendered-by-adapters.md)).
- `U3` **hard**: Whether a History holds enough Snapshots to draw is `isPlottable` in `src/presentation/chart-spec.ts`,
  and `buildChartSpec`, `charts.ts` and `report-model.ts` all ask it rather than count Snapshots, so a Chart, its file
  and its link in a Report cannot disagree about whether there is a Chart.
- `U4` **hard**: The spec speaks in emphasis (`SeriesDash`, `SeriesWeight`) and carries no SVG attribute, Chart.js
  option name, dash array or point radius, because the moment one leaks in the other adapter has to work around it.
- `U5` **hard**: Text a reader reads is formatted in the spec, in the Run's Locale, so the Notification and the Data
  Branch show the same label; an adapter draws the string it is handed. A y-axis tick, whose values each adapter picks
  itself, is the one number the adapter formats, and it formats it in the Run's Locale: `svg-chart.ts` compacts it with
  `formatCount`, and `chart.ts` hands Chart.js the Locale's Intl code (`options.locale`).
- `U6` **hard**: The email adapter writes a series' translucent fill with `translucent`, which reads every hex form
  `parseHexColor` lets `chart-line-color` through (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`) and scales the alpha a
  colour already carries, because appending two digits to the colour turns a 3-digit one into an invalid colour and a
  4-digit one into a different colour.
- `U7` **hard**: A Report prints the date of a timestamp through `isoDate` in `@domain/formatting`, whether it dates the
  Run, the Baseline Snapshot or a Stargazer, so no dialect spells the cut itself.
- `U8` **hard**: Charts carry no charting library: the SVG is drawn by `svg-chart.ts` with its own stylesheet, which is
  what makes it theme-aware ([ADR 0006](./docs/adr/0006-hand-rendered-svg-charts.md)), and the email chart is a
  QuickChart URL because mail clients do not display inline SVG
  ([ADR 0010](./docs/adr/0010-quickchart-renders-the-email-charts.md)). The email chart honours the same options and
  shows the same content as the SVG, except where ADR 0010 lists; appearance may differ between the two
  ([ADR 0014](./docs/adr/0014-charts-are-built-as-a-spec-and-rendered-by-adapters.md)).
- `U9` **hard**: The chrome both adapters draw identically lives in `CHART_CHROME`, the canvas they share in `CHART` and
  the style defaults they share in `CHART_DEFAULTS` (`src/presentation/constants.ts`), so each value lives in one place;
  `chartImageUrl` takes no fallback from `SVG_CHART`.
- `U10` **hard**: `renderRun` is the layer's entry point and reads the clock once; every date in a render comes off the
  model, so a Run crossing midnight dates the markdown and HTML Reports alike.
- `U11` **hard**: `buildReportModel` decides which sections a Report has and what is in them; `markdown.ts` and
  `html.ts` own markup and read the model's resolved fields (`model.perRepoForecasts` is the one list for per-repository
  Forecasts), because a dialect that recomputes one reintroduces the drift the model exists to stop.
- `U12` **hard**: A fact comes from the value it was derived from, never from comparing a rendered, localized string, as
  `isFirstRun` comes from `prepareReportData`, so a wording change in a bundle cannot flip it.
- `U13` **hard**: A per-repository Forecast Chart is drawn only when the Forecast's `source` is `ForecastSource.OWN`,
  read from `source` rather than re-derived from `MIN_SNAPSHOTS_FOR_FORECAST`, because only the repository's own
  reconstruction holds it alone, and the aggregate's timeline would draw the stretch before it joined under its name.
- `U14` **hard**: Another chart family is one more membership test on `drawn`, so it costs a lookup rather than a new
  parameter or predicate.
- `U15` **judgement**: A mapping from a closed union is a `Record<Union, …>` table or an exhaustive `switch` with no
  `default` (`CHART_RANGE_DAYS`, `CURVE_PATHS`, `buildChartSpec`), so a new member breaks the typecheck.
- `U16` **judgement**: A number with a meaning is a named constant or a field of the adapter's style object
  (`SVG_CHART`, `CHART_POINT`); literals are for 0, 1, halves and formatting precision.
- `U17` **judgement**: A helper lives with its only consumer, so `shared.ts` names a concept rather than "imported by
  more than one file"; chart windowing and series maths therefore sit in `chart-spec.ts`.

### Escaping

- `U18` **hard**: Every GitHub-sourced or user-supplied string is escaped for the place it lands, per this table; a
  value `@config` closes to an alphabet that needs no escaping (a hex colour from `parseHexColor`) is the exception:

| Lands in | Dialect |
| --- | --- |
| HTML, and values inside the raw HTML `markdown.ts` emits | `MARKUP` |
| SVG text and attributes, in `svg-chart.ts` and `badge.ts` | `XML` |
| Markdown: every GitHub-sourced string outside raw HTML (link text and targets, headings, prose, bold titles) | `MARKDOWN` |
| A CSV field, formula prefixes included | `CSV` |
| The QuickChart config | none: `JSON.stringify` and `encodeURIComponent` cover it |

- `U19` **hard**: `svg-chart.ts` escapes the title, the x-axis labels, the legend labels, the Milestone labels and any
  user text a new attribute interpolates, because each of those can carry a repository name.
- `U20` **hard**: `badge.ts` measures the raw label and value and escapes at interpolation, because escaping first lets
  a single `&` widen the Badge by four characters.

## i18n

- `L1` **hard**: Text that reaches a Report, Chart, Badge or Notification is a bundle key, and a sentence is one key
  with `{placeholders}`, so a translation can order its words freely: the per-repository Chart titles carry the
  repository as `{name}`, and the Total Stars label is one key rather than two words of the bundle
  ([ADR 0014](./docs/adr/0014-charts-are-built-as-a-spec-and-rendered-by-adapters.md)).
- `L2` **hard**: `interpolate` leaves escaping to `@presentation`, because `html.ts` passes full markup as footer params
  and escaping here would double-escape every Report.
- `L3` **hard**: The object `getTranslations` returns is read-only to its callers, because every caller shares the same
  object graph.

## Shared

- `H1` **hard**: `@shared` holds only code more than one layer needs and no layer owns, because putting code here claims
  that no layer owns it and the claim is usually wrong. Formatting belongs in `@domain/formatting`, config parsing in
  `@config/parsers`, rendering primitives in `@presentation/shared`, git, fs or HTTP in `@infrastructure`, and reasoning
  about Stars, Snapshots, Deltas, Forecasts or dates as business data in `@domain`. The one other case is code two
  `@infrastructure` adapters need, since neither may import the other: `describeIssue` and `describeFound` word a
  rejected value for `github/` and `persistence/` alike.
- `H2` **judgement**: A helper with a single caller stays with that caller, because one more helper here is this folder
  accumulating.

## Tests

- `T1` **hard**: A test's `Config` comes from `makeConfig`, so a test names only the option it cares about
  ([ADR 0016](./docs/adr/0016-the-report-renderers-read-config-themselves.md)).
- `T2` **judgement**: Any other fixture a shared factory in `src/shared/tests/index.ts` can express comes from it; a
  hand-built History or Snapshot is for the timestamps the factories cannot express (unreadable, irregularly spaced).
- `T3` **hard**: A test that needs a list passes a fresh array in the overrides and leaves the arrays of a `makeConfig`
  result untouched, because `makeConfig` shares the arrays of `DEFAULTS` across every config it returns.
- `T4` **hard**: A change a test makes outside itself, other than the stubs, spies and fake clocks the contract suite
  reads, is undone in an `afterEach` (an `afterAll` for a change made once for the whole file), because a line at the
  end of a test body never runs once an assertion above it fails and the change leaks into every later test in the file.
- `T5` **hard**: The clock a case depends on is pinned (an injected `now`, or
  `vi.useFakeTimers({ now, toFake: ["Date"] })` where the code under test takes none) and the exact instant or year it
  yields is asserted, because a bracket between two readings of the real clock passes whatever the code computed in
  between and a year read off it moves the expected value every January.
- `T6` **hard**: A dialect test builds its model with `buildReportModel` (or renders through `renderRun`), never by
  hand, so a model change cannot be faked past it.
- `T7` **hard**: A test mocks at the seam, git through `execute` in `../git/commands` matched on argv membership,
  because positional mocks a level deeper shift with every added git call and break unrelated tests, and an
  authenticated command begins with `-c` rather than its subcommand.
- `T8` **hard**: A rule is asserted once, in the test that owns it: a Chart's content in `chart-spec.test.ts` and its
  appearance in `svg-chart.test.ts` or `chart.test.ts`; a Report's sections in `report-model.test.ts`; the entry point's
  contract and dialect parity in `run.test.ts`; the Smart Sampling arithmetic in `sampling.test.ts`; what reaches the
  Data Branch, and in what order, in `data-branch.test.ts`; wiring in `tracker.test.ts`, which fakes the `DataBranch`
  and reads `branch.publish`. The end-to-end pin of #148 in `tracker.test.ts` is the one exception, and the reason the
  rule below keeps the chart code unmocked there.
- `T9` **hard**: `tracker.test.ts` leaves `@presentation/run`, `@presentation/charts` and `@domain/star-history`
  unmocked and mocks `@presentation/svg-chart` down to `renderSvgChart`, so the chart code runs for real under the
  renderer mocks.
- `T10` **hard**: A mock a test gives an implementation (`mockReturnValue`, `mockImplementation`, or a resolved,
  rejected or `Once` form of either) on a handle of its own rather than through `vi.mocked`, which the contract suite
  reads, is reset in a `beforeEach` by `vi.resetAllMocks()` or its own `mockReset()`, because `vi.clearAllMocks()`
  empties the calls and keeps the implementation, and the next test then runs against the previous one's fake. A default
  a mock factory gives is written `vi.fn(impl)`, the implementation a reset returns to, or set again in that
  `beforeEach`.
- `T11` **judgement**: Keep each docs-test assertion one aggregated failing list per rule, rather than an `it.each` per
  document, so one run names everything that drifted.
- `T12` **hard**: A new docs-test assertion is proved by breaking the code it guards and watching it fail, permuting a
  pair rather than only renaming a token, because an assertion that never failed advertises coverage it lacks.
- `T13` **hard**: Every list a docs-test assertion derives from the repository (files, rows, matches) is guarded by a
  non-empty assertion or a synthetic self-test, because an assertion over an empty census passes whatever the tree
  holds.

## Workflows

- `C1` **hard**: A `uses:` pin's SHA and the version or branch in its trailing comment move together: the SHA is what
  runs, the comment is the only thing that makes it legible, and Renovate maintains both halves.
- `C2` **hard**: The reason for a line of YAML goes in the commit message, the pull request, an ADR or a rule here, and
  a gotcha an implementer would otherwise trip on goes in the *Gotchas* of [AGENTS.md](./AGENTS.md).

## Docs

- `G1` **hard**: Keep `GLOSSARY.md` to vocabulary: the term, one or two sentences on what it is, and the words it
  displaces, never how it is built, because mechanism belongs to the folder guide or an ADR.
- `G2` **hard**: State a rule once: a rule about how code is written here, a coupling or a gotcha in the guide of the
  folder it bites, a decision in an ADR, as *Where things live* in [ARCHITECTURE.md](./ARCHITECTURE.md) maps them; a
  wiki page says where the rule lives, because `docs/wiki/` is published and nothing checks a copy.
- `G3` **hard**: Write a guide in the present tense, holding what an implementer needs while working; the reason for a
  line goes in the commit message, the pull request, an ADR or a rule here, and history ("used to", "was", "until …")
  stays in git, because a guide is loaded into every session that works in its folder.
- `G4` **hard**: Delete a gotcha in the change that resolves it, because a stale entry is a false claim about the tree.
- `G5` **hard**: Fix a breach in the change that finds it, or report it on the pull request with the rule it breaks.
- `G6` **judgement**: An ADR is proposed only for a decision that is hard to reverse, surprising without context and the
  result of a real trade-off, and is linked from where it bites.

## Deliberate overrides of the smell baseline

- **Duplicated Code, Data Clumps**: `charts.ts` and `emailChartStyle` both project `Config` onto a chart style and
  the same fields travel through both. They stay two projections, because the parity a shared type would assert is
  false: `chart.ts` collapses curves, reads `emailTheme` and never receives `maxPoints`. `run.test.ts` guards the
  drift instead ([ADR 0022](./docs/adr/0022-a-concept-earns-a-type-when-it-crosses-a-boundary.md),
  [ADR 0014](./docs/adr/0014-charts-are-built-as-a-spec-and-rendered-by-adapters.md)).
- **Duplicated Code**: `errorMessage` and `describeFetchError` share a shape and handle a blank message in opposite
  ways, so neither is built on the other.
- **Duplicated Code**: `calendarDays` and `computeVelocity` read unparseable timestamps under different policies,
  because a Forecast needs plausible spacing and a Velocity a true duration
  ([ADR 0017](./docs/adr/0017-velocity-and-forecast-read-unparseable-timestamps-differently.md)).
- **Duplicated Code**: a full Stargazer fetch cut short reports `stargazers.length` as its Covered Stars while a
  sampled one goes through `coveredStars` in `@domain`, because a sampled fetch's length counts only the pages it read,
  while on a full fetch every page before the stop is full, so `stargazers.length` is the exact figure.
- **Duplicated Code**: `src/shared/tests` redeclares `MS_PER_DAY`, because `@shared` may import `@domain` for types
  only ([ADR 0022](./docs/adr/0022-a-concept-earns-a-type-when-it-crosses-a-boundary.md)).
- **Duplicated Code**: `SnapshotSchema` and `SnapshotRepoSchema` in `storage.ts` restate the shape of `Snapshot` and
  `SnapshotRepo` in `@domain/types`, because a schema cannot live in a pure layer and the domain type is not
  inferred from one; `readHistory` returning `History` catches a field the schema lacks, never a key the type lacks
  ([ADR 0023](./docs/adr/0023-untrusted-input-is-validated-with-zod-mini.md)).
- **Duplicated Code**: the stated-version helpers (`VERSIONED_DEPENDENCIES` through `declaredIn`) in
  `docs/docs-consistency.test.ts` are byte for byte the same in biancafiore, contribKit and github-star-tracker, so a
  change to one is made in all three.
- **Duplicated Code**: the release-configuration rule (`BREAKING_PARSER_OPTS` through the `describe` that holds
  every release configuration to the shared one) in `docs/docs-consistency.test.ts` is byte for byte the same in
  biancafiore, contribKit, forever-pto and github-star-tracker, so a change to it is made in all four; only the
  shapes declared above it, which name each repository's files, differ.
- **Duplicated Code**: the id rule (the `describe` that gives every rule of this file an id a finding can cite) in
  `docs/docs-consistency.test.ts` is the same in biancafiore, contribKit, forever-pto and github-star-tracker, so a
  change to it is made in all four; only the floor its census holds and the call that reads this file differ.
- **Duplicated Code**: the shape rule (the `describe` that keeps every object shape an interface) in
  `docs/docs-consistency.test.ts` is the same in biancafiore, contribKit, forever-pto and github-star-tracker, so a
  change to it is made in all four; only the floor its census holds and the files it reads differ.
- **Repeated Switches**: each chart adapter maps `SeriesDash` (and the email adapter `SeriesWeight`) through its own
  table and keeps its own series dash patterns, because those are dialect facts
  ([ADR 0014](./docs/adr/0014-charts-are-built-as-a-spec-and-rendered-by-adapters.md)).
- **Primitive Obsession**: `fullName`, `starredAt` and `timestamp` stay strings, because each hazard is named where
  it bites and a type would cross every layer and the persisted format
  ([ADR 0022](./docs/adr/0022-a-concept-earns-a-type-when-it-crosses-a-boundary.md)).
- **Middle Man**: `measureRun`, `renderRun` and `withDataBranch` stay their layers' entry points even where they
  mostly delegate, because they are what keeps the seams behind them from being called in the wrong order
  ([ADR 0013](./docs/adr/0013-a-run-is-measured-in-one-place.md)).
- **Shotgun Surgery**: a new overridable input touches `action.yml`, `Config`, `DEFAULTS`, `FIELD_SOURCES` and every
  surface that lists inputs, because that spread is the accepted cost of the precedence chain
  ([ADR 0020](./docs/adr/0020-overridable-inputs-declare-an-empty-default.md)).
