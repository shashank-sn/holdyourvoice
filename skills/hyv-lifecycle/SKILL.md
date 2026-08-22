---
name: hyv-lifecycle
description: Advance and inspect the rewrite lifecycle: prepare-semantic, submit-verdict, inspect, validate-final-approval, finalize.
---

# hyv-lifecycle

Advance and inspect the rewrite lifecycle. prepare-semantic builds an initial immutable artifact; submit-verdict records one verdict; inspect reads an artifact without exposing source or candidate hashes; validate-final-approval checks a capability against the trust context; finalize records an approved or rejected decision. Artifacts are immutable and exact replay is idempotent.

## Usage

```text
hyv lifecycle <prepare-semantic|submit-verdict|inspect|validate-final-approval|finalize> ...
```

## Behavior

- Deterministic and local-first: this command never calls a provider and never sends drafts, samples, profiles, or telemetry to a service.
- Commands that write use an explicit output path. Confirm that path before running the command.
- This agent describes how to invoke the command and what it returns. It does not change command behavior or exit codes.

## Handoff

Run `hyv lifecycle` directly to execute the operation. Follow-on agents: hyv-learning.
