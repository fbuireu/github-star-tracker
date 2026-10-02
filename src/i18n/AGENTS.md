# src/i18n

The text a Report, Chart, Badge or Notification shows: the JSON bundles (`en`, `es`, `ca`, `it`), the `Locale`
union, the map from those short codes to the BCP-47 codes `Intl` needs, and a `{placeholder}` interpolator. It is
the tree's only true leaf: it imports nothing from any other layer, so every layer but `shared` may import it, `domain`
included. It does no number or date formatting (`@domain/formatting`) and no escaping.

[`index.ts`](./index.ts) is the public surface, [`types.ts`](./types.ts) holds `Translations` (nested, all leaves `string`, no optional
keys) and the bundles sit beside them as `.json`, typed by the `Record<Locale, Translations>` annotation.

## Invariants & rules

- Placeholder syntax is exactly `/\{(\w+)\}/g`: one brace pair around `[A-Za-z0-9_]+`. No spaces, no
  dots, no nesting, no `{{ }}`. `{first name}` and `{user.name}` are not placeholders and pass through
  untouched.
- Unknown placeholders are left verbatim. A miss returns the original `{key}` text, never `undefined` or
  an empty string. Values are coerced with `String(...)`, so `{count: 0}` renders `0`.
- `interpolate` escapes nothing, deliberately. `@presentation/html` passes full `<a href=…>` markup as the
  footer params, so adding escaping here would double-escape every Report.
- `getTranslations` returns the shared bundle object, not a copy: every caller gets the same object graph.
- The fallback is `en`, reached through `Object.hasOwn`, so a prototype key such as `toString` falls back
  too. Because `Locale` is a closed union this only fires for a value that dodged the type system at
  runtime; `@config/loader` already validates the input against `LOCALES` and warns first.
- `LOCALES` order is `en, es, ca, it`, derived from the locale map and pinned by a test. It is the order
  shown in the loader's "Must be …" warning, so reordering the map changes user-visible output.
- **Every locale-map value must match `/^[a-z]{2}-[A-Z]{2}$/`** (pinned by a test), because it goes straight
  to both `Date#toLocaleDateString` and `Intl.NumberFormat` in `@domain/formatting`.
- **`report.title` must differ in every bundle**: `index.test.ts` iterates `LOCALES` and tells a bundle of its
  own from the English fallback by that title, so a translation that keeps the English one fails.
- **Locale affects text, dates *and* compact numbers.** `formatCount` builds its `Intl.NumberFormat` from
  `LOCALE_MAP[locale]`, so 1,200 renders `1.2K` in `en`, `1,2 mil` in `es`, `1,2 k` in `ca` and `1,2K` in
  `it`. Only the `en` form is pinned: [`formatting.test.ts`](../domain/formatting.test.ts) asserts the English string and that the Italian
  one merely differs from it, under the name *follows the report locale instead of always using English*.
  The others come out of the ICU data Node ships, so a runtime bump can change them with no test
  failing; re-check them rather than trusting this line. In `es` and `ca` the separator before the suffix is
  a non-breaking space (U+00A0), not the ordinary space printed above. That reaches further than wording,
  because `@presentation/badge` derives its widths from the **rendered** length: `★ 1,2 mil` is
  three characters wider than `★ 1.2K`.

## Adding a locale

1. Create `src/i18n/<code>.json` with **every** key of `Translations`: copy [`en.json`](./en.json) and translate, keeping
   the placeholder names identical.
2. Import it in `index.ts`, add `xx: 'xx-XX'` to the locale map, and add `xx` to the `TRANSLATIONS` literal
   (shorthand, so the key must equal the import name).
3. Add `xx` to the two locale lists the tests spell out: the `LOCALES` order in [`index.test.ts`](./index.test.ts)
   and the *Invalid locale* warning in [`loader.test.ts`](../config/loader.test.ts).
4. Update the `locale` input description in [`action.yml`](../../action.yml) and every document that lists the
   locales. *Adding a New Locale* in
   [`docs/wiki/Internationalization-(i18n).md`](<../../docs/wiki/Internationalization-(i18n).md>) names them
   all, the README's among them.

`LOCALES` and `Locale` derive themselves from the locale map, so the source holds no second list. The type
system enforces **completeness but not exactness**: a missing bundle or a missing/mistyped key is a compile
error, while *extra* keys in a JSON file pass `pnpm typecheck`, because an imported module is not a fresh
object literal and no excess-property check applies. `index.test.ts` catches them instead: its key, title
and Intl-code checks iterate `LOCALES`, so they cover the new locale with no edit.

## Gotchas

- `@i18n` is a file alias, not a glob, which is why `index.ts` re-exports `Translations` from `./types`.
  `@i18n/types` does not resolve; any new type consumers need must be re-exported the same way.
- **The placeholder regex must keep its `g` flag.** `String.prototype.replaceAll` throws at runtime when
  handed a non-global regex.
- Which strings carry placeholders is not obvious from the key names; the report, email subject, footer,
  stargazer and forecast groups and the `velocity.projection` key all have some. Check the bundle before assuming a string
  is literal.
