# Star Tracking

The domain of observing how many stars a set of GitHub repositories has accumulated over time, and of turning that observation into reports, charts and notifications. Everything here is about measurement and its fidelity, not about the APIs, files or libraries that obtain and store it.

## Repositories

**Repository**:
A single GitHub project whose star count is being observed. It is identified by its full name (owner and repository name together).
_Avoid_: project, package, library, module

**Owner**:
The account a Repository belongs to, whether that account is a person or an organization. The two are one thing here: filters and reports treat them identically.
_Avoid_: namespace, account holder

**Visibility**:
The audience a Repository is exposed to, and the primary axis on which the tracked set is narrowed: public, private, everything, or only what the Owner owns outright.
_Avoid_: scope, access level, privacy

**Tracked Set**:
The repositories that survive every configured filter and are therefore measured on a given Run. Repositories outside it are invisible to the domain: not counted, not charted, not reported.
_Avoid_: selection, included repos, watchlist

**New Repository**:
A Repository present in the current observation but absent from the Baseline Snapshot. It carries no Delta, because entering the Tracked Set is not growth.
_Avoid_: added repo, first-seen repo, fresh repo

**Removed Repository**:
A Repository present in the Baseline Snapshot but absent from the current observation. Its Stars count as lost even though it is no longer part of the Tracked Set total.
_Avoid_: deleted repo, dropped repo, missing repo

**Top Repositories**:
The most-starred members of the Tracked Set, singled out for individual charts and forecasts. Everything else is only represented in aggregate.
_Avoid_: featured repos, highlights, leaders

## Stars and Stargazers

**Star**:
A single act of endorsement by one GitHub user on one Repository. It is the atomic unit everything in this domain counts.
_Avoid_: like, favourite, upvote

**Star Count**:
The number of Stars a Repository holds at a moment in time.
_Avoid_: score, rating, popularity, stargazers count

**Stargazer**:
A GitHub user who has starred a Repository, together with the moment they did so. A Stargazer is a person; a Star is the act.
_Avoid_: fan, follower, watcher, supporter

**New Stargazer**:
A Stargazer present in the current observation but absent from the previous one, for a Repository whose Stargazers were fully enumerated.
_Avoid_: recent stargazer, latest star, fresh follower

## Measurement and History

**Run**:
One complete execution of the tracker: observe the Tracked Set, compare against a Baseline Snapshot, record, render, notify. It is the unit of time in this domain: "since last run" is a duration.
_Avoid_: execution, job, cycle, pass, invocation

**Snapshot**:
The Star Count of every Repository in the Tracked Set at a single instant, together with their total. It is the record of one observation.
_Avoid_: data point, sample, entry, reading, measurement

**Stored History**:
The accumulated series of Snapshots, one appended per Run. It is the tracker's memory: it only knows what it has personally observed.
_Avoid_: tracked history, snapshot history, per-run history, timeline

**Reconstructed History**:
A star timeline rebuilt from when each Stargazer starred, covering the period before the tracker ever ran. It is inferred rather than observed.
_Avoid_: real history, true history, starred-at history

**Comparison Window**:
The reach the current observation is compared over: the immediately preceding Run, or the oldest observation within a stated age. It decides what "changed" means for a given Run, by deciding which Snapshot becomes the Baseline Snapshot.
_Avoid_: interval, period, range, lookback, timeframe

**Baseline Snapshot**:
The Snapshot the current observation is measured against, selected by the Comparison Window and so not necessarily the most recent one. It is the comparison baseline, a different quantity from the Notification Baseline.
_Avoid_: previous snapshot, last snapshot, reference point, anchor

**Delta**:
The change in a Star Count between the Baseline Snapshot and the current observation. It is signed: Stars can be lost as well as gained.
_Avoid_: diff, change, difference, growth, movement, variance

**Summary**:
The aggregate figures for one Run: current total, previous total, net change, Stars gained, Stars lost, and whether anything moved at all. It describes the Run, not any single Repository.
_Avoid_: report, overview, totals, stats

**Run Measurement**:
Everything one Run works out from a single observation and the Stored History: which Snapshot was the Baseline Snapshot, what each Repository's Delta was, the Summary, the Stored History with this Run appended, and whether the Notification Threshold was cleared.
_Avoid_: calculation, analysis, computation, result set

## Growth and Projection

**Velocity**:
The rate at which the Tracked Set is accumulating Stars, expressed per day and as a percentage of the previous total.
_Avoid_: speed, momentum, pace, growth rate

