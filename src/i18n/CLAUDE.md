# src/i18n

The only place user-facing text lives: four JSON bundles (`en`, `es`, `ca`, `it`), the `Locale` union, the
map from those short codes to the BCP-47 codes `Intl` needs, and a `{placeholder}` interpolator. It is the
tree's only true leaf — it imports nothing from any other layer, because every other layer (including
`domain`) depends on it. It does no number or date formatting (`@domain/formatting`) and no escaping.

`index.ts` is the public surface, `types.ts` holds `Translations` (nested, all leaves `string`, no optional
keys) and the bundles sit beside them as `.json`, typed by the `Record<Locale, Translations>` annotation.

## Invariants & rules

- **Placeholder syntax is exactly `/\{(\w+)\}/g`** — one brace pair around `[A-Za-z0-9_]+`. No spaces, no
  dots, no nesting, no `{{ }}`. `{first name}` and `{user.name}` are not placeholders and pass through
  untouched.
- **Unknown placeholders are left verbatim.** A miss returns the original `{key}` text, never `undefined` or
  an empty string. Values are coerced with `String(...)`, so `{count: 0}` renders `0`.
- **`interpolate` escapes nothing, deliberately.** `@presentation/html` passes full `<a href=…>` markup as the
  footer params, so adding escaping here would double-escape every report.
- **Never build a sentence by concatenation** — add a key with placeholders instead.
- **`getTranslations` returns the shared bundle object, not a copy.** Every caller gets the same object graph;
  never mutate `t`.
- **The fallback is `en`.** Because `Locale` is a closed union this only fires for a value that dodged the
  type system at runtime; `@config/loader` already validates the input against `LOCALES` and warns first.
- **`LOCALES` order is `en, es, ca, it`**, derived from the locale map and pinned by a test. It is the order
  shown in the loader's "Must be …" warning, so reordering the map changes user-visible output.
- **Every locale-map value must match `/^[a-z]{2}-[A-Z]{2}$/`** (pinned by a test), because it goes straight
  to `Date#toLocaleDateString` in `@domain/formatting`.
- **`report.title` must be non-empty in every bundle** — a test iterates `LOCALES` and asserts truthiness.
- Locale affects text and date formatting only. `formatCount` uses a fixed `'en'` compact number format, so
  `1.2K` is identical in every locale.

## Adding a locale

1. Create `src/i18n/<code>.json` with **every** key of `Translations` — copy `en.json` and translate, keeping
   the placeholder names identical.
2. Import it in `index.ts`, add `xx: 'xx-XX'` to the locale map, and add `xx` to the `TRANSLATIONS` literal
   (shorthand, so the key must equal the import name).
3. Update the `locale` input description in `action.yml` and the README's locale row.

`LOCALES` and `Locale` derive themselves from the locale map — there is no second list to maintain. The type
system enforces **completeness but not exactness**: a missing bundle or a missing/mistyped key is a compile
error, while *extra* keys in a JSON file are silently accepted, because an imported module is not a fresh
object literal and no excess-property check applies. So `pnpm typecheck` is the check that matters here.
`index.test.ts` starts covering the new locale automatically, since it iterates `LOCALES`.

## Gotchas

- **`@i18n` is a file alias, not a glob**, which is why `index.ts` re-exports `Translations` from `./types`.
  `@i18n/types` does not resolve; any new type consumers need must be re-exported the same way.
- **The placeholder regex must keep its `g` flag.** `String.prototype.replaceAll` throws at runtime when
  handed a non-global regex. It is a module-level literal reused across calls, safe only because `replaceAll`
  resets `lastIndex` — do not switch it to `.exec()`/`.test()` in a loop.
- Which strings carry placeholders is not obvious from the key names; the report, email subject, velocity
  projection, footer, stargazer and forecast groups all have some. Check the bundle before assuming a string
  is literal.
