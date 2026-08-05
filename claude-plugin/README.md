# Hold Your Voice for Claude Code

Use the local Hold Your Voice MCP server from Claude Code. It builds portable VoiceDNA profiles, checks a draft with separate VoiceDNA and AI Editor reports, creates a constrained editing brief, and verifies a revised candidate.

## Privacy

The plugin starts the pinned public `@holdyourvoice/hyv` package locally through `npm exec`. It sends no drafts, samples, profiles, or telemetry to a Hold Your Voice service. The one-time package download is performed by npm.

## Install

```text
/plugin marketplace add shashank-sn/holdyourvoice
/plugin install hold-your-voice@hold-your-voice
```

Node.js 20 or later and npm are required. Claude Code starts the MCP server when the plugin is enabled.

## Tools

- `hyv_build_profile`: build a portable profile from at least two supplied writing samples.
- `hyv_analyze`: run the two independent checks on a draft.
- `hyv_rewrite_prompt`: make an editing brief without changing the draft.
- `hyv_verify`: check a candidate for regressions and preservation.
- `hyv_patterns`: list the exact executable pattern rules.
