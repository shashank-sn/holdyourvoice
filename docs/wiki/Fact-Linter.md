# fact linter

`hyv fact-lint` compares a final draft against local source material. It is a consistency check, not a truth service.

```bash
hyv fact-lint final.md --source=brief:brief.md --source=research:research.md
hyv fact-lint final.md --source=brief:brief.md --metadata=metadata.json --strict
```

Each source uses `id:path`. JSON is the default; `--human` prints compact findings. Report-only mode exits `0`; `--strict` exits `2` when an error exists.

Every claim keeps exact text, sentence number, and UTF-16 offsets. Findings include severity, kind, reason, confidence, suggested action, and evidence with source ID, excerpt, and offsets. The deterministic engine checks dates, numbers, multi-word entities, quotes, capabilities, causal/comparative escalation, and opposite draft claims. Clear opinions and approved hypotheses are left alone. Weak evidence gaps become `needs_human_review`.

The built-in checker is local. Semantic matching is an optional adapter interface; when it is absent, JSON reports `skippedChecks: ["semantic_matching"]`. The linter does not prove supplied sources are accurate, complete, current, or representative.
