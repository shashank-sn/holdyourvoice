# Claude Desktop extension

Hold Your Voice runs as a local Claude Desktop extension. Writing samples, drafts, and portable profile JSON stay in the current tool call. Successful verification stores a text-free resolved-finding event in local profile-scoped learning state. The extension has no network requests and retains no writing text.

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
| `hyv_analyze` | Runs VoiceDNA and AI Editor checks, a separate non-scoring Unicode hygiene inspection, and optional local WritingBrief context. |
| `hyv_hygiene` | Inspects supplied text for hidden Unicode without a profile or file mutation. |
| `hyv_final_check` | Gates exact final text from any producer and returns output only when it is safe to display. |
| `hyv_rewrite_prompt` | Creates a constrained editing brief with optional local WritingBrief context; it makes no model call or rewrite. |
| `hyv_prepare_rewrite` | Creates a versioned local rewrite task with optional CopySpec and WritingBrief context. |
| `hyv_apply_rewrite` | Applies an eligible response to a prepared task and rechecks it locally. |
| `hyv_verify` | Checks a candidate for regressions and lexical preservation, with optional WritingBrief context, then records resolved finding IDs locally when it passes. |
| `hyv_verify_copy_spec` | Adds immutable-claim and prohibited-claim checks to local verification. |
| `hyv_batch_analyze` | Checks two to one hundred supplied drafts for repeated openings and endings without storing them. |
| `hyv_patterns` | Lists the exact executable AI Editor rules. |

Tool calls contain writing, profile JSON, and optional local context. Filesystem paths, shell commands, API keys, and account credentials stay outside the extension. Call `hyv_final_check` on the exact text immediately before display, regardless of which model, tool, or profile produced it. Drafts remain read-only to the extension; cleaning files stays an explicit CLI action. A WritingBrief stays local to the tool call and leaves VoiceDNA measurements, preservation, and output requirements intact. `hyv_verify` and `hyv_verify_copy_spec` may write local state; each event carries a profile fingerprint and resolved rule IDs while excluding the supplied writing.
