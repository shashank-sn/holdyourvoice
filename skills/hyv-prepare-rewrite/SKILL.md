---
name: hyv-prepare-rewrite
description: Prepare a local, versioned, fingerprint-bound rewrite task.
---

# hyv-prepare-rewrite

Prepare a local, versioned rewrite task written to the named output path. The caller may forward it to a provider; doing so shares the draft and must be an explicit choice. This command never calls a provider itself.

## Usage

```text
hyv prepare-rewrite draft.md profile.json task.json [copy-spec.json] [writing-brief.json]
```

## Behavior

- Deterministic and local-first: this command never calls a provider and never sends drafts, samples, profiles, or telemetry to a service.
- Commands that write use an explicit output path. Confirm that path before running the command.
- This agent describes how to invoke the command and what it returns. It does not change command behavior or exit codes.

## Handoff

Run `hyv prepare-rewrite` directly to execute the operation. Follow-on agents: hyv-apply-rewrite.
