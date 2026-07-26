# src/shared — cross-cutting code that belongs to no layer

`shared/` is the escape hatch for code that every layer may reach for but that is not domain logic,
configuration, rendering or I/O. Today it contains exactly one thing: `testing/`, the fixture factories used
by `*.test.ts` files across the whole tree. It is deliberately almost empty — putting something here is a
statement that it has no owning layer, and that claim is usually wrong.

## Files
This folder holds no `.ts` files of its own. Its only content is the sub-folder
[`testing/`](./testing/CLAUDE.md).

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
