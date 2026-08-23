# Support

This is a GitHub Action maintained by one person in their spare time. Everything below is best effort: there
is no SLA, and an issue with a reproducible workflow run gets answered long before one without.

## Read this first

Most questions are already answered in the docs, and the two that come up most are documented in detail:

- **[Getting Started](./docs/wiki/Getting-Started.md)** for the minimal workflow, and
  **[Configuration](./docs/wiki/Configuration.md)** for every input and its real default.
- **[Personal Access Token (PAT)](<./docs/wiki/Personal-Access-Token-(PAT).md>)** if the run works but the
  stargazer sections or the star-history charts come back empty. The default `GITHUB_TOKEN` is not enough, and
  a fine-grained token without an explicit organization grant behaves the same way.
- **[Known Limitations](./docs/wiki/Known-Limitations.md)** before reporting missing data as a bug. The
  40,000-stargazer cap and the sampled-repository rules are deliberate.
- **[Troubleshooting](./docs/wiki/Troubleshooting.md)** for a run that fails or commits nothing.

The same pages are published as the [GitHub Wiki](https://github.com/fbuireu/github-star-tracker/wiki), which
is generated from [`docs/wiki/`](./docs/wiki).

## Where to ask

| You want to | Go to |
| --- | --- |
| Ask a question, or float an idea before building it | [Discussions](https://github.com/fbuireu/github-star-tracker/discussions) |
| Report something broken | [Bug report](https://github.com/fbuireu/github-star-tracker/issues/new?template=bug_report.yml) |
| Request a feature | [Feature request](https://github.com/fbuireu/github-star-tracker/issues/new?template=feature_request.yml) |
| Report a vulnerability | [Security policy](https://github.com/fbuireu/github-star-tracker/security/policy), never a public issue |

## What makes a report answerable

The action logs a summary of every run. A report that carries the failing job's log, the workflow step that
invoked the action and the version reference you pinned (`@v1`, `@main`, a SHA) is usually diagnosable on the
first reply. One that says the run failed is not.

**Never paste a token, not even a redacted one.** If a token is in the log you pasted, rotate it: a redaction
you apply after the fact does not remove it from the page's history.
