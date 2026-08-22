---
name: hyv-reduce-judgment
description: Reduce bound judgment envelopes into SHIP, EDIT, REBUILD, CLEAR, or ESCALATE.
---

# hyv-reduce-judgment

Reduce bound judgment envelopes into SHIP, EDIT, REBUILD, CLEAR, or ESCALATE. It does not call a model.

## Usage

```text
hyv reduce-judgment envelope.json envelope.json envelope.json [envelope.json...]
```

## Behavior

- Deterministic and local-first: this command never calls a provider and never sends drafts, samples, profiles, or telemetry to a service.
- Commands that write use an explicit output path. Confirm that path before running the command.
- This agent describes how to invoke the command and what it returns. It does not change command behavior or exit codes.

## Handoff

Run `hyv reduce-judgment` directly to execute the operation. Follow-on agents: hyv-prepare-rebuild.
