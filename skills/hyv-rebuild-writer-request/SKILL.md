---
name: hyv-rebuild-writer-request
description: Create the writer-only payload for a prepared rebuild task.
---

# hyv-rebuild-writer-request

Create the writer-only payload for a prepared rebuild. It excludes the source draft, capability, profile body, and validation evidence.

## Usage

```text
hyv rebuild-writer-request task.json writer-request.json
```

## Behavior

- Deterministic and local-first: this command never calls a provider and never sends drafts, samples, profiles, or telemetry to a service.
- Commands that write use an explicit output path. Confirm that path before running the command.
- This agent describes how to invoke the command and what it returns. It does not change command behavior or exit codes.

## Handoff

Run `hyv rebuild-writer-request` directly to execute the operation. Follow-on agents: hyv-apply-rebuild.
