# src/config — Action inputs + YAML config file resolved into one typed `Config`

This folder is the only place that reads GitHub Action inputs for tracking behaviour (`@actions/core.getInput`) and the only place that reads the repo's `star-tracker.yml`. It produces a fully-populated `Config` object — every field is always present, never `undefined` — plus the `Visibility`/`Chart*` enums that other layers reference. It does NOT read secrets/SMTP inputs (`@infrastructure/notification/email` reads those directly), does NOT read `github-token` / `github-api-url` (`@application/tracker` does), does NOT validate value *ranges* (no clamping of `chart-max-points`, `top-repos`, `max-history`), and does no network or git I/O.

## Files
| File | Responsibility |
| --- | --- |
| `types.ts` | The `Config` interface and the four chart enums plus `Visibility` (const-object + type pairs). |
| `defaults.ts` | `DEFAULTS: Config` (the single source of truth for every default) and `VISIBILITY_CONFIG` (maps a `Visibility` to GitHub `listForAuthenticatedUser` params). |
| `parsers.ts` | Pure string/unknown -> value coercions. Internal to this folder. |
| `loader.ts` | Reads the YAML file, reads every action input, applies precedence, warns/throws, returns `Config`. |

## Public API

### `loader.ts`
- `loadConfig(): Config` — called once, from `@application/tracker`. Reads all inputs + the config file, throws on invalid `visibility` or `data-branch`, `core.warning`s on everything else, logs a summary via `core.info`.
- `loadConfigFile(configPath: string): FileConfig` — exported but consumed only by `loader.test.ts`; `loadConfig` calls it internally.

### `defaults.ts`
- `DEFAULTS: Config` — the default for every key. Imported by `loader.ts`, `@shared/testing` (to build test fixtures) and `action-inputs.test.ts`; `@infrastructure/github/client` imports `VISIBILITY_CONFIG` from this module, not `DEFAULTS`. Treat it as the authoritative default table; `action.yml` intentionally carries no defaults for these inputs.
- `VISIBILITY_CONFIG: Record<Visibility, { visibility: 'public' | 'private' | 'all'; affiliation?: string }>` — spread into the Octokit repo-list params by `@infrastructure/github/client`. `owned` maps to `{ visibility: 'all', affiliation: 'owner' }`.

### `types.ts`
- `Config` — consumed as a type by `@infrastructure/github/{client,filters,stargazers}`, `@presentation/charts`, `@shared/testing`.
- `Visibility` / `ChartAxisSide` / `ChartTheme` / `ChartRange` / `ChartCurve` — const objects + same-named types. `@presentation/{chart,html,shared,svg-chart}` import the const objects at runtime to switch on values.

### `parsers.ts`
Every export (`parseList`, `parseNumberList`, `parseBool`, `parseFileBool`, `toStringList`, `parseNumber`, `parseHexColor`, `parseFileHexColor`, `parseDecimal`, `parseNotificationThreshold`) is used only by `loader.ts` and this folder's tests. No other layer imports them.

## Key types
- `Config` — 37 fields, all required. Notable non-obvious ones: `notificationThreshold: number | 'auto'`, `chartCustomMilestones: number[]`, `chartLineWidth: number` (the only non-integer numeric field), `compareAgainst: CompareAgainst` and `notificationMode: NotificationMode` (both defined in `@domain/types`, not here), `locale: Locale` (from `@i18n`).
- `FileConfig` (loader-internal) — `Partial<Config>` minus `sendOnNoChanges`, with `chartCustomMilestones?: number[] | string`. `sendOnNoChanges` is deliberately the one key that cannot come from the config file.

## Invariants & rules

**Precedence (per key):** action input -> config-file value -> `DEFAULTS`. `loadConfig` never reverses this. Enum keys use `input || fileValue` (falsy-coalescing, so an empty-string input falls through); everything else uses `?? ` on the parsed result, so a value that parses to `false` or `0` still wins over the file.

**Throw vs warn — only two things throw:**
- Unknown `visibility` -> `Error("Invalid visibility ...")`. Resolved with `Object.values(Visibility).find(...)`, not an object index, so `visibility: toString` is rejected rather than resolving off `Object.prototype` (`loader.test.ts`).
- Invalid `data-branch` -> `Error("Invalid data-branch ...")` from `assertValidDataBranch`.
Everything else (bad enum, bad bool, bad number, bad colour, bad milestone list, malformed YAML) warns and falls back. A missing config file is `core.info`, not a warning (loader.ts:146).

