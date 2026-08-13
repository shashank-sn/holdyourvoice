# Hold Your Voice for Claude Code

Use the local Hold Your Voice MCP server from Claude Code. It builds portable VoiceDNA profiles, checks a draft with separate VoiceDNA and AI Editor reports plus Unicode hygiene, creates a constrained editing brief, and verifies a revised candidate.

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
- `hyv_analyze`: run the two independent checks and non-scoring Unicode hygiene inspection on a draft.
- `hyv_hygiene`: inspect supplied text for hidden Unicode without a voice profile or file mutation.
- `hyv_final_check`: gate exact final text from any model or tool and return output only when it is safe to deliver.
- `hyv_rewrite_prompt`: make an editing brief without changing the draft.
- `hyv_verify`: check a candidate for regressions and preservation.
- `hyv_patterns`: list the exact executable pattern rules.
