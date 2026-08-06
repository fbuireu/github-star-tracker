# src/assets

The brand files, and the only folder under `src/` that holds no code: `logo-light.svg` and `logo-dark.svg`,
the 420x110 wordmark — star mark, `STAR TRACKER`, the repo slug. The branding source they were exported from
lives outside this repo. The `@assets/*` alias exists so a future importer has one path to use; nothing
imports them today.

`light` and `dark` name the **background they sit on**, not the file's own colours: `logo-light.svg` has
near-black text for light backgrounds, `logo-dark.svg` near-white text for dark ones. Both are transparent,
which is why they sit cleanly on either GitHub theme. The gold is `#dfb317`, the same star colour the badge
and the charts use.

The README embeds the pair through a `<picture>` with a `(prefers-color-scheme: dark)` source, so the switch
is the viewer's theme and needs no JavaScript. The wordmark carries the project name, so the README has no
`# GitHub Star Tracker` heading — restore one if the logo ever becomes the star alone. The social preview
image is not here; it is uploaded in the repository settings and lives only there.

## Invariants

- **The text carries `textLength` + `lengthAdjust="spacingAndGlyphs"`.** `Barlow Condensed` is not available
  where GitHub renders the image, and the fallback is wide enough that `STAR TRACKER` runs past the `viewBox`
  and gets clipped. The attribute pins the width whatever font resolves. Do not drop it, and if the text
  changes, re-fit the value — the heading has 290 units from `x="122"`, the slug 288 from `x="124"`.
- **Every file here needs a `<title>`.** `biome.json` includes `src/**`, so unlike the sample charts in
  `examples/` these SVGs are linted and `a11y/noSvgWithoutTitle` fails the build without one. Suppressions
  are not allowed anywhere in this repo, so the title is the fix.
- **The star is a bar chart clipped by a star polygon**, not a star outline: eight rising `rect`s inside
  `clipPath#star`. Editing the bars changes the silhouette's fill, never its shape.
- Each file is its own document, so both reusing `clipPath` id `star` is safe. Inlining the two into one HTML
  page is not — the ids would collide.

## Gotchas

- **esbuild has no `.svg` loader configured.** The alias resolves, but an `import logo from
  '@assets/logo-dark.svg'` fails the build until `loader: { '.svg': 'text' }` (or `dataurl`) is added in
  `esbuild.config.ts`. The email digest is the one plausible consumer, and it would need the file inlined as
  a data URI — a remote `<img>` pointing at the repo is blocked by most mail clients.
- README paths are repo-relative (`src/assets/logo-light.svg`). Anything rendered outside the repository —
  the wiki above all, which is a separate repo — needs the absolute
  `raw.githubusercontent.com/fbuireu/github-star-tracker/main/...` form, as `docs/wiki/Star-Trend-Charts.md`
  already does for the sample charts.
