# 20. Overridable inputs declare an empty default

Date: 2026-08-21

## Status

Accepted

## Context

Every tracking option can be set two ways: as an action input in the workflow, or as a key in
`star-tracker.yml` on the code branch. The intended precedence is input first, then config file, then a
built-in default, and `resolveTabledFields` in [`src/config/loader.ts`](../../src/config/loader.ts) implements exactly that: it reads
`core.getInput(name)`, falls back to `fileConfig[key]`, and falls back again to `DEFAULTS[key]`.

That chain rests on one property GitHub Actions does not provide. **`core.getInput` cannot distinguish "the
user did not set this input" from "the user left it at the default the manifest declares".** Both arrive as
the same string. So the moment [`action.yml`](../../action.yml) declares a real `default:` for an option, `core.getInput` returns
that value on every run, the first link in the chain always matches, and the config file can never win. The
config file would still parse, still validate, still warn about bad values, and still be silently ignored.

Declaring the defaults in the manifest is the obvious thing to do and is what almost every action does. It is
also what makes the second configuration surface a lie, and the failure is invisible: no error, no warning,
just an option that does not take effect.

## Decision

**An input that the config file may override declares `default: ''` in `action.yml`.** The real default
lives in `DEFAULTS` in [`src/config/defaults.ts`](../../src/config/defaults.ts), which is the last link of the resolution chain and the only
place any of these values is written down as a value.

Only the three inputs with **no** config-file counterpart carry a non-empty default, because for them there
is no precedence to protect: `config-path` (`'star-tracker.yml'`), `send-on-no-changes` (`'false'`) and
`smtp-port` (`'587'`).

The manifest still tells the reader what the default is, in prose rather than in the `default:` key. Every
overridable input's `description` ends with `(default X) (overrides config file)`, so the workflow author
reading the marketplace listing sees both the value and the fact that the YAML file can change it.

The rejected alternative is a sentinel default, some reserved string meaning "unset". It replaces an
invisible precedence bug with a visible magic value in every user's workflow file and in every parser, and
`''` is already the sentinel GitHub hands out for free.

## Consequences

- **The manifest stops self-documenting its defaults**, which is the cost. `action.yml` shows `default: ''`
  for 43 of its 47 inputs; the other four are the three above and `github-token`, which declares no default
  at all because it is required. Anyone reading the manifest for a real value must read the description prose
  or `src/config/defaults.ts`. Two tests are what keep that prose honest:
  - [`src/config/action-inputs.test.ts`](../../src/config/action-inputs.test.ts) asserts that every key of `DEFAULTS` except `sendOnNoChanges` has an
    input whose default is empty, and that the complete set of inputs carrying a non-empty default is exactly
    `config-path`, `send-on-no-changes` and `smtp-port`. Adding a default to an overridable input fails it.
  - [`docs/docs-consistency.test.ts`](../docs-consistency.test.ts) parses `(default X)` out of each description and compares it against the
    matching `DEFAULTS` value, and separately requires every overridable input to say `(overrides config
    file)`. Changing a default in `defaults.ts` without changing the prose fails it.
- **This is hard to reverse in the direction that matters.** Giving the manifest real defaults is a one-line
  edit per input that breaks no test at the type level and produces no error at runtime; it silently flips
  precedence for every existing user whose `star-tracker.yml` sets that option, and the symptom they see is
  "my config file stopped working" with nothing in the log. The two tests above exist because this is a
  change that cannot be caught by reading the diff.
- **A new overridable input is four edits, not three**: the `action.yml` entry with an empty default and the
  `(default X) (overrides config file)` prose, the `Config` field, the `DEFAULTS` entry, and the
  `FIELD_SOURCES` resolver. Skipping the empty default is the one of those the compiler will not catch.
- **An empty string can never be a meaningful value for an overridable input**, since it is indistinguishable
  from "unset". Any option that genuinely needs "explicitly nothing" needs a different representation, which
  is why the list-valued inputs treat empty as "no filter" rather than as an error.
- Where this bites is recorded in the *Gotchas* section of the root [`CLAUDE.md`](../../CLAUDE.md) and in
  [`src/config/CLAUDE.md`](../../src/config/CLAUDE.md), and the precedence itself is documented for users in
  [`docs/wiki/Configuration.md`](../wiki/Configuration.md).
