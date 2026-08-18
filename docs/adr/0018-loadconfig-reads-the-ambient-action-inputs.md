# 18. loadConfig reads the ambient action inputs

Date: 2026-08-18

## Status

Accepted

## Decision-shaped question this answers

Should `loadConfig()` take the action inputs and the config-file contents as parameters instead of reading
`core.getInput` and `node:fs` itself?

## Context

`loadConfig()` takes no arguments. It reads `core.getInput` at five sites and `node:fs` at two, both inside
`loadConfigFile`. Every one of the ~90 `loadConfig` cases in `loader.test.ts` therefore goes through
`vi.mock('@actions/core')` and `vi.mock('node:fs')` plus a local `mockInputs` helper, and `loader.test.ts` is
the largest test file in the tree.

That reads like the textbook case for accepting dependencies rather than creating them, and two separate
reviews have proposed it. The arithmetic does not support it.

Parameterising `loadConfig({ inputs, file })` deletes **49 lines**, of which 27 are the same
`vi.mocked(fs.existsSync).mockReturnValue(true);` repeated. It deletes **zero test cases**. The 29
`readFileSync` sites and the 51 `mockInputs` sites are not deletions: the YAML and the input object relocate
from a mock call into an argument, and in the 27 cases that set both they merge into one nested literal that
is longer than the two lines it replaces.

Two things then survive that the change is supposed to remove:

- **The reporter.** `core.warning` fires from five sites *inside* the resolution, and 18 test sites assert its
  wording verbatim — the Oxford comma in the enum message is pinned deliberately. Parameterising the I/O
  leaves `vi.mock('@actions/core')` exactly where it was, so the file still has a mock and the
  "no ambient dependencies" story is two-thirds true at best. Threading a `reporter` parameter instead means
  five more signatures — `FieldContext`, `FieldResolver`, `scalarField`, `resolveEnum`, `loadConfigFile` — to
  turn one assertion style into another of the same length.
- **The caller.** `resolveTabledFields` derives roughly forty input names mechanically from
  `Object.keys(FIELD_SOURCES)` and `toActionInputName`. For `@application/tracker` to hand `loadConfig` a
  `Record<string, string>` it has to enumerate those names, so `TABLED_KEYS` becomes public and the
  orchestrator relearns every input. That is the coupling
  [ADR 0016](./0016-the-report-renderers-read-config-themselves.md) removed. The escape — passing a
  `(name: string) => string` function — is `core.getInput` itself under another name, which is the dependency
  injection the "simplify arch and di" commit deliberately walked back.

A narrower version exists and is the best of the options: `loadConfigFile` is already *exported*, so making it
a parameter of `loadConfig` would let the test substitute it and retire all 27 `existsSync` lines — 55% of the
available deletion, with no reporter question. It still requires `loadConfig` to take an argument, so it still
lands on the caller problem above.

## Decision

`loadConfig()` stays zero-argument and keeps reading the ambient action inputs and the config file.

`@config` is defined in [ADR 0004](./0004-layered-source-structure.md) as an impure layer whose side effect is
exactly this: reading the action inputs and one YAML file. A module whose stated job is "read the ambient
inputs" reading them ambiently is the truthful shape, not an accident.

## Consequences

- **`loader.test.ts` keeps two `vi.mock` prologues and its `mockInputs` helper**, and stays the largest test
  file in the tree. That is the accepted cost.
- **The seam that does exist stays unused.** `loadConfigFile` is exported and separately tested, but
  `loadConfig` calls it as a module-local, so the test mocks `node:fs` a level below it. Anyone tempted to
  "use the seam that is already there" should read the caller paragraph above first.
- **This is a decision about `@config` only.** Every other impure module in the tree does accept its
  dependencies — `getRepos({ octokit, config })`, `withDataBranch({ … })`, `sendEmail({ emailConfig, … })`.
  `loadConfig` is the exception because it is the layer that owns input reading, not a consumer of it.
- The parser half of the old `loader.test.ts` now lives in `parsers.test.ts`, colocated with the module it
  covers. Those 233 lines never needed a mock at all, and their presence in the loader's test overstated how
  much of that file the ambient reads were responsible for.
