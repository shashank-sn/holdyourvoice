---
name: hyv-learning
description: Inspect or explicitly mutate text-free local learning state for a profile.
---

# hyv-learning

Inspect or explicitly mutate text-free local learning for a profile. show composes active preferences; inspect returns bounded event metadata; add/record write an explicit instruction with authority and provenance; ratify and supersede require Profile v3 plus an event id; migrate moves v2 history into v3; clear removes the identity state. Accepted-candidate learning requires a separately approved lifecycle transition.

## Usage

```text
hyv learning <show|inspect|add|record|record-approved|ratify|supersede|migrate|clear> profile.json [value] [options]
```

## Behavior

- Deterministic and local-first: this command never calls a provider and never sends drafts, samples, profiles, or telemetry to a service.
- Commands that write use an explicit output path. Confirm that path before running the command.
- This agent describes how to invoke the command and what it returns. It does not change command behavior or exit codes.

## Handoff

Run `hyv learning` directly to execute the operation.
