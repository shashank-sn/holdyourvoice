---
name: hyv-prepare-judgment
description: Prepare a versioned pre-edit or post-candidate judgment task.
---

# hyv-prepare-judgment

Prepare a versioned pre-edit or post-candidate judgment task. It does not call a model. The post-candidate stage requires a candidate path.

## Usage

```text
hyv prepare-judgment pre-edit|post-candidate kind draft.md profile.json task.json [candidate.md]
```

## Behavior

- Deterministic and local-first: this command never calls a provider and never sends drafts, samples, profiles, or telemetry to a service.
- Commands that write use an explicit output path. Confirm that path before running the command.
- This agent describes how to invoke the command and what it returns. It does not change command behavior or exit codes.

## Handoff

Run `hyv prepare-judgment` directly to execute the operation. Follow-on agents: hyv-reduce-judgment.
