---
name: hyv-apply-rewrite
description: Validate and apply a model response to a prepared rewrite task, then run local gates.
---

# hyv-apply-rewrite

Validate and apply a model response to a prepared task, then run the local gates. It never calls a provider or stores source or candidate text. Exits 2 unless the result is accepted.

## Usage

```text
hyv apply-rewrite task.json response.json profile.json
```

## Behavior

- Deterministic and local-first: this command never calls a provider and never sends drafts, samples, profiles, or telemetry to a service.
- Commands that write use an explicit output path. Confirm that path before running the command.
- This agent describes how to invoke the command and what it returns. It does not change command behavior or exit codes.

## Handoff

Run `hyv apply-rewrite` directly to execute the operation. Follow-on agents: hyv-verify, hyv-prepare-judgment.
