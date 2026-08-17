# Star Tracking

The domain of observing how many stars a set of GitHub repositories has accumulated over time, and of turning that observation into reports, charts and notifications. Everything here is about measurement and its fidelity — not about the APIs, files or libraries that obtain and store it.

## Repositories

**Repository**:
A single GitHub project whose star count is being observed. It is identified by its full name (owner and repository name together).
_Avoid_: project, package, library, module

**Owner**:
The account a Repository belongs to, whether that account is a person or an organization. The distinction between the two is not meaningful in this domain — filters and reports treat them identically.
_Avoid_: organization, org, user, namespace

**Visibility**:
The audience a Repository is exposed to, and the primary axis on which the tracked set is narrowed: public, private, everything, or only what the Owner owns outright.
_Avoid_: scope, access level, privacy

**Tracked Set**:
The repositories that survive every configured filter and are therefore measured on a given Run. Repositories outside it are invisible to the domain — they are not counted, charted or reported.
_Avoid_: selection, included repos, watchlist

**New Repository**:
A Repository present in the current observation but absent from the Baseline Snapshot. It carries no Delta — entering the Tracked Set is not growth.
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
One complete execution of the tracker: observe the Tracked Set, compare against a Baseline, record, render, notify. It is the unit of time in this domain — "since last run" is a duration.
_Avoid_: execution, job, cycle, pass, invocation

**Snapshot**:
The Star Count of every Repository in the Tracked Set at a single instant, together with their total. It is the record of one observation.
_Avoid_: data point, sample, entry, reading, measurement

**Stored History**:
The accumulated series of Snapshots, one appended per Run, retained up to a configured maximum and kept across Runs. It is the tracker's memory: it only knows what it has personally observed.
_Avoid_: tracked history, snapshot history, per-run history, timeline

**Reconstructed History**:
A star timeline rebuilt from when each Stargazer starred, covering the period before the tracker ever ran. It is inferred rather than observed, is rebuilt from scratch on every Run, and is never retained.
_Avoid_: real history, star history, starred-at history, true history

**Baseline Snapshot**:
The Snapshot that the current observation is measured against. It is not necessarily the most recent one — a Comparison Window can reach further back.
_Avoid_: previous snapshot, last snapshot, reference point, anchor

**Comparison Window**:
How far back the Baseline Snapshot is chosen from: the immediately preceding Run, or the oldest observation within a stated age. It decides what "changed" means for a given Run.
_Avoid_: interval, period, range, lookback, timeframe

**Delta**:
The change in a Star Count between the Baseline Snapshot and the current observation. It is signed: Stars can be lost as well as gained.
_Avoid_: diff, change, difference, growth, movement, variance

**Summary**:
The aggregate figures for one Run — current total, previous total, net change, Stars gained, Stars lost, and whether anything moved at all. It describes the Run, not any single Repository.
_Avoid_: report, overview, totals, digest, stats

**Run Measurement**:
Everything one Run works out from a single observation and the Stored History: which Snapshot was the Baseline, what each Repository's Delta was, the Summary, the Stored History with this Run appended, and whether the Notification Threshold was cleared. It is arrived at as one act, because the parts are only correct in relation to each other.
_Avoid_: calculation, analysis, computation, result set

## Growth and Projection

**Velocity**:
The rate at which the Tracked Set is accumulating Stars, expressed per day and as a percentage of the previous total.
_Avoid_: speed, rate, momentum, pace, growth rate

**Rate Interval**:
The stretch of time between two Snapshots that a rate is measured over. A pair closer together than the minimum is skipped rather than measured, so a re-run minutes after a scheduled Run cannot inflate Velocity or a Forecast.
_Avoid_: sample window, gap, spacing, delta time

**Milestone**:
A round Star Count treated as a landmark worth reaching or marking. Milestones serve two distinct purposes: projecting how far away the next one is, and drawing reference lines on a chart.
_Avoid_: threshold, target, goal, checkpoint, tier

**Forecast**:
A projection of future Star Counts extrapolated from observed growth, covering a fixed horizon of weeks ahead. It assumes the recent past continues and anticipates nothing.
_Avoid_: prediction, estimate, projection, outlook

**Forecast Method**:
One of the ways a Forecast is derived from history — either fitting a straight line through all of it, or weighting recent movement more heavily. Both are published together rather than one being chosen.
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
A Repository observed through Smart Sampling. Its Reconstructed History remains usable, but it is deliberately excluded from New Stargazer detection because its Stargazer list is known to be incomplete.
_Avoid_: partial repo, approximated repo, throttled repo

**Covered Stars**:
How many of a Repository's Stars a partial or interrupted enumeration actually accounts for. It is the honest denominator behind a Reconstructed History.
_Avoid_: fetched stars, counted stars, sampled stars

## Outputs

**Data Branch**:
The branch that holds the tracker's accumulated data and its published artefacts, kept deliberately apart from the branch holding the code. Everything the tracker remembers lives here.
_Avoid_: storage branch, tracking branch, state branch, data repo

**Report**:
The human-readable rendering of a Run — which repositories moved, by how much, plus whichever of Velocity, Forecast and New Stargazers are enabled. The same Report is rendered in several formats; they are one artefact, not several.
_Avoid_: summary, digest, output, changelog, newsletter

**Chart**:
A rendered visualisation of history: the Tracked Set's total over time, individual Top Repositories, several of them side by side, or observed history continued into a Forecast.
_Avoid_: graph, plot, figure, visualization

**Badge**:
A small embeddable image stating the Tracked Set's current total Star Count. It shows one number and no history.
_Avoid_: shield, chip, label, counter

## Notifications

**Notification**:
An email announcing a Run's Report, sent when the accumulated change clears the Notification Threshold, or unconditionally when a Run is configured to report even in the absence of change.
_Avoid_: alert, email, digest, message, ping

**Notification Threshold**:
How much accumulated change must build up before a Notification fires, either as a fixed number or left adaptive so it scales with the size of the Tracked Set. The change accrues across Runs and only resets when a Notification fires, so it is never a per-Run figure.
_Avoid_: sensitivity, trigger level, minimum delta, cutoff

**Notification Mode**:
Whether the Notification Threshold measures movement in both directions or only upward — that is, whether losing a large number of Stars is as newsworthy as gaining them.
_Avoid_: direction, polarity, trigger mode

**Delivery**:
What actually became of a Notification: it was never attempted, it was sent, or it was attempted and failed. It is a fact about the transport, deliberately separate from the decision that a Notification was due — a Run can decide to notify and fail to deliver, or deliver without a Notification being due at all.
_Avoid_: send result, email status, sent flag

## Operation

**Read-Only Run**:
A Run that observes, reports and notifies in full but deliberately records nothing, so it can share a Data Branch with another workflow without competing to write it.
_Avoid_: dry run, preview run, passive run, no-op run

**Locale**:
The language a Report, Chart and Notification are rendered in. It affects wording and date presentation only, never what is measured.
_Avoid_: translation, i18n, region
