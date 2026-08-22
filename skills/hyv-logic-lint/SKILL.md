---
name: hyv-logic-lint
description: Run the deterministic document-coherence gate for topic drift, unanchored inference, and internal contradictions.
---

# hyv-logic-lint

Run the deterministic document-coherence gate. It detects configured topic drift, unanchored inference, and direct internal contradictions; it does not verify facts or approve publication.

## Usage

```text
hyv logic-lint <draft|-> [writing-brief.json]
```

## Behavior

- Deterministic and local-first: this command never calls a provider and never sends drafts, samples, profiles, or telemetry to a service.
- Commands that write use an explicit output path. Confirm that path before running the command.
- This agent describes how to invoke the command and what it returns. It does not change command behavior or exit codes.

## Handoff

Run `hyv logic-lint` directly to execute the operation. Follow-on agents: hyv-verify.
