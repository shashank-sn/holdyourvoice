# fact linter

`hyv fact-lint` compares a final draft against local source material. It is a consistency check, not a truth service.

```bash
hyv fact-lint final.md --source=brief:brief.md --source=research:research.md
hyv fact-lint final.md --source=brief:brief.md --metadata=metadata.json --strict
```

Each source uses `id:path`. JSON is the default; `--human` prints compact findings. Report-only mode exits `0`; `--strict` exits `2` when an error exists.

Every claim keeps exact text, sentence number, and UTF-16 offsets. Findings include severity, kind, reason, confidence, suggested action, and evidence with source ID, excerpt, and offsets. The deterministic engine checks dates, numbers, multi-word entities, quotes, capabilities, causal/comparative escalation, and opposite draft claims. Clear opinions and approved hypotheses are left alone. Weak evidence gaps become `needs_human_review`.

The built-in checker is local. Semantic matching is an optional adapter interface; when it is absent, JSON reports `skippedChecks: ["semantic_matching"]`. The linter does not prove supplied sources are accurate, complete, current, or representative.

## automatic HYV gate

Add local source material to a WritingBrief to make fact lint a default HYV verification gate:

```json
{
  "version": "1",
  "audience": "operators",
  "intent": "explain the launch",
  "format": "general",
  "factSources": [{ "id": "release", "text": "Atlas launches on 14 August 2026." }]
}
```

`verify`, `verify-spec`, rewrite evaluation, and their MCP equivalents run fact lint when `factSources` is present. Any error finding fails the final verification. Source-free work remains a voice and editorial check only.

## required facts

Use `requiredFacts` when a supplied fact must remain in the final output. For example:

```json
{
  "factSources": [{ "id": "bio", "text": "Shashank is a LinkedIn Top Voice." }],
  "requiredFacts": [{
    "id": "linkedin-top-voice",
    "text": "Shashank is a LinkedIn Top Voice."
  }]
}
```

HYV fails verification if the final draft drops this fact. It does not force every fact from every source into a post. Mark only the facts that the final output must carry.
