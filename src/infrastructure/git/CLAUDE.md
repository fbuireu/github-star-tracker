# src/infrastructure/git — git CLI wrapper and the orphan data-branch worktree

This folder owns every invocation of the `git` binary. It provides one thin, shell-free process runner
(`commands.ts`) and the lifecycle of the *data branch worktree* (`worktree.ts`): a second working directory,
checked out from an orphan branch, into which the rest of the action writes its persisted files. It does not
know what those files are (that is `@infrastructure/persistence`), it never pushes and its only commit is the
`--allow-empty` one that initializes a brand-new orphan branch (data commits are `commitAndPush` in
`@infrastructure/persistence/storage`), and it reads no Action inputs — the branch name is passed in.

## Files
| File | Responsibility |
| --- | --- |
| `commands.ts` | Run `git` via `execFileSync` with an argv array, trim stdout, wrap failures in a readable `Error`. |
| `worktree.ts` | Create/refresh the data-branch worktree (`initializeDataBranch`) and tear it down (`cleanup`). |

## Public API

### `commands.ts`
```ts
interface ExecuteParams { args: string[]; options?: Record<string, unknown> }
export function execute({ args, options = {} }: ExecuteParams): string
```
The single entry point for running git. `args` is an argv array — never a command string. `options` is
spread over `{ encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }`, so `{ cwd }` is the usual override.
Returns trimmed stdout. Consumed inside this folder by `worktree.ts` and, from the same layer, by
`@infrastructure/persistence/storage` (relative import `../git/commands`). No other layer may call it.

### `worktree.ts`
```ts
interface InitializeDataBranchParams { dataBranch: string; readOnly?: boolean }
export function initializeDataBranch({ dataBranch, readOnly = false }: InitializeDataBranchParams): string
export function cleanup(dataDir: string): void
```
- `initializeDataBranch` — call once per run, before any read/write of persisted data. Returns the worktree
  path (`dataDir`) to hand to every `@infrastructure/persistence/storage` function.
- `cleanup` — call in a `finally`. Never throws.

Both are consumed only by `@application/tracker`, which wraps them in its own `withDataDir` helper.
`ensureGitRepository` is module-private.

## Invariants & rules
- **`dataDir` is derived, never hardcoded**: `` const dataDir = `.${dataBranch}` `` (`worktree.ts:25`). With the
  default `data-branch: star-tracker-data` this is `.star-tracker-data`. Any code that needs the directory
  must use the value **returned** by `initializeDataBranch`, not a literal.
- `dataDir` is a **relative, dot-prefixed** path inside the primary checkout. Git subcommands that must run
  *in* the worktree are given `options: { cwd: path.resolve(dataDir) }`; the resolve is required because a
  relative `cwd` would be interpreted against the process cwd, not the repo root.
- **Order of operations in `initializeDataBranch` is load-bearing**:
  1. `rev-parse --is-inside-work-tree` guard,
  2. `config user.name` / `config user.email`,
  3. remote branch probe,
  4. stale-worktree removal,
  5. read-only guard,
  6. create-orphan **or** fetch+add.
  Steps 2 and 4 therefore run even on a read-only run and even on a run that is about to throw.
- **Commit identity** is written to the repository's *local* config (no `--global`, no `cwd`) as
  `github-actions[bot]` / `github-actions[bot]@users.noreply.github.com`. It is set here, not in
  `commitAndPush`, so it must not be removed from this function.
- **Branch existence** is probed with `ls-remote --exit-code --heads origin <dataBranch>`; a non-zero exit
  (branch absent) is caught, logged via `core.info`, and only sets `branchExists = false`. It is never fatal.
- **Branch missing + `readOnly: true` → throw** before any worktree is created (`worktree.ts:49-53`). A
  read-only run may never bring the data branch into existence.
