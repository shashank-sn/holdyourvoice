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
- `hyv_prepare_rewrite`: prepare a versioned, fingerprint-bound sentence-edit task.
- `hyv_apply_rewrite`: apply eligible sentence replacements and recheck the candidate locally.
- `hyv_verify`: check a candidate for regressions and preservation.
- `hyv_verify_copy_spec`: add immutable-claim and prohibited-claim checks.
- `hyv_batch_analyze`: inspect repeated openings and endings across supplied drafts.
- `hyv_patterns`: list the exact executable pattern rules.
- `hyv_learning_inspect`, `hyv_learning_record`, `hyv_learning_ratify`, `hyv_learning_supersede`, `hyv_learning_migrate`, and `hyv_learning_clear`: inspect or explicitly mutate text-free local learning.
- `hyv_lifecycle_prepare_semantic`, `hyv_lifecycle_submit_verdict`, and `hyv_lifecycle_inspect`: advance and inspect the normal-policy semantic lifecycle.
- `hyv_lifecycle_finalize`: record human rejection, or approval only when the host guarantees sensitive-input redaction.

When the MCP host starts with `HYV_MCP_SENSITIVE_INPUT_REDACTION=1`, it also registers `hyv_lifecycle_validate_final_approval` and `hyv_learning_record_approved`. Trust roots and evaluator authorization come from the permission-checked installed context. Tools validate approval capabilities but never mint them. High-assurance semantic review requires a separate trusted embedding and is not exposed by these tools.
