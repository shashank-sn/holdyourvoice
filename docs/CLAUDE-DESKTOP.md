# Claude Desktop extension

Hold Your Voice runs as a local Claude Desktop extension. Writing samples, drafts, and portable profile JSON stay in the current tool call. Verification is read-only. The extension has no network requests and retains no writing text.

The MCP learning tools mirror the CLI lifecycle: `hyv_learning_inspect`, `hyv_learning_record`, `hyv_learning_ratify`, `hyv_learning_supersede`, `hyv_learning_migrate`, and `hyv_learning_clear`. Inspection and receipts contain bounded event metadata only. Ratification and supersession require Profile v3; migration requires a Profile v2 source and Profile v3 target.

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
| `hyv_verify` | Checks a candidate for regressions and lexical preservation, with optional WritingBrief context, without changing learning state. |
| `hyv_verify_copy_spec` | Adds immutable-claim and prohibited-claim checks to local verification. |
| `hyv_batch_analyze` | Checks two to one hundred supplied drafts for repeated openings and endings without storing them. |
| `hyv_patterns` | Lists the exact executable AI Editor rules. |
| `hyv_lifecycle_prepare_semantic` | Creates a normal-policy semantic task and its initial lifecycle artifact. |
| `hyv_lifecycle_submit_verdict` | Submits one normal semantic verdict using the server's installed evaluator authorization. |
| `hyv_lifecycle_inspect` | Validates and returns a metadata-only lifecycle summary. |
| `hyv_lifecycle_finalize` | Records human rejection, or approval only on a redaction-attested host. |

Capability-bearing approval tools are absent unless the MCP host starts with `HYV_MCP_SENSITIVE_INPUT_REDACTION=1`. On an attested host, `hyv_lifecycle_validate_final_approval`, `hyv_learning_record_approved`, `hyv_prepare_rebuild`, and `hyv_apply_rebuild` are also registered. Trust roots and evaluator lists come only from the permission-checked installed approval context; tool inputs cannot replace them.

The installed approval context uses owner and mode checks on POSIX. On Windows it relies on the fixed per-user configuration path and the operating system ACL enforced when the file is opened. Symlinks, non-files, hard links, oversized files, changing files, and malformed trust data fail closed on every platform.

Tool calls contain writing, profile JSON, and optional local context. Filesystem paths, shell commands, API keys, and account credentials stay outside the extension. Call `hyv_final_check` on the exact text immediately before display, regardless of which model, tool, or profile produced it. Drafts and verification remain read-only; cleaning files stays an explicit CLI action. A WritingBrief stays local to the tool call and leaves VoiceDNA measurements, preservation, and output requirements intact. Approved learning replays the signed finalization against the installed trust context, rechecks deterministic bindings, and stores text-free metadata only.
