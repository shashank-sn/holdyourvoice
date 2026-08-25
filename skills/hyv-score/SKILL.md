---
name: hyv-score
description: Score a draft against an explicit held-out local writing band.
---

# hyv-score

Use this with three or more samples that were not used to build the profile. It reports whether a candidate sits inside the writer's observed range. It is local-only and is not an authorship, factuality, or publication-quality score. Profile v3 adds channel-aware scoring; Profile v2 remains general-channel compatible.

## Usage

```text
hyv score draft.md profile.json heldout-a.md heldout-b.md heldout-c.md [--channel=email|chat|long-form|social|docs|general]
```

## Behavior

- Use only writing the owner has authorized and retain no new samples or telemetry.
- Keep profile-building and held-out samples separate. Do not relabel a different channel to force a score.
- HYV abstains when there are too few usable held-out samples, language confidence is insufficient for its English-oriented metrics, or the channel conflicts with the profile. Report that abstention rather than treating it as a failure or a score.
- The result includes component similarity and the writer's own pairwise range. A high score is not proof that the candidate was written by the person.
- This command is read-only. It does not call a provider, change a draft, or write a profile.

## Handoff

Use `hyv-rewrite-prompt` for a bounded external editing brief, then `hyv-verify` for candidate verification. Re-run this score only with the same explicit held-out set when comparing drafts.
