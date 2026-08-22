---
name: hyv-verify-spec
description: Verify a candidate against the existing voice gates and a local CopySpec.
---

# hyv-verify-spec

Verify a candidate against the existing voice gates and a local CopySpec. Immutable claims remain verbatim unless atoms are supplied; then each declared atom must remain. Prohibited claims fail closed.

## Usage

```text
hyv verify-spec original.md candidate.md profile.json copy-spec.json [writing-brief.json]
```

## Behavior

- Deterministic and local-first: this command never calls a provider and never sends drafts, samples, profiles, or telemetry to a service.
- Commands that write use an explicit output path. Confirm that path before running the command.
- This agent describes how to invoke the command and what it returns. It does not change command behavior or exit codes.

## Handoff

Run `hyv verify-spec` directly to execute the operation. Follow-on agents: hyv-lifecycle.
