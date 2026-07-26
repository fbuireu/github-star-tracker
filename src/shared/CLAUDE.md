# src/shared — cross-cutting code that belongs to no layer

`shared/` is the escape hatch for code that every layer may reach for but that is not domain logic,
configuration, rendering or I/O. It is deliberately almost empty — putting something here is a statement
that it has no owning layer, and that claim is usually wrong.

## Files
| File | Responsibility |
| --- | --- |
| `testing/` | Fixture factories used by `*.test.ts` files across the whole tree — see [`testing/CLAUDE.md`](./testing/CLAUDE.md). |
| `docs-consistency.test.ts` | Guards the documentation set against the repo: no dead markdown links, no citation of a source or test file that does not exist, no sample chart embedded in `examples/README.md` without the SVG, and every `action.yml` input and output named on the surfaces that list them. It also holds the ADR set to [`docs/adr/0000-adr-template.md`](../../docs/adr/0000-adr-template.md): sequential numbering from the template, `NNNN-kebab-title.md` filenames, the `# N. Title` / date / status / *Context* / *Decision* / *Consequences* shape, no reference to an ADR that does not exist, a row in the `ARCHITECTURE.md` index, and — the one that rots quietly — a link from some document **other** than that index, since an ADR only the index points at will not be read. It ships no production code and lives here because it belongs to no layer — it is about the repo as a whole. Keep its assertions **aggregated** (one failing list per rule) rather than `it.each` per document, so it stays a handful of tests instead of dominating the suite. |

## Invariants & rules
The alias convention itself (`@shared/*`, mapped to `./src/shared/*` in `tsconfig.json`) and the layer
table live in [`../CLAUDE.md`](../CLAUDE.md). What is specific to this folder:

- **Nothing in `shared` may import `@application/*`, `@infrastructure/*` or `@presentation/*`.** It sits
  below them; importing upward would create a cycle and drag I/O into files that tests load eagerly.
- **`shared` must not accumulate domain logic.** If a helper reasons about stars, snapshots, deltas,
  forecasts or dates-as-business-data, it belongs in `@domain` — that is where the pure logic lives and where
  the tests for it are expected to be. `shared` is for things with no business meaning.
- **Anything added here needs a reason why no existing layer owns it.** Formatting → `@domain/formatting`.
  Config parsing helpers → `@config/parsers`. Rendering primitives → `@presentation/shared`. Git/fs/HTTP →
  `@infrastructure`. If one of those fits, use it.

## Dependencies
May import `@config/*`, `@domain/*` and `@i18n`. Today `testing/` actually imports only `@config/defaults`
(a value), `@config/types` and `@domain/*` (types) — the list src/CLAUDE.md's layer table records. Must not
import `@application/*`, `@infrastructure/*` or `@presentation/*`. External runtime packages should not
appear here at all.

## Testing
Nothing in `shared/` is production code, so it is excluded from coverage
(`src/shared/testing/**` in `vitest.config.ts`) and has no tests of its own — it is exercised indirectly by
every suite that imports a factory.
