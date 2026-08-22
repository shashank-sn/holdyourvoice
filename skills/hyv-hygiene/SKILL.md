---
name: hyv-hygiene
description: Inspect text for zero-width characters, bidirectional controls, tag characters, and unusual spaces.
---

# hyv-hygiene

Inspect text for zero-width characters, bidirectional controls, Unicode tag characters, and unusual spaces without requiring a voice profile. Inspection is read-only. --fix writes a new cleaned path (never overwriting the input or an existing output), reports every changed offset, and preserves controls it is not authorized to remove.

## Usage

```text
hyv hygiene draft.md [--fix] [--output=cleaned.md]
```

## Behavior

- Deterministic and local-first: this command never calls a provider and never sends drafts, samples, profiles, or telemetry to a service.
- Commands that write use an explicit output path. Confirm that path before running the command.
- This agent describes how to invoke the command and what it returns. It does not change command behavior or exit codes.

## Handoff

Run `hyv hygiene` directly to execute the operation. Follow-on agents: hyv-final-check.
