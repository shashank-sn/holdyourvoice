---
name: hyv-inspect-hidden-text
description: Inspect hidden text controls with a non-mutating policy report.
---

# hyv-inspect-hidden-text

Inspect hidden text controls with a non-mutating policy report. Findings are not watermark verdicts. An optional policy.json restricts which controls are reported.

## Usage

```text
hyv inspect-hidden-text draft.md [policy.json]
```

## Behavior

- Deterministic and local-first: this command never calls a provider and never sends drafts, samples, profiles, or telemetry to a service.
- Commands that write use an explicit output path. Confirm that path before running the command.
- This agent describes how to invoke the command and what it returns. It does not change command behavior or exit codes.

## Handoff

Run `hyv inspect-hidden-text` directly to execute the operation. Follow-on agents: hyv-apply-hidden-text-policy, hyv-final-check.
