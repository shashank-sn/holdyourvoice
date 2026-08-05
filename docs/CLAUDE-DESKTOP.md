# Claude Desktop extension

Hold Your Voice can run as a local Claude Desktop extension. It accepts writing samples, drafts, and portable profile JSON only in the current tool call. It does not read local files, write files, make network requests, or retain text.

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
| `hyv_verify` | Checks a candidate for regressions and lexical preservation. |
| `hyv_patterns` | Lists the exact executable AI Editor rules. |

The extension is read-only. It never changes a draft and never receives a filesystem path, shell command, API key, or account credential.