**`data-branch` rules** (`assertValidDataBranch`, loader.ts:50): rejects `''`, `'@'`, any whitespace or `~ ^ : ? * [ \`, any char with code point <= 31 or == 127, the sequences `..` `//` `/.` `@{`, leading `-` `.` `/`, and trailing `/` `.` `.lock`. Accepts `data/star-tracker`, `_star-data`, `stars@v2`, `stars+data`, `v1.2.3`, `UPPER_case-1`.

**Booleans are parsed by two different vocabularies:**
- Action inputs (`parseBool`): only `true`/`false`, trimmed and lowercased. `yes`, `on`, `1` are **invalid** — they warn and fall through, they do not mean true.
- Config file (`parseFileBool`): real booleans pass through; strings accept the full YAML set `true|yes|on|y|1` / `false|no|off|n|0`. Quoted `"false"` is `false`, not a truthy string.

**Numbers:**
- `parseNumber` on a string requires `/^[+-]?\d+$/` after trimming — `'3.7'`, `'1o'`, `'42abc'` are rejected outright (no partial parse). On a number (only reachable from YAML) it truncates with `Math.trunc` and rejects non-finite.
- No lower/upper bounds are enforced: negative `min-stars`, `max-history`, `top-repos`, `chart-max-points` are accepted. `chart-max-points: 0` is a meaningful value (full history at weekly resolution) and must survive `??`.
- `parseDecimal` (only `chart-line-width`) uses `parseFloat` and requires finite **and > 0**; `'0'`, `'-1'`, `'1e999'` are rejected.
- `parseNotificationThreshold` matches `'auto'` **exactly** — no trim, no case-fold. `' auto '` or `'Auto'` falls through to `parseNumber` and is rejected.

**Lists:** `parseList` splits on `,`, trims each segment, drops empties, and returns `undefined` (not `[]`) for empty/whitespace input, so the file value can still win. `toStringList` passes arrays through with `String()` on each entry and **preserves an empty array** — `only_repos: []` in the file yields `[]`, it does not fall back to `DEFAULTS`.

**`chart-custom-milestones`:** `parseNumberList` uses `parseInt` per segment (so `'2500abc'` -> 2500, unlike `parseNumber`), keeps only finite values `> 0`, de-duplicates via `Set`, and sorts **ascending numerically**. Precedence is special-cased: if the *input* is non-empty it wins outright, even when it parses to `[]` — the config-file value is not consulted (loader.ts:439 — a plain ternary on the raw input, not `??`).

**Colours:** `parseHexColor` accepts 3/4/6/8 hex digits with an optional leading `#`, trims, and always returns a lowercased `#`-prefixed string. `parseFileHexColor` accepts strings only.

**Config-file key lookup:** keys are derived mechanically from `Object.keys(DEFAULTS)` via `toSnakeCase`. Both `snake_case` and `kebab-case` are read; `snake_case` wins when both are present. There is no hand-written key map — adding a `Config` field automatically makes it file-readable.

**`sendOnNoChanges`** is excluded from `FILE_CONFIG_KEYS`: input-only, parsed with a bare `parseBool` (an invalid value is silently ignored — no warning).

**Read-only cross-check:** if `readOnly` is true and `notificationThreshold !== 0` (including `'auto'`), `loadConfig` warns that the threshold baseline lives on a branch a read-only run never updates.

## Dependencies
May import: `@actions/core` (loader only), `node:fs`, `node:path`, `js-yaml`, `@domain/types` (`CompareAgainst`, `NotificationMode`), `@i18n` (`LOCALES`, `Locale`). Same-layer imports (`./defaults`, `./parsers`, `./types`) stay relative.
Must never import: `@application/*`, `@infrastructure/*`, `@presentation/*` — config sits below them and importing upward would create a cycle (`@presentation` and `@infrastructure` both import `@config/types`). `parsers.ts` and `types.ts` must stay free of `@actions/core` and `fs`: `types.ts` is imported by pure presentation code, and `parsers.ts` is tested as pure functions.

