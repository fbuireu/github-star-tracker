# src/i18n — translation bundles, locale codes and string interpolation

The only place user-facing text lives. It owns the four JSON bundles, the `Locale` union, the mapping from
those short codes to BCP-47 codes used by `Intl`, and a two-line `{placeholder}` interpolator. It is a leaf:
it imports nothing from any other layer, does no formatting of numbers or dates (that is `@domain/formatting`),
does no escaping, and knows nothing about markdown, HTML or email.

## Files
| File | Responsibility |
| --- | --- |
| `index.ts` | Public surface: `LOCALE_MAP`, `Locale`, `LOCALES`, `TRANSLATIONS` lookup via `getTranslations`, and `interpolate`. |
| `types.ts` | `Translations` (the full key tree every bundle must supply) and `InterpolateParams`. |

Non-`.ts` files in the folder: `en.json`, `es.json`, `ca.json`, `it.json` — one bundle per locale, each
typed against `Translations` by the `Record<Locale, Translations>` annotation in `index.ts`.

## Public API

### `index.ts`
```ts
const LOCALE_MAP: { readonly en: 'en-US'; readonly es: 'es-ES'; readonly ca: 'ca-ES'; readonly it: 'it-IT' }
type Locale = keyof typeof LOCALE_MAP            // 'en' | 'es' | 'ca' | 'it'
const LOCALES: Locale[]                          // ['en', 'es', 'ca', 'it']

function getTranslations(locale: Locale): Translations
function interpolate({ template, params }: InterpolateParams): string
export type { Translations } from './types'
```

- `getTranslations` — call once per render pass, bind to `t`, then read `t.report.title` etc. Used by
  `@application/tracker`, `@infrastructure/notification/email`, and the `@presentation` modules `badge`,
  `chart`, `charts`, `html`, `markdown`, `shared` and `svg-chart`.
- `interpolate` — fill `{placeholder}` slots in a bundle string. Never build a sentence by concatenation;
  add a key with placeholders instead.
- `LOCALE_MAP` — consumed by `@domain/formatting` (`formatDate`, via `LOCALE_MAP[locale] || LOCALE_MAP.en`)
  to get the `Intl` code.
- `LOCALES` — consumed by `@config/loader` as the `allowed` list of `resolveEnum` for the `locale` input.
- `Locale` — the type of `Config.locale` (`@config/types`) and of `DEFAULTS.locale` (`'en'`).
- `TRANSLATIONS`, `PLACEHOLDER_PATTERN` and `FALLBACK_LANG` are module-private and stay that way.

## Key types

`InterpolateParams` (`types.ts`):

| Field | Type |
| --- | --- |
| `template` | `string` |
| `params` | `Record<string, string \| number>` |

`Translations` (`types.ts`) — nested, all leaves `string`, no optional keys. Top-level groups:
`badge`, `report` (incl. nested `report.badges.new`), `email`, `trends`, `velocity`, `footer`, `stargazers`,
`forecast`.

Strings that carry placeholders, and the exact names they expect:

| Key | Placeholders |
| --- | --- |
| `report.comparedTo` | `{date}` |
| `report.starsCount` | `{count}` |
| `report.removedRepoText` | `{name}`, `{count}` |
| `email.subjectLine` | `{subject}`, `{totalStars}`, `{delta}` |
| `velocity.projection` | `{days}`, `{milestone}` |
| `footer.generated` | `{project}`, `{date}` |
| `footer.madeBy` | `{author}` |
| `stargazers.newStargazers` | `{count}` |
| `stargazers.starredOn` | `{date}` |
| `stargazers.stargazerCount` | `{count}` |
| `stargazers.sampledNote` | `{repos}` |
| `forecast.week` | `{n}` |

## Invariants & rules
- **Placeholder syntax is exactly `/\{(\w+)\}/g`**: a single brace pair around `[A-Za-z0-9_]+`. No spaces
  inside the braces, no dots, no nesting, no `{{ }}`. `{first name}` and `{user.name}` are not placeholders
  and pass through untouched.
- **Unknown placeholders are left verbatim.** `interpolate` checks `key in params`; a miss returns the
  original `{key}` text rather than `undefined` or an empty string. Pinned by
  `'leaves unmatched placeholders intact'` in `index.test.ts`.