- **Branch missing + writable run** → orphan creation: `worktree add --detach <dataDir>`,
  `checkout --orphan <dataBranch>`, `rm -rf .` (failure swallowed — a fresh orphan may have nothing to remove),
  then `commit --allow-empty -m 'Initialize star tracker data'`. The branch exists **locally only** at this
  point; it reaches the remote on the first `commitAndPush`.
- **Branch present** → `fetch origin <dataBranch>` then `worktree add <dataDir> origin/<dataBranch>`. The
  commit-ish is a remote-tracking ref, so HEAD in the worktree is detached — which is exactly why
  `commitAndPush` pushes the refspec `HEAD:<dataBranch>` and not a branch name. Do not "fix" either half in
  isolation.
- A pre-existing `dataDir` (leftover from a crashed run) is removed with `worktree remove --force` guarded by
  `fs.existsSync`; failure is downgraded to `core.debug` and execution continues.
- `cleanup` is best-effort and idempotent: a failure is `core.debug`-logged, never rethrown, so it is safe in
  a `finally` even when the body already threw.
- `execute` **trims** its return value. Callers that need exact whitespace do not exist today; adding one
  requires changing the wrapper, not the caller.
- `execute` uses `execFileSync`, **not** a shell. Arguments containing `;`, quotes, `$`, spaces or newlines are
  passed verbatim to git (pinned by `commands.test.ts`). Never reintroduce string interpolation into a shell
  command here — commit messages and branch names are user-controlled.
- `stdio` is `['pipe','pipe','pipe']`: git never writes directly to the Action log. Anything a user must see
  has to be surfaced through `@actions/core` explicitly.
- Failure message format is fixed: `` `Git command failed: "git ${args.join(' ')}"\n${detail}` `` where
  `detail` is trimmed `stderr`, else `message`, else `'Unknown error'`. **The full argv is embedded in the
  message** — see Gotchas.

## Dependencies
- `commands.ts` imports only `node:child_process`. Keep it that way: it is the lowest-level primitive and has
  no `@actions/core` dependency, which is what makes it trivially unit-testable.
- `worktree.ts` may import `node:fs`, `node:path`, `@actions/core` and `./commands` (same folder, relative).
- Must never import `@domain/*`, `@presentation/*`, `@application/*` or `@config/*`. The branch name and the
  read-only flag arrive as parameters; this folder does not read Action inputs or config files.

## Gotchas
- **Secrets can land in error text.** `execute` puts every argument into the thrown message. `commitAndPush`
  passes the base64 push credential as `-c http.extraheader=...`, so a push failure produces an error string
  containing it. That is only safe because `core.setSecret` is called on the credential *before* the push.
  Any new call that passes a secret in argv must do the same.
- The action **requires an `actions/checkout` step**; `ensureGitRepository` converts git's opaque
  "not in a git directory" into that instruction (`worktree.ts:10-13`). Do not swallow it.
- `.<dataBranch>` is a hidden directory sitting inside the primary checkout for the duration of the run. Tools
  that walk the workspace (linters, upload-artifact globs, other actions) will see it until `cleanup` runs.
- `checkout --orphan` is run with `cwd` set to the worktree; running it without `cwd` would orphan the *main*
  checkout's HEAD.
- `worktree.test.ts` drives `execFileSync` with positional `mockReturnValueOnce`/`mockImplementationOnce`
  chains. Adding, removing or reordering a single git call in `initializeDataBranch` shifts every subsequent
  mock and breaks tests that look unrelated.

## Testing
| File | Pins down |
| --- | --- |
| `commands.test.ts` | Output trimming; argv-array (never shell-string) invocation; verbatim passthrough of shell metacharacters; the three failure-detail branches (stderr / message / `Unknown error`). |
| `worktree.test.ts` | Identity config calls; `.star-tracker-data` return value; the checkout-missing error message; stale-worktree removal and its graceful failure; orphan creation on a missing remote branch; the read-only refusal (asserting `checkout --orphan` is never reached); `cleanup` swallowing removal failures. |

Run just this folder: `pnpm vitest run src/infrastructure/git`
