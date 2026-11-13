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
- **Charts with alt text.** Every chart image in a report has alt text: the chart's title, or the repository it
  belongs to. The alt text names the chart; it does not describe the history the chart draws.
- **Light and dark.** With `chart-theme: auto`, the SVG charts follow the reader's light or dark preference. The
  email's charts are images with their background drawn in, so they follow `email-theme` instead.
- **The reader's language.** `locale` sets the wording and the number and date formats.
- **The numbers as data.** The `report-csv` output holds the same per-repository numbers as CSV, for a spreadsheet
  or any other tool a reader prefers.

## Settings that help

- `chart-animation: false` draws the charts without animation. The animation otherwise plays whatever the reader's
  reduce-motion setting is.
- `chart-theme` and `email-theme` set to `light` or `dark` fix the theme where `auto` does not reach, such as an
  email client that ignores the reader's preference.
- `include-charts: false` leaves the charts out, for a report that is only text and tables.

## What is tested

- Unit tests pin the badge's name and title, and the alt text of the per-repository charts in the HTML report.
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

- Give every image in an output alt text, and every table a header row.
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
