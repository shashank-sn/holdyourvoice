# Claude Desktop extension

Hold Your Voice can run as a local Claude Desktop extension. It accepts writing samples, drafts, and portable profile JSON only in the current tool call. A successful verification writes a text-free resolved-finding event to local profile-scoped learning state. It does not retain writing text or make network requests.

## Build the extension

```bash
npm ci
npm run pack:claude
```

The command creates `dist/hold-your-voice.mcpb`.

Published GitHub Releases attach that same file automatically.

## Install it

1. Open Claude Desktop.
2. Go to **Settings → Extensions → Advanced settings → Install Extension**.
3. Select `dist/hold-your-voice.mcpb`.
4. Start a new conversation and use the Hold Your Voice tools.

## Available tools

| Tool | What it does |
| --- | --- |
| `hyv_build_profile` | Builds a portable VoiceDNA profile from two or more supplied samples. |
| `hyv_analyze` | Runs separate VoiceDNA and AI Editor checks. |
| `hyv_rewrite_prompt` | Creates a constrained editing brief; it does not call a model or rewrite text. |
| `hyv_verify` | Checks a candidate for regressions and lexical preservation, then records resolved finding IDs locally when it passes. |
| `hyv_patterns` | Lists the exact executable AI Editor rules. |

The extension never changes a draft and never receives a filesystem path, shell command, API key, or account credential. `hyv_verify` is the one tool that writes local state; the event has a profile fingerprint and resolved rule IDs, never the supplied writing.
