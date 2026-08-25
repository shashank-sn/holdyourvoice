---
name: hyv-profile
description: Build a portable VoiceDNA profile from at least two writing samples.
---

# hyv-profile

Build a portable VoiceDNA profile from at least two writing samples. Samples stay in memory and are not saved into the profile; only measured voice features are written. The output path must be supplied first, followed by two or more sample paths. Use --avoid=phrase to add phrases that must never appear in later output.

## Usage

```text
hyv profile profile.json sample-a.md sample-b.md [sample-c.md] [--avoid=phrase]
```

## Behavior

- Deterministic and local-first: this command never calls a provider and never sends drafts, samples, profiles, or telemetry to a service.
- This command writes the stable Profile v2 shape. For channel-specific V3 profiles use `hyv profile v3 profile.json --id=writer.email --channel=email sample-a.md sample-b.md [--tone=0,0,0,0,0] [--avoid=phrase]`; it signs policy and sample allowances without retaining raw prose. To blend approved V3 profiles locally, use `hyv profile compose --ratio 70:30 profile-a.json profile-b.json`.
- Commands that write use an explicit output path. Confirm that path before running the command.
- This agent describes how to invoke the command and what it returns. It does not change command behavior or exit codes.

## Handoff

Run `hyv profile` directly to execute the operation. Follow-on agents: hyv-analyze, hyv-rewrite-prompt.
