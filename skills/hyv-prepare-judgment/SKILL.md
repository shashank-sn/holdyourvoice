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

## Word economy review

For a post-candidate form judgment, review whether every word earns its place before final verification and delivery. Name the phrase and sentence range, propose a cut, and explain why meaning, evidence, clarity, and voice survive it. Preserve necessary uncertainty, attribution, emphasis, rhythm, and transitions. Do not use a word-count target. Record unresolved cuts as findings and use ESCALATE; do not return CLEAR merely because the candidate is shorter. Report concerns outside the authorized edit scope without changing text. The local command prepares the task; it does not perform this editorial judgment.

## Handoff

Run `hyv prepare-judgment` directly to execute the operation. Follow-on agents: hyv-reduce-judgment.
