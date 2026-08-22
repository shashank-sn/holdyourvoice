---
name: hyv-verify
description: Verify a revised candidate against an original draft and portable profile.
---

# hyv-verify

Verify a revised candidate against an original draft and portable profile without changing learning state. Verification is read-only; learning changes require an explicit learning command or a separately approved lifecycle transition.

## Usage

```text
hyv verify original.md candidate.md profile.json [writing-brief.json]
```

## Behavior

- Deterministic and local-first: this command never calls a provider and never sends drafts, samples, profiles, or telemetry to a service.
- Commands that write use an explicit output path. Confirm that path before running the command.
- This agent describes how to invoke the command and what it returns. It does not change command behavior or exit codes.

## Handoff

Run `hyv verify` directly to execute the operation. Follow-on agents: hyv-lifecycle.
