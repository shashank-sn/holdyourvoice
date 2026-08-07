# rewrite benchmark protocol

This directory is maintainer-only. It evaluates a defined rewrite route; it does not rank models generally or enable provider calls in HYV.

## Artifact boundary

Task packets and captured outputs contain writer text. Keep them local or write them only to an explicit user-chosen destination. HYV does not retain them, include them in learning events, or send them to a provider. Rights-cleared fixtures may live here; client drafts may not.

## Pre-run commitment

Before the locked partition runs, commit a canonical protocol manifest that records its SHA-256 digest, corpus-partition digest, model/settings, reviewer-rubric version, margin, statistic, missing-rating policy, routing policy, and timestamp. A report whose locked artifacts do not match that commitment cannot claim parity.

The initial operator is a HYV maintainer. Prepare a local task, explicitly forward it to a provider, apply the captured response, review any escalation, and own rights-cleared benchmark artifacts. CLI/MCP users are deferred until a locked-test promotion.

## Result states

| condition | state | next action |
| --- | --- | --- |
| response-schema failure or one adapter repair attempt | repairable | return stable error and let the caller correct or resubmit |
| candidate passes all deterministic gates | accepted | eligible for blinded review |
| VoiceDNA, AI Editor, regression, preservation, or CopySpec failure | needs_escalation | do not auto-repair; caller may use a human or frontier route |

## Locked-test report

For each route, report lower-tier direct, lower-tier accepted after adapter repair, frontier accepted, human accepted, and unresolved separately. Include intent-to-treat approval against the unedited source: hard-gate failures are unapproved, even when excluded from pairwise preference. Review packets contain normalized prose only; no model, repair, source, or run labels. A reviewer sees one candidate per case per round.

Promotion requires the committed confidence method, sample/rating minimums, reviewer aggregation, and missing-data rule. The initial consequence is approval only for the recorded maintainer-run rewrite distribution, never a default runtime model route. A later locked-test failure demotes that route to experimental.