- **Values are coerced with `String(...)`**, so `{count: 0}` renders `0`, not an empty string.
- **`interpolate` does not escape anything.** `@presentation/html` deliberately passes full `<a href=…>`
  markup as the `{project}` and `{author}` params of `footer.generated` / `footer.madeBy`. Adding HTML
  escaping here would double-escape those reports.
- **`getTranslations` returns the shared bundle object, not a copy.** Every caller gets the same object
  graph; never mutate `t`.
- **The fallback is `en`** (`FALLBACK_LANG = TRANSLATIONS.en`), applied via `TRANSLATIONS[locale] || …`.
  Because `Locale` is a closed union, this only fires for a value that dodged the type system at runtime.
  `@config/loader` already validates the `locale` input against `LOCALES` and warns before falling back to
  `DEFAULTS.locale`, so an invalid action input never reaches `getTranslations`.
- **`LOCALES` order is `en, es, ca, it`** — derived from `Object.keys(LOCALE_MAP)` and pinned by the test.
  It is the order shown in the loader's "Must be …" warning, so reordering `LOCALE_MAP` changes user-visible
  output.
- **Every `LOCALE_MAP` value must match `/^[a-z]{2}-[A-Z]{2}$/`** (pinned by test) because it is handed
  straight to `Date#toLocaleDateString` in `@domain/formatting`.
- **`report.title` must be non-empty in every bundle** — the test iterates `LOCALES` and asserts truthiness.
- Locale affects text and date formatting only. `formatCount` in `@domain/formatting` uses a fixed `'en'`
  compact `Intl.NumberFormat`, so `1.2K` is the same in all locales.

## Adding a locale
1. Create `src/i18n/<code>.json` with **every** key of `Translations` — copy `en.json` and translate.
   Keep the placeholder names identical; only the surrounding prose changes.
2. `import xx from './xx.json';` in `index.ts`.
3. Add `xx: 'xx-XX'` to `LOCALE_MAP` (valid BCP-47, `ll-CC` shape).
4. Add `xx` to the `TRANSLATIONS` object literal (shorthand, so the key name must equal the import name).
5. Update the `locale` input description in the repo-root `action.yml` and the README's locale row.

The type system enforces **completeness but not exactness**: `TRANSLATIONS: Record<Locale, Translations>`
makes a missing bundle or a missing/mistyped key a compile error, while extra keys in a JSON file are
silently accepted (the imported module is not a fresh object literal, so no excess-property check applies).
`LOCALES` and `Locale` update themselves from `LOCALE_MAP` — no second list to maintain. `pnpm run typecheck`
is the check that matters here; `index.test.ts` will also start covering the new locale automatically
because it iterates `LOCALES`.

## Dependencies
Imports only `./ca.json`, `./en.json`, `./es.json`, `./it.json` and `./types`. It must import nothing else —
not `@domain/*`, not `@config/*`, not `@actions/*` — because every other layer (including `domain`) depends
on it, and any import here would create a cycle. JSON imports rely on `resolveJsonModule` in `tsconfig.json`;
esbuild inlines the bundles into `dist/index.js`, so there are no JSON files to ship.

## Gotchas
- `index.ts` re-exports `Translations` (`export type { Translations } from './types'`) because `@i18n` is a
  **file** alias — `@i18n/types` does not resolve. Any new type consumers need must be re-exported the same way.
- `String.prototype.replaceAll` with a global regex is required here; passing a non-global regex to
  `replaceAll` throws at runtime. Do not drop the `g` flag from `PLACEHOLDER_PATTERN`.
- `PLACEHOLDER_PATTERN` is a module-level regex reused across calls. It is safe only because `replaceAll`
  resets `lastIndex`; do not switch it to `.exec()`/`.test()` in a loop.

## Testing
`src/i18n/index.test.ts` covers `interpolate` (single/multiple placeholders, unmatched placeholder, template
with none), `getTranslations` for each of the four locales (asserting the localized `report.title`), and the
three `LOCALES` invariants (exact order, a bundle per locale, `ll-CC` shape for every `LOCALE_MAP` value).

```
pnpm vitest run src/i18n
```
