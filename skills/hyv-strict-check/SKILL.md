---
name: hyv-strict-check
description: Run the local strict AI-pattern and calibrated voice-match gate.
---

# hyv-strict-check

Run the opt-in strict local quality gate without changing the draft, profile, or learning state.

## Usage

```text
hyv strict-check draft.md profile-v3.json sample-a.md sample-b.md sample-c.md sample-d.md sample-e.md
```

## Behavior

- Requires a Profile v3 built from at least five samples, five or more local validation samples, 1,500 validation-sample words, no duplicate samples, a consistent visible format baseline, and calibrated fingerprint tolerances.
- Returns `strict-ready`, `needs-human-review`, or `blocked` as JSON and exits `0` only for `strict-ready`.
- `blocked` covers missing strict evidence, configured blocking AI patterns, hard calibrated fingerprint drift, red VoiceDNA findings, and unresolved hidden text.
- `needs-human-review` keeps advisory and judgment-required AI patterns visible. It is not a clean result.
- It remains local-first and never sends samples or drafts to a provider.

## Handoff

Fix only the named finding, then rerun the command. Do not rewrite unflagged text or promote any edit into learning from this command. Only after `strict-ready`, run hyv-final-check on the exact text that will be delivered; that final output boundary remains required after any later edit or formatting step.
