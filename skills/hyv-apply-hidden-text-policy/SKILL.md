---
name: hyv-apply-hidden-text-policy
description: Apply only explicitly approved minimal hidden-text removals and return hashes, exact changes, and remaining findings.
---

# hyv-apply-hidden-text-policy

Apply only explicitly approved minimal hidden-text removals and return hashes, exact changes, and remaining review findings. The output must differ from the input path. This never invents removals beyond the approved policy.

## Usage

```text
hyv apply-hidden-text-policy draft.md policy.json output.md
```

## Behavior

- Deterministic and local-first: this command never calls a provider and never sends drafts, samples, profiles, or telemetry to a service.
- Commands that write use an explicit output path. Confirm that path before running the command.
- This agent describes how to invoke the command and what it returns. It does not change command behavior or exit codes.

## Handoff

Run `hyv apply-hidden-text-policy` directly to execute the operation. Follow-on agents: hyv-final-check.
