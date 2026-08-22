---
name: hyv-apply-rebuild
description: Validate and evaluate a whole-document rebuild response against a prepared authorized rebuild task.
---

# hyv-apply-rebuild

Validate and evaluate a whole-document rebuild response against a prepared authorized rebuild task. Capability input requires host-guaranteed sensitive-input redaction. It never calls a provider.

## Usage

```text
hyv apply-rebuild task.json response.json profile.json (--capability-stdin|--capability-file path)
```

## Behavior

- Deterministic and local-first: this command never calls a provider and never sends drafts, samples, profiles, or telemetry to a service.
- Commands that write use an explicit output path. Confirm that path before running the command.
- This agent describes how to invoke the command and what it returns. It does not change command behavior or exit codes.

## Handoff

Run `hyv apply-rebuild` directly to execute the operation. Follow-on agents: hyv-verify, hyv-lifecycle.
