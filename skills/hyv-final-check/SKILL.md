---
name: hyv-final-check
description: Gate exact user-facing text from any model, tool, or interface.
---

# hyv-final-check

Gate exact final text from every producer. Returns output only when clean or after removing a leading byte-order mark; unresolved hidden characters withhold output. It does not require or select a VoiceDNA profile. Run it immediately before display, copy, export, posting, or returning an API response.

## Usage

```text
hyv final-check <path|->
```

## Behavior

- Deterministic and local-first: this command never calls a provider and never sends drafts, samples, profiles, or telemetry to a service.
- Commands that write use an explicit output path. Confirm that path before running the command.
- This agent describes how to invoke the command and what it returns. It does not change command behavior or exit codes.

## Handoff

Run `hyv final-check` directly to execute the operation.