## action.yml cross-check
`action-inputs.test.ts` mechanically asserts that every `Config` key except `sendOnNoChanges` has a kebab-case input in `action.yml`, that its `default` is empty, and that the only inputs with a non-empty default are exactly `config-path`, `send-on-no-changes` and `smtp-port`. Empty defaults are deliberate: a non-empty default would always beat the config file.

Real defaults therefore live in `defaults.ts` and are only *described* in the `action.yml` prose. Discrepancies found:
- **`visibility` never states its default in `action.yml`.** `DEFAULTS.visibility` is `'all'` (i.e. public + private repos the token can see). Every other enum/number input spells out `(default X)`; this one does not.
- `include-archived`, `include-forks`, `exclude-repos`, `only-repos`, `only-orgs`, `exclude-orgs` and `min-stars` also omit `(default ...)`. Actual values: `false`, `false`, `[]`, `[]`, `[]`, `[]`, `0`.
- `chart-max-points` describes itself as "capped at 365" — that cap is **not** applied here. `loadConfig` passes the raw integer through; the clamp is `MAX_HISTORY_BUCKETS = 365` in `@domain/star-history`.
- `chart-custom-milestones` says it "Requires chart-milestones to be enabled" — that dependency is not enforced in this folder; the two values are resolved independently.
- `smtp-port`'s `'587'` default is duplicated as `DEFAULT_SMTP_PORT` in `@infrastructure/notification/email`, and `config-path`'s `'star-tracker.yml'` is duplicated at `loader.ts:166`. Changing either in `action.yml` alone has no effect.

All other documented defaults match `defaults.ts` exactly.

## Gotchas
- `loadConfigFile` returns `{}` when the file is missing, empty/whitespace-only, unparseable, or parses to anything that is not an object (a bare scalar document fails `typeof parsed !== 'object'`). Otherwise it returns an object containing **every** `FileConfigKey`, with `undefined` for keys absent from the YAML — so `'minStars' in fileConfig` is not a presence test. Use `?? `.
- Config-file parse failures are silent apart from the enum fields: `resolveEnum` is fed `input || fileValue`, so a bad `chart_theme: purple` in the YAML does warn. Everything else only warns on the input side — `parseOrWarn` takes the raw input, and the `chartLineColor`/`chartLineWidth` warnings are gated on `inputChartLineColor`/`inputChartLineWidth` (loader.ts:240, loader.ts:250). A bad `min_stars: "abc"` in the YAML falls back to the default with no warning at all.
- An unquoted hex colour in YAML (`chart_line_color: 123456`) is parsed by js-yaml as the *number* 123456; `parseFileHexColor` only accepts strings, so it silently becomes `DEFAULTS.chartLineColor`. Quote it. `action.yml`'s description warns about the `#`-starts-a-comment half of this trap but not the numeric half.
- `resolveEnum` (loader.ts:86) takes `input || fileValue`, so an empty string means "not set" and returns the fallback **without** warning. Only a non-empty, non-matching value warns.
- `formatChoices` produces the Oxford-comma warning text asserted verbatim in the tests (`'Invalid locale "fr". Must be "en", "es", "ca", or "it". Falling back to "en"'`). Changing the wording breaks `loader.test.ts`.
- `parseOrWarn`'s message is deliberately `Invalid <name> "<value>". Ignoring it.` — it does not name a fallback, because the config file may still supply one (`loader.test.ts` "does not name a fallback the config file may override").
- `FileConfig`'s type mapping (`Config[K] extends string ? string : Config[K]`) means file values are typed as `string` for the enum fields, which is why they can be fed straight into `resolveEnum`.
- Never add a `default:` to an overridable input in `action.yml` — `action-inputs.test.ts` fails, and the config file would stop working.

## Testing
- `loader.test.ts` (~1120 lines) — the specification for this folder. Mocks `@actions/core` and `fs`, then pins down: every parser's edge cases, `loadConfigFile` key casing and YAML failure modes, input-over-file precedence, the throwing cases (`visibility`, `data-branch` accept/reject tables), every enum's warn-and-fall-back path, the `chart-custom-milestones` precedence rules, and the read-only/threshold warning.
- `action-inputs.test.ts` — reads the real `action.yml` off disk; see the cross-check section above. It only asserts that `action.yml` *covers* every overridable `Config` key; extra inputs that are not `Config` keys (`github-token`, `github-api-url`, the `smtp-*`/`email-*` group) are not flagged.

Run just this folder: `pnpm vitest run src/config`.
