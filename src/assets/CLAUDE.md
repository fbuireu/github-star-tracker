# src/assets

The brand files, and the only folder under `src/` that holds no code. One file: [`logo.svg`](./logo.svg), the star mark
drawn on a `viewBox="0 0 100 100"` grid and declared at `width="512" height="512"`, gold (`#dfb317`, the
colour the badge and the charts use) on transparency. The branding source it was exported from lives outside
this repo. The `@assets/*` alias exists so a future importer has one path to use; nothing imports it today.

**There is no light/dark pair, and adding one would be a regression.** The mark is a single colour on
transparency, so it reads on either GitHub theme unchanged. That is why the README embeds it with a plain
`<img>` rather than a `<picture>` with a `(prefers-color-scheme: dark)` source.

The mark carries no text, so the `# GitHub Star Tracker` heading under it is what names the project and
**must stay**. The social preview image is not here either; it is uploaded in the repository settings and
lives only there.

## Invariants

- **The file needs a `<title>`.** [`biome.json`](../../biome.json) includes `src/**`, so unlike the sample charts in `examples/`
  this file is linted and `a11y/noSvgWithoutTitle` fails the build without one. Suppressions are not allowed
  anywhere in this repo, so the title is the fix, and it doubles as the accessible name.
- **The star is a bar chart clipped by a star polygon**, not a star outline: eight rising `rect`s inside
  `clipPath#star`. Editing the bars changes the silhouette's fill, never its shape.

## Gotchas

- **`clipPath` id `star` is not unique-safe.** It only works because this is a standalone document. Inlining
  the mark into a page that already draws a chart with the same id (the email digest being the plausible
  case) makes the last definition win for both.
- **esbuild has no `.svg` loader configured.** The alias resolves, but an `import logo from
  '@assets/logo.svg'` fails the build until `loader: { '.svg': 'text' }` (or `dataurl`) is added in
  [`esbuild.config.ts`](../../esbuild.config.ts). The email digest is the one plausible consumer, and it would need the file inlined as
  a data URI, because a remote `<img>` pointing at the repo is blocked by most mail clients.
- **README paths are repo-relative** (`src/assets/logo.svg`). Anything rendered outside the repository needs
  the absolute `raw.githubusercontent.com/fbuireu/github-star-tracker/main/...` form instead. The wiki is the
  case that bites, since it is a separate repo; [`docs/wiki/Star-Trend-Charts.md`](../../docs/wiki/Star-Trend-Charts.md) already uses the absolute
  form for the sample charts.