**Rate Interval**:
The stretch of time between two Snapshots that a Velocity is measured over.
_Avoid_: sample window, gap, spacing, delta time

**Milestone**:
A round Star Count treated as a landmark worth reaching or marking.
_Avoid_: threshold, target, goal, checkpoint, tier

**Forecast**:
A projection of future Star Counts extrapolated from observed growth. It assumes the recent past continues and anticipates nothing.
_Avoid_: prediction, estimate, projection, outlook

**Forecast Method**:
The rule by which a Forecast is extrapolated from history. More than one exists, and the same history yields a different Forecast under each.
_Avoid_: algorithm, model, strategy, formula

**Trend Line**:
A smoothed overlay drawn across observed history to reveal its underlying direction. It describes the past only, and is a different thing from a Forecast.
_Avoid_: moving average, regression line, smoothing, trendline

## Data Fidelity

**Reachable Stargazers**:
The portion of a Repository's Stargazers that can actually be enumerated. For heavily starred repositories this stops well short of the true Star Count, and stops at a point in the past.
_Avoid_: available stargazers, visible stargazers, fetchable stargazers, accessible stars

**Ramped Tail**:
The straight bridge drawn from the last Reachable Stargazer up to a Repository's true present-day Star Count, standing in for the stretch of history that cannot be enumerated. It is an admitted approximation, not observed data.
_Avoid_: extrapolated tail, gap fill, tail estimate

**Smart Sampling**:
Enumerating only a spread of a heavily starred Repository's Stargazers rather than all of them, accepting a coarser Reconstructed History in exchange for a far cheaper observation.
_Avoid_: partial fetch, sampling mode, throttling, approximation mode

**Sampled Repository**:
A Repository whose Stargazers were observed through Smart Sampling rather than enumerated in full.
_Avoid_: partial repo, approximated repo, throttled repo

**Covered Stars**:
How many of a Repository's Stars a partial or interrupted enumeration actually accounts for. It is the honest denominator behind a Reconstructed History.
_Avoid_: fetched stars, counted stars, sampled stars

## Outputs

**Artefact**:
One published file a Run produces: the Report, a Chart, the Badge, the CSV, the Stored History itself. Spelled with an *e* throughout, matching the code.
_Avoid_: artifact, asset, output file, deliverable

**Data Branch**:
The branch that holds the tracker's accumulated data and its published Artefacts. Everything the tracker remembers lives here.
_Avoid_: storage branch, tracking branch, state branch, data repo

**Report**:
The human-readable rendering of a Run: which repositories moved, by how much, plus whichever of Velocity, Forecast and New Stargazers are enabled. The same Report is rendered in several formats; they are one Artefact, not several.
_Avoid_: summary, output, changelog, newsletter

**Chart**:
A rendered visualisation of history: the Tracked Set's total over time, individual Top Repositories, several of them side by side, or observed history continued into a Forecast.
_Avoid_: graph, plot, figure, visualization

**Badge**:
A small embeddable image stating the Tracked Set's current total Star Count. It shows one number and no history.
_Avoid_: shield, chip, label, counter

## Notifications

**Notification**:
An email announcing a Run's Report. It is the announcement itself, distinct from both the decision that one was due and its Delivery.
_Avoid_: alert, message, ping

**Notification Baseline**:
The Star Count a Notification Threshold accumulates against: the Tracked Set's total as at the last delivered Notification. It is a total, not a Snapshot, and is a different quantity from the Baseline Snapshot.
_Avoid_: notification snapshot, last-sent snapshot, unqualified "baseline"

**Notification Threshold**:
An amount of accumulated change that must build up, measured from the Notification Baseline, before a Notification is due. It is cumulative across Runs, never a per-Run figure.
_Avoid_: sensitivity, trigger level, minimum delta, cutoff

**Notification Mode**:
Whether the Notification Threshold measures movement in both directions or only upward: that is, whether losing a large number of Stars is as newsworthy as gaining them.
_Avoid_: direction, polarity, trigger mode

**Delivery**:
What actually became of a Notification: it was never attempted, it was sent, or it was attempted and failed. It is a fact about the transport, deliberately separate from the decision that a Notification was due.
_Avoid_: send result, email status, sent flag

## Operation

**Read-Only Run**:
A Run that observes, reports and notifies in full but deliberately records nothing.
_Avoid_: dry run, preview run, passive run, no-op run

**Locale**:
The language a Report, Chart and Notification are rendered in. It affects wording and date presentation only, never what is measured.
_Avoid_: translation, region
