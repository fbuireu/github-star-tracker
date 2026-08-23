# src/config

The only place that reads GitHub Action inputs for tracking behaviour and the only place that reads the
repo's `star-tracker.yml`. It produces a fully-populated `Config` (every field always present, never
`undefined`) plus the `Visibility` and `Chart*` enums other layers reference. It does **not** read the SMTP
inputs (`@infrastructure/notification` does), does **not** read `github-token` / `github-api-url`
(`@application/tracker` does), and does **not** validate value *ranges*.

**`loadConfig()` takes no arguments and reads the ambient inputs on purpose**, and
[ADR 0018](../../docs/adr/0018-loadconfig-reads-the-ambient-action-inputs.md) records why: parameterising it
deletes 49 test lines, 27 of them the same repeated mock, and forces the orchestrator to relearn every input
name, which is exactly the coupling
[ADR 0016](../../docs/adr/0016-the-report-renderers-read-config-themselves.md) removed. Do not re-propose it.

[`types.ts`](./types.ts) holds `Config` and the enums, [`defaults.ts`](./defaults.ts) holds `DEFAULTS`,
[`parsers.ts`](./parsers.ts) holds pure coercions used only here, with its own colocated [`parsers.test.ts`](./parsers.test.ts), and [`loader.ts`](./loader.ts) is
the resolver. Every parser is reached through `loader.ts`'s field table in production, so none is exported
*only* for a test; `parsers.test.ts` does exercise them directly, which is why they are exported at all.

## The field table

`loadConfig` does **not** resolve keys one at a time. `FIELD_SOURCES` in `loader.ts` is one row per key
naming how to parse the action input and how to parse the config-file value; `resolveTabledFields` folds it,
deriving the kebab-case input name from the key and falling back to `DEFAULTS`. Adding a `Config` field
means adding a row, not four lines in four places.

The row types are the vocabulary: `boolField`, `positiveField`, `nonNegativeField`, `listField` and
`enumField(allowed)`. Two rows (`chart-line-color`, `chart-line-width`) pass `namesFallback: true` to
`scalarField`, which is what makes their warning name the fallback rather than say "Ignoring it." That used
to be a second combinator, byte-identical to `scalarField` but for the one template literal.

**Four keys are deliberately outside the table**, and each is a documented exception: `visibility` throws
instead of warning, `dataBranch` runs an extra validator, `sendOnNoChanges` never reads the config file and
never warns, and `chartCustomMilestones` has its own precedence (see below). Anything else belongs in the
table.

## Invariants & rules

- **Precedence, per key: action input, then config-file value, then `DEFAULTS`.** Never reversed. Enum keys
  use `input || fileValue`, so an empty-string input falls through; everything else uses `??` on the *parsed*
  result, so a value that parses to `false` or `0` still beats the file.
- **Each input is parsed once.** The fold decides the value and whether to warn from the same result, so no
  key calls its parser twice.
- A config-file value that is neither a string, a number, `null` nor absent is ignored rather than crashing
  the parser: `min_stars: true` falls back to the default.
- **`emailTheme` is the one key whose default is another key.** It resolves through `resolveEnum` like every
  other enum row, but `ChartTheme.AUTO` is not a value it keeps: `auto` collapses to the already-resolved
  `chartTheme` before the `Config` is built, so `Config.emailTheme` is what the email should actually use and
  no consumer re-derives it. `DEFAULTS.emailTheme` is therefore `auto`, a marker meaning "inherit" rather
  than a palette, and it exists mainly so the config-file key `email_theme` is derived.
- **That collapse is positional in `loadConfig`'s `Config` object literal, not in `FIELD_SOURCES`.**
  `chartTheme` and `emailTheme` are both ordinary `enumField` rows and `resolveTabledFields` resolves them
  independently, so reordering the rows changes nothing. What is load-bearing is that the `emailTheme:` line
  sits **after** `...tabled` in the literal: above the spread, the un-collapsed `auto` from `tabled` would
  win back.
- **Only two things throw**: an unknown `visibility`, and an invalid `data-branch`. Everything else (a bad
  enum, bool, number or colour, and malformed YAML) warns and falls back. A missing config file is `info`,
  not a warning.
- `visibility` is resolved with `Object.values(...).find(...)`, not an object index, so `visibility: toString`
  is rejected instead of resolving off `Object.prototype`.
- **`data-branch` validation** rejects `''`, `'@'`, whitespace, `~ ^ : ? * [ \`, control characters, the
  sequences `..` `//` `/.` `@{`, a leading `-` `.` `/`, and a trailing `/` `.` `.lock`. It accepts
  `data/star-tracker`, `_star-data`, `stars@v2`, `v1.2.3`, `UPPER_case-1`.
- **Booleans use two different vocabularies.** Action inputs accept only `true`/`false`, so `yes`, `on` and
  `1` are **invalid** and warn. Config-file values accept the full YAML set (`true|yes|on|y|1` /
  `false|no|off|n|0`), and a quoted `"false"` is `false`, not a truthy string.
- **Numbers are strict.** A string input must match `/^[+-]?\d+$/` after trimming, so `'3.7'` and `'42abc'`
  are rejected outright with no partial parse; a YAML number is truncated with `Math.trunc`.
- **Sign is enforced per key, and which parser a key uses is load-bearing.** `max-history`, `top-repos` and
  `smart-sampling-pages` use `parsePositiveNumber` (`> 0`), so `0` and negatives fall back to the default.
  `min-stars`, `chart-max-points` and `smart-sampling-threshold` use `parseNonNegativeNumber` (`>= 0`), which
  is what keeps `chart-max-points: 0` alive as a meaningful value, full history at weekly resolution, while
  still rejecting negatives. Rejecting `max-history: 0` matters downstream: `addSnapshot` trims with
  `.slice(-maxHistory)`, and `slice(-0)` would keep the entire array.
