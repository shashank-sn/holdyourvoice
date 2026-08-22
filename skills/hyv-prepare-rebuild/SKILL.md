---
name: hyv-prepare-rebuild
description: Prepare a rebuild task only after an upstream REBUILD recommendation, a CopySpec, and a signed rebuild-authorization capability.
---

# hyv-prepare-rebuild

Prepare a rebuild task only after an upstream REBUILD recommendation, a CopySpec, and a signed rebuild-authorization capability. Capability input requires host-guaranteed sensitive-input redaction. Callers cannot self-select rebuild.

## Usage

```text
hyv prepare-rebuild draft.md profile.json reduction.json copy-spec.json task.json [writing-brief.json] [--recomposition-policy policy.json] (--capability-stdin|--capability-file path)
```

## Behavior

- Deterministic and local-first: this command never calls a provider and never sends drafts, samples, profiles, or telemetry to a service.
- Commands that write use an explicit output path. Confirm that path before running the command.
- This agent describes how to invoke the command and what it returns. It does not change command behavior or exit codes.

## Handoff

Run `hyv prepare-rebuild` directly to execute the operation. Follow-on agents: hyv-apply-rebuild.
