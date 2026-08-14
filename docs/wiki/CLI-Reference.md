# cli reference

```bash
node dist/cli.js profile profile.json sample-a.md sample-b.md [--avoid=phrase]
node dist/cli.js analyze draft.md profile.json [writing-brief.json]
node dist/cli.js hygiene draft.md [--fix] [--output=cleaned.md]
node dist/cli.js final-check <path|->
node dist/cli.js batch-analyze draft-a.md draft-b.md [draft-c.md]
node dist/cli.js rewrite-prompt draft.md profile.json [writing-brief.json] > rewrite-brief.md
node dist/cli.js prepare-rewrite draft.md profile.json task.json [copy-spec.json] [writing-brief.json]
node dist/cli.js apply-rewrite task.json response.json profile.json
node dist/cli.js prepare-judgment pre-edit|post-candidate kind draft.md profile.json task.json [candidate.md]
node dist/cli.js reduce-judgment envelope.json envelope.json [envelope.json...]
node dist/cli.js prepare-rebuild draft.md profile.json reduction.json copy-spec.json task.json [writing-brief.json] (--capability-stdin|--capability-file path)
node dist/cli.js apply-rebuild task.json response.json profile.json (--capability-stdin|--capability-file path)
node dist/cli.js verify original.md candidate.md profile.json [writing-brief.json]
node dist/cli.js verify-spec original.md candidate.md profile.json copy-spec.json
node dist/cli.js lifecycle prepare-semantic deterministic.json binding.json receipt.json normal violations.json lifecycle.json
node dist/cli.js lifecycle submit-verdict lifecycle.json task.json evaluator-id verdict.json
node dist/cli.js lifecycle inspect lifecycle.json
node dist/cli.js lifecycle validate-final-approval lifecycle.json (--capability-stdin|--capability-file path)
node dist/cli.js lifecycle finalize lifecycle.json decision.json [--capability-stdin|--capability-file path]
node dist/cli.js learning <show|inspect|add|record|ratify|supersede|migrate|clear> profile.json [value] [options]
node dist/cli.js learning record-approved ready.json approved.json original.md candidate.md profile.json decision.json [copy-spec.json] [writing-brief.json] (--capability-stdin|--capability-file path)
node dist/cli.js patterns
```

`profile` needs two or more samples and writes only the profile path you name. `analyze` returns independent VoiceDNA and AI Editor reports plus a separate non-scoring Unicode hygiene report. An optional WritingBrief adds local audience, intent, and format context without changing the VoiceDNA profile. `hygiene` needs no profile; inspection is read-only, while `--fix` writes a new cleaned path, reports every changed offset, and refuses to overwrite either input or an existing output. Bidirectional controls, tag characters, and zero-width joiners/non-joiners are reported but preserved. `batch-analyze` returns advisory exact duplicate opening and closing findings across a local set. `rewrite-prompt` prints markdown and never calls a model. `verify` is read-only; learning changes require an explicit learning command or separately approved lifecycle transition. `verify-spec` adds the CopySpec claim gate.

`learning show` composes active preferences. `learning inspect` returns bounded text-free event metadata. `learning add` remains the compatibility form of `learning record`; the latter returns the full mutation receipt and accepts `--mutation-id`, `--authority`, `--provenance`, `--weight`, and `--compatibility`. `learning ratify` and `learning supersede` require Profile v3 plus an event ID. `learning migrate <source-v2.json> <target-v3.json>` explicitly moves compatible legacy history into the stable v3 identity. `learning clear` removes that identity's local state. Exact mutation replay is idempotent; conflicting mutation-ID reuse fails closed.

`prepare-rewrite` writes a versioned fingerprint-bound task to the named output path. `apply-rewrite` evaluates only its eligible sentence replacements and exits `2` unless the result is accepted. `prepare-rebuild` requires an upstream REBUILD recommendation, a CopySpec, and a signed `hyv.rebuild-authorization` capability; callers cannot self-select rebuild. `apply-rebuild` re-verifies that same capability and the bound profile, then accepts only a whole-document candidate. Edit and rebuild responses are mutually incompatible. Low lexical survival is allowed only on that authorized rebuild path; claim, polarity, hygiene, fingerprint, and semantic gates still block. Rebuild disagreement escalates and cannot record accepted learning. The CLI lifecycle supports normal-policy semantic review; high-assurance review requires a trusted embedding and fails closed here. Capability material is accepted only through standard input or a permission-checked file. Rejection needs no capability; approval and approved learning require a matching signed final-approval capability. Lifecycle artifacts are immutable, exact replay is idempotent, and conflicting or out-of-order transitions fail closed.

## Universal final-output gate

`final-check` applies to final text from every producer: LLMs, tools, agents, APIs, templates, CLIs, GUIs, and voice-profile workflows. It does not require or select a VoiceDNA profile.

Run it after every rewrite, formatter, template expansion, or manual edit, immediately before display, copy, export, posting, or returning an API response. Clean text passes through byte-for-byte. Only a leading U+FEFF is removed automatically. If any other reported hidden Unicode remains, stdout stays empty, the report is written to stderr, and the command exits `2`; usage or runtime errors exit `1`.

HYV does not intercept unrelated applications in the background. Each host must call `hyv final-check -` or the read-only `hyv_final_check` MCP tool at its own final boundary and deliver only accepted output. A check on an earlier draft does not cover text changed later in the pipeline.

`patterns` prints the ruleset version and exact deterministic catalog. the current `3.2.0-reconciled.1` catalog contains 148 stable entries. entries include reconstructable regular-expression source and flags plus an explicit sentence or physical-line scope. applied profile policy controls blocking, advisory, judgment-required, and disabled behavior without changing catalog IDs. with an installed package, the equivalent command is `hyv patterns`. inspection and analysis stay local; the catalog does not add hosted analysis, provider calls, telemetry, or file mutation.

use `-` as a text input path where a command accepts a draft or sample from standard input.
