---
name: hyv-rewrite-prompt
description: Create a constrained editing brief without rewriting the draft.
---

# hyv-rewrite-prompt

Create a constrained editing brief. It does not rewrite the draft or call a model. The brief is printed to stdout for redirect into a markdown file.

## Usage

```text
hyv rewrite-prompt draft.md profile.json [writing-brief.json] > rewrite-brief.md
```

## Behavior

- Deterministic and local-first: this command never calls a provider and never sends drafts, samples, profiles, or telemetry to a service.
- Commands that write use an explicit output path. Confirm that path before running the command.
- This agent describes how to invoke the command and what it returns. It does not change command behavior or exit codes.

## Handoff

Run `hyv rewrite-prompt` directly to execute the operation. Follow-on agents: hyv-prepare-rewrite.
