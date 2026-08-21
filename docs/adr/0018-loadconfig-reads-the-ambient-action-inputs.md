# 18. loadConfig reads the ambient action inputs

Date: 2026-08-18

## Status

Accepted

This entry records a **rejected refactor**, not a hard-to-reverse commitment. Measured against the project's
own bar (hard to reverse, surprising without context, the result of a real trade-off), it clears the second
and third and fails the first outright: parameterising `loadConfig` is a mechanical change to one module and
its test, reversible in an afternoon. It is kept because the proposal has been made twice and would otherwise
be made a third time, and because the reasoning against it is not obvious from reading the code. Read it as
"here is why this was not done", not as "here is a boundary you must not cross".

## Context

Should `loadConfig()` take the action inputs and the config-file contents as parameters instead of reading
`core.getInput` and `node:fs` itself?

`loadConfig()` takes no arguments. It reads `core.getInput` at six sites in `src/config/loader.ts`: one
inside `resolveTabledFields`, which runs it once per tabled key, and five standalone reads for `visibility`,
`data-branch`, `chart-custom-milestones`, `config-path` and `send-on-no-changes`. It reads `node:fs` at two,
both inside `loadConfigFile`. Every one of the ninety-four `loadConfig()` call sites in `loader.test.ts`
therefore goes through `vi.mock('@actions/core')` and `vi.mock('node:fs')` plus a local `mockInputs` helper.

That reads like the textbook case for accepting dependencies rather than creating them, and two separate
reviews have proposed it. The arithmetic does not support it.

Parameterising `loadConfig({ inputs, file })` deletes setup lines, not test cases: the largest single block
is the 27 repetitions of `vi.mocked(fs.existsSync).mockReturnValue(true);`. It deletes **zero** of the 100
`it` blocks. The 29 per-test `vi.mocked(fs.readFileSync)` sites and the 51 `mockInputs` sites are not
deletions either: the YAML and the input object relocate from a mock call into an argument, and in the 27
cases that set both they merge into one nested literal that is longer than the two lines it replaces.

Two things then survive that the change is supposed to remove:

- **The reporter.** `core.warning` fires from five sites *inside* the resolution, and 18 sites in
  `loader.test.ts` assert its wording verbatim; the Oxford comma in the enum message is pinned deliberately.
  Parameterising the I/O leaves `vi.mock('@actions/core')` exactly where it was, so the file still has a mock
  and the "no ambient dependencies" story is two-thirds true at best. Threading a `reporter` parameter
  instead means five more signatures (`FieldContext`, `FieldResolver`, `scalarField`, `resolveEnum`,
  `loadConfigFile`) to turn one assertion style into another of the same length.
- **The caller.** `resolveTabledFields` derives the 34 tabled input names mechanically from
  `Object.keys(FIELD_SOURCES)` and `toActionInputName`. For `@application/tracker` to hand `loadConfig` a
  `Record<string, string>` it has to enumerate those names, so `TABLED_KEYS` becomes public and the
  orchestrator relearns every input. That is the coupling
  [ADR 0016](./0016-the-report-renderers-read-config-themselves.md) removed. The escape, passing a
  `(name: string) => string` function, is `core.getInput` itself under another name, which is the dependency
  injection the "simplify arch and di" commit deliberately walked back.

A narrower version exists and is the best of the options: `loadConfigFile` is already *exported*, so making it
a parameter of `loadConfig` would let the test substitute it and retire all 27 `existsSync` lines, with no
reporter question. It still requires `loadConfig` to take an argument, so it still lands on the caller
problem above.

## Decision

**A module that owns a group of action inputs reads that group ambiently.** It does not accept the raw
values as parameters, and its callers do not learn the input names.

`loadConfig()` stays zero-argument and keeps reading the ambient action inputs and the config file.
`@config` is defined in [ADR 0004](./0004-layered-source-structure.md) as an impure layer whose side effect is
exactly this: reading the action inputs and one YAML file. A module whose stated job is "read the ambient
inputs" reading them ambiently is the truthful shape, not an accident.

`@config` is the largest instance of that rule but not the only one, and the earlier framing of this ADR,
that `@config` was the sole exception in an otherwise dependency-injected tree, was simply wrong about the
code:

- **`getEmailConfig` in `src/infrastructure/notification/email.ts` reads six ambient inputs**: `smtp-host`,
  `smtp-port`, `smtp-username`, `smtp-password`, `email-to` and `email-from`. It takes only a `Locale`, for
  the default `from` name. It owns the SMTP input group the way `loadConfig` owns the tracking one, and it
  calls `core.setSecret` on the password, which is a reason to keep the read where the value is produced
  rather than passing a secret through the orchestrator.
- **`trackStars` reads `github-token` and `github-api-url` ambiently** before constructing Octokit. Those two
  are not in `Config` at all.

Everything downstream of an input group *does* accept its dependencies: `getRepos({ octokit, config })`,
`withDataBranch({ … })` and `sendEmail({ emailConfig, … })` are all handed what they need. The line is
between reading an input group and consuming one, not between `@config` and the rest of the tree.

## Consequences

- **`loader.test.ts` keeps two `vi.mock` prologues and its `mockInputs` helper.** That is the accepted cost,
  and it is smaller than it was recorded as being: at 933 lines the file is the *second* largest test file in
  the tree, behind `svg-chart.test.ts` at 1153. The earlier claim that it was the largest was the headline
  cost of this decision and it was false, which weakens the argument by exactly that much: the cost is real
  but ordinary, and it is worth re-checking rather than assuming if this is ever reconsidered.
- **The seam that does exist stays unused.** `loadConfigFile` is exported and separately tested, but
  `loadConfig` calls it as a module-local, so the test mocks `node:fs` a level below it. Anyone tempted to
  "use the seam that is already there" should read the caller paragraph above first.
- **Adding an input group means adding another ambient reader, not another parameter.** `getEmailConfig` is
  the precedent to copy: one function, one group, read at the point of use, with the caller told nothing
  about input names.
- The parser half of the old `loader.test.ts` now lives in `parsers.test.ts`, colocated with the module it
  covers. Those 246 lines never needed a mock at all, and their presence in the loader's test overstated how
  much of that file the ambient reads were responsible for.
