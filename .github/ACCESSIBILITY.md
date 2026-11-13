# Accessibility

GitHub Star Tracker is a GitHub Action. What it finds reaches people as a Markdown report, an HTML report it can
also send by email, SVG charts and a star badge, in English, Spanish, Catalan or Italian. The people who read
those should be able to with a screen reader, at high zoom, without telling colours apart and with reduced motion.
This page says what the outputs do toward that, which settings help, how to report a barrier, and what a pull
request has to keep working.

## What the reports do

- **Tables with headers.** Repositories, stars, change and trend are a real table in both reports, with a header
  row a screen reader can announce.
- **Change in text, not only in symbols.** The trend column's arrow sits beside the signed change, such as `+3`,
  `-1` or `0`, so neither the arrow nor a colour carries the change alone.
- **A badge with a name.** The star badge is an image named after its own text, such as "Total Stars: ★ 42", and
  carries the same text as its title. A test pins both.
- **Charts that say what they show.** Every chart image in the Markdown and HTML reports has alt text that states
  its data in one sentence, in the report's language:
  - A star history gives the date range and the star count at its start and end, such as "Star history from
    2026-01-04 to 2026-11-13: 120 to 342 stars". A per-repository chart says the same for that repository.
  - The comparison chart lists each repository with its current star count.
  - A forecast chart gives the date the forecast starts from, the star count then, and the star count each method
    projects by the last date it reaches.

  The dates and counts are those of the window the chart plots, so `chart-range` narrows them too. The SVG files
  carry `role="img"` and the same sentence as their `<title>`, so a chart opened on its own is described. The
  sentence gives the figures at the ends of the line, not every point on it.
- **Lines told apart by more than colour.** In the comparison chart, in the SVG and in the email image, each
  repository has its own colour and its own line pattern: the first is solid, the next nine are dotted, dashed or
  dash-dot variants. The legend draws a short line in each colour and pattern beside the name. With ten
  repositories the nine patterns are close to one another and the legend order is the way to match them up.
- **A language and a title on the HTML report.** The document declares the language of `locale` (`en-US`, `es-ES`,
  `ca-ES` or `it-IT`) and its `<title>` is the report heading.
- **Avatars that are not announced.** Stargazer avatars have an empty alt, because the login is printed beside each
  one.
- **Light and dark.** With `chart-theme: auto`, the SVG charts follow the reader's light or dark preference. The
  email's charts are images with their background drawn in, so they follow `email-theme` instead.
- **The reader's language.** `locale` sets the wording and the number and date formats.
- **The numbers as data.** The `report-csv` output holds the same per-repository numbers as CSV, for a spreadsheet
  or any other tool a reader prefers.

## Settings that help

- The chart animation is off for a reader whose system asks for reduced motion: the SVG puts every animation rule
  inside `@media (prefers-reduced-motion: no-preference)`, so that reader gets the finished chart. This relies on
  the viewer reporting the setting; where one does not, the animation plays.
- `chart-animation: false` draws the charts without animation for everyone, such as in a viewer that does not
  report the reduce-motion setting.
- `chart-theme` and `email-theme` set to `light` or `dark` fix the theme where `auto` does not reach, such as an
  email client that ignores the reader's preference.
- `include-charts: false` leaves the charts out, for a report that is only text and tables.

## What is tested

- Unit tests pin the badge's name and title; the alt text of every chart in both reports and the title and
  `role="img"` of the SVGs; the empty alt of the avatars; the language and title of the HTML report; the dash
  pattern of each comparison series in the SVG and the email chart; and that no animation or hidden starting state
  of the SVG sits outside the reduced-motion query.
- Nobody reads the reports with a screen reader on a schedule, and no output is run through an automated
  accessibility checker. Reports from people who use them are the main way barriers there come to light.
- The outputs have not been audited against WCAG, so this page makes no conformance claim.

## Known barriers

Barriers already found are tracked as
[open issues with the `accessibility` label](https://github.com/fbuireu/github-star-tracker/issues?q=is%3Aissue%20state%3Aopen%20label%3Aaccessibility).

## Reporting a barrier

If a report, a chart, the badge or the email is hard or impossible for you to use, whether you run the action or
only read what it produces,
[open a bug report](https://github.com/fbuireu/github-star-tracker/issues/new?template=bug_report.yml). You don't
need to say anything about a disability.

Include as much of this as you can:

- What you were trying to read or do, and what happened instead.
- Which output: the Markdown report, the HTML report, the email, a chart or the badge, and where you read it, such
  as a repository on GitHub or an email client.
- Your browser or email client, operating system and device.
- Any assistive technology you use, such as a screen reader, magnifier or voice control, and its version.
- Settings that change how things look or move: zoom or text size, high contrast or forced colours, dark mode,
  reduced motion.
- The `star-tracker.yml` or workflow inputs, if you run the action, minus anything secret.
- A screenshot or recording, if you're comfortable sharing one.

The form's _Additional Context_ field takes whatever has no field of its own. If you only read a report and did
not run the action, put the page where you read it in _Workflow run URL_ and "reader" in _Action version and
runner_.

### What happens next

- The issue gets the `accessibility` label, so it joins the list above.
- Questions about missing details, and a workaround when there is one, come in the issue.
- No date is promised for a fix. The fix links the issue, which closes when it ships in a release.

## For contributors

A change to what the action produces keeps the above working:

- Give every image in an output alt text that says what it shows, or an empty alt when the text beside it already
  says it, and every table a header row.
- Pair any colour or symbol that carries meaning with text.
- Put new wording in all four locale bundles under `src/i18n`.
- When a pull request changes what gets rendered, the template asks for before and after renders. Look at them at
  200% zoom and in both themes as well.
- If a change adds a barrier it cannot avoid, say so in the pull request and open an issue with the
  `accessibility` label.

## Ownership

[Ferran Buireu](https://github.com/fbuireu) maintains the action and this page. The page changes in the same
commit as the behaviour it describes.

## Feedback on this page

If something here is wrong, unclear or missing,
[open a documentation issue](https://github.com/fbuireu/github-star-tracker/issues/new?template=documentation.yml).
To report a barrier, see [Reporting a barrier](#reporting-a-barrier).
