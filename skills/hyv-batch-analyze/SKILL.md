---
name: hyv-batch-analyze
description: Inspect two to one hundred drafts for repeated opening and closing sentences.
---

# hyv-batch-analyze

Inspect two to one hundred drafts for repeated opening and closing sentences. It returns advisory batch findings and does not store the drafts.

## Usage

```text
hyv batch-analyze draft-a.md draft-b.md [draft-c.md]
```

## Behavior

- Deterministic and local-first: this command never calls a provider and never sends drafts, samples, profiles, or telemetry to a service.
- Commands that write use an explicit output path. Confirm that path before running the command.
- This agent describes how to invoke the command and what it returns. It does not change command behavior or exit codes.

## Handoff

Run `hyv batch-analyze` directly to execute the operation. Follow-on agents: hyv-analyze.
