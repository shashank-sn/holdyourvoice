---
name: hyv-patterns
description: List the exact AI Editor rules that run.
---

# hyv-patterns

List the exact AI Editor rules that run in this package: the ruleset version and the deterministic catalog with reconstructable regular-expression source, flags, and sentence or physical-line scope.

## Usage

```text
hyv patterns
```

## Behavior

- Deterministic and local-first: this command never calls a provider and never sends drafts, samples, profiles, or telemetry to a service.
- Commands that write use an explicit output path. Confirm that path before running the command.
- This agent describes how to invoke the command and what it returns. It does not change command behavior or exit codes.

## Handoff

Run `hyv patterns` directly to execute the operation.
