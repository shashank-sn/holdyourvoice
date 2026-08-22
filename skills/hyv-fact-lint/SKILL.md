---
name: hyv-fact-lint
description: Lint factual claims in a draft against named sources.
---

# hyv-fact-lint

Lint factual claims in a draft against one or more named sources passed as --source=id:path. Optional --metadata provides fact metadata, --strict raises severity, and --human selects the human-readable report.

## Usage

```text
hyv fact-lint <draft|-> --source=id:path [--source=id:path] [--metadata=metadata.json] [--strict] [--human]
```

## Behavior

- Deterministic and local-first: this command never calls a provider and never sends drafts, samples, profiles, or telemetry to a service.
- Commands that write use an explicit output path. Confirm that path before running the command.
- This agent describes how to invoke the command and what it returns. It does not change command behavior or exit codes.

## Handoff

Run `hyv fact-lint` directly to execute the operation. Follow-on agents: hyv-verify.