- `chart-line-width` is the only decimal field and requires finite **and > 0**.
  `notification-threshold` matches `'auto'` **exactly**: no trim, no case-fold, so `'Auto'` is rejected.
- **Lists**: `parseList` returns `undefined` (not `[]`) for empty input so the file value can still win, while
  `toStringList` **preserves an empty array**, so `only_repos: []` in the file yields `[]` rather than falling
  back to `DEFAULTS`.
- **`chart-custom-milestones` has special-cased precedence**: a non-empty *input* wins outright, even when it
  parses to `[]`, and the file value is not consulted. It keeps finite values `> 0`, de-duplicates and sorts
  ascending, and uses `parseInt` per segment, so `'2500abc'` yields 2500 unlike the strict number parser.
- **Config-file keys are derived mechanically** from `Object.keys(DEFAULTS)`. Both `snake_case` and
  `kebab-case` are read, `snake_case` wins when both are present, and there is no hand-written key map, so
  adding a `Config` field automatically makes it file-readable.
- **`sendOnNoChanges` is the one key that cannot come from the config file.** Input-only, parsed with a bare
  boolean parser, and an invalid value is silently ignored with no warning.
- If `readOnly` is true and the threshold is anything other than `0`, `loadConfig` warns: the baseline lives on
  a branch a read-only run never updates.

## action.yml cross-check

[`docs/docs-consistency.test.ts`](../../docs/docs-consistency.test.ts) reads the real [`action.yml`](../../action.yml) too, and asserts the **prose**: every overridable
input states its real `DEFAULTS` value as `(default X)` and carries `(overrides config file)`. Those two
strings had drifted: sixteen `chart-*` and `velocity-metrics` inputs were file-readable while saying
nothing about it, which reads as "input only".

[`action-inputs.test.ts`](./action-inputs.test.ts) reads the real `action.yml` and asserts every `Config` key except `sendOnNoChanges`
has a kebab-case input whose `default` is **empty**, and that only `config-path`, `send-on-no-changes` and
`smtp-port` carry a non-empty default. **Never add a `default:` to an overridable input**: the test fails and
the config file stops working, because a non-empty default always beats it.
[ADR 0020](../../docs/adr/0020-overridable-inputs-declare-an-empty-default.md) records why that is a
precedence trap rather than a lint rule, and why those three inputs are safe exceptions.

It derives the input name with **`toActionInputName`, exported from `loader.ts`**, the same function the fold
uses, so the test cannot disagree with the loader about what a key is called. It also pins the `outputs:`
block: eleven keys, alphabetical, each described. That list is the only executable check on the output
contract *from the manifest side*; [`tracker.test.ts`](../application/tracker.test.ts) closes the loop from the code side by comparing the
names `setOutputs` actually emits against `action.yml`. Between them the contract is checked in both
directions, where the manifest list alone was a copy of `action.yml` compared with `action.yml` and would not
have noticed an output going missing from `setOutputs`. What each output *means* is
[`src/application/`](../application/CLAUDE.md)'s to document; this folder only checks that the manifest and
the code agree on the names.

Real defaults therefore live in `defaults.ts` and are only *described* in the `action.yml` prose. Every
overridable input does state its default in that prose today, so check `defaults.ts` before trusting a
description rather than assuming one is missing. Two of those descriptions promise behaviour this folder does
not implement:

- `chart-max-points` says "capped at 365". That clamp is **not** applied here: `loadConfig` passes the raw
  integer through, and `MAX_HISTORY_BUCKETS` in `@domain/star-history` does the capping.
- `chart-custom-milestones` says it "Requires chart-milestones to be enabled". Nothing enforces that; the two
  resolve independently, so custom milestones combined with `chart-milestones: false` silently do nothing.

Three literals are duplicated between the manifest and code, so changing `action.yml` alone has no effect:
`smtp-port`'s `"587"` (`DEFAULT_SMTP_PORT` in `@infrastructure/notification/email`), `config-path`'s
`'star-tracker.yml'` (`DEFAULT_CONFIG_PATH` in `loader.ts`) and `send-on-no-changes`'s `'false'`
(`DEFAULTS.sendOnNoChanges`). All three pairs are pinned by `action-inputs.test.ts`. The third is the
asymmetric one: because the manifest always supplies a non-empty `'false'`, `DEFAULTS.sendOnNoChanges` is
reached **only** through an unparseable input, so a drift there shows up as an invalid value behaving
differently from an absent one rather than as a changed default.

## Gotchas

- **`loadConfigFile` returns every file key, with `undefined` for absent ones**, so `'minStars' in fileConfig`
  is not a presence test; use `??`. It returns `{}` when the file is missing, empty, unparseable, or parses
  to a non-object.
- **Config-file parse failures are mostly silent.** Only the enum fields warn, because they are fed
  `input || fileValue`; everything else warns on the input side only. A bad `min_stars: "abc"` in the YAML
  falls back with no warning at all.
- **An unquoted hex colour in YAML is parsed as a number** (`chart_line_color: 123456`), and the file parser
  accepts strings only, so it silently becomes the default. Quote it. `action.yml` warns about the
  `#`-starts-a-comment half of this trap but not the numeric half.
- `resolveEnum` takes `input || fileValue`, so an empty string means "not set" and returns the fallback
  **without** warning. Only a non-empty, non-matching value warns.
- **Warning wording is asserted verbatim**, including the Oxford comma
  (`'Invalid locale "fr". Must be "en", "es", "ca", or "it". Falling back to "en"'`). The generic parser
  message deliberately does *not* name a fallback, because the config file may still supply one.
- [`loader.test.ts`](./loader.test.ts) is the real specification for this folder; it is by far the largest test in the tree.
