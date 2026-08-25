---
name: hyv-analyze
description: Run separate VoiceDNA and AI Editor checks plus a non-scoring Unicode hygiene inspection against a draft.
---

# hyv-analyze

Run independent VoiceDNA and AI Editor reports plus a separate non-scoring Unicode hygiene report against a draft using a portable profile. An optional WritingBrief adds local audience, intent, and format context without changing the profile. Analysis is read-only; it never rewrites the draft or calls a model.

## Usage

```text
hyv analyze draft.md profile.json [writing-brief.json]
```

## Behavior

- Deterministic and local-first: this command never calls a provider and never sends drafts, samples, profiles, or telemetry to a service.
- AI Editor scans author prose only. Frontmatter, fenced code, inline code, URLs, and Markdown link targets are excluded; a match remains an editorial signal, not proof of AI authorship.
- A Profile v3 can carry a signed, non-verbatim allowance for a narrow stylistic default. An explicit profile policy always takes precedence, and no allowance weakens hygiene, fact, logic, or avoid-list checks.
- Commands that write use an explicit output path. Confirm that path before running the command.
- This agent describes how to invoke the command and what it returns. It does not change command behavior or exit codes.

## Handoff

Run `hyv analyze` directly to execute the operation. For ordinary editing, follow on with hyv-rewrite-prompt or hyv-prepare-rewrite. When the caller asks for a strict AI-pattern and voice-match decision, hand off to hyv-strict-check with a calibrated Profile v3 and the required local samples; analysis alone is not a strict-ready result.
