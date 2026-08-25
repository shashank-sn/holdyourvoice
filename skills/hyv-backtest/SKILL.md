---
name: hyv-backtest
description: Evaluate a caller-supplied reconstruction against a held-out local target without generating text.
---

# hyv-backtest

Run an information-isolated evaluation. HYV receives context, a real held-out target, and a candidate supplied by a person or external writer. It does not generate the candidate, return either text, or call a provider.

```text
hyv backtest context.md heldout-target.md candidate.md profile.json heldout-a.md heldout-b.md heldout-c.md
```

The result carries only digests plus separate preservation, AI Editor, and held-out-band reports. It is not an authorship score or publishing approval.
