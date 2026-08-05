# Claude Code plugin

Hold Your Voice ships as a free Claude Code plugin through this public GitHub marketplace. It starts the MIT-licensed npm package locally through `npx`; no Hold Your Voice server receives writing, profiles, or telemetry.

## Install

In Claude Code, run:

```text
/plugin marketplace add shashank-sn/holdyourvoice
/plugin install hold-your-voice@hold-your-voice
```

Node.js 20 or newer and npm must be installed. Claude Code uses `npm exec --package=@holdyourvoice/hyv@3.0.2 -- hyv mcp` to download the pinned public package and start a local stdio process.

## What it exposes

| Tool | Purpose |
| --- | --- |
| `hyv_build_profile` | Build a portable VoiceDNA profile from supplied samples. |
| `hyv_analyze` | Check a draft with separate VoiceDNA and AI Editor reports. |
| `hyv_rewrite_prompt` | Create a constrained editing brief without rewriting text. |
| `hyv_verify` | Verify a candidate for new findings and lexical preservation. |
| `hyv_patterns` | List the exact executable editorial rules. |

The plugin is read-only: it takes writing and profile JSON in the current tool call, does not accept file paths or credentials, and does not write or retain text.
