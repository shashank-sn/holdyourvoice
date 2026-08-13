# cli reference

```bash
node dist/cli.js profile profile.json sample-a.md sample-b.md [--avoid=phrase]
node dist/cli.js analyze draft.md profile.json [writing-brief.json]
node dist/cli.js hygiene draft.md [--fix] [--output=cleaned.md]
node dist/cli.js final-check <path|->
node dist/cli.js batch-analyze draft-a.md draft-b.md [draft-c.md]
node dist/cli.js rewrite-prompt draft.md profile.json [writing-brief.json] > rewrite-brief.md
node dist/cli.js verify original.md candidate.md profile.json [writing-brief.json]
node dist/cli.js learning show profile.json
node dist/cli.js learning add profile.json "Keep the direct opening."
node dist/cli.js learning clear profile.json
node dist/cli.js patterns
```

`profile` needs two or more samples and writes only the profile path you name. `analyze` returns independent VoiceDNA and AI Editor reports plus a separate non-scoring Unicode hygiene report. An optional WritingBrief adds local audience, intent, and format context without changing the VoiceDNA profile. `hygiene` needs no profile; inspection is read-only, while `--fix` writes a new cleaned path, reports every changed offset, and refuses to overwrite either input or an existing output. Bidirectional controls, tag characters, and zero-width joiners/non-joiners are reported but preserved. `batch-analyze` returns advisory exact duplicate opening and closing findings across a local set. `rewrite-prompt` prints markdown and never calls a model. A passing `verify` records resolved finding IDs by default under local profile-scoped learning state; it never stores either text. `learning show`, `add`, and `clear` inspect, add, or remove that profile's local state.

## Universal final-output gate

`final-check` applies to final text from every producer: LLMs, tools, agents, APIs, templates, CLIs, GUIs, and voice-profile workflows. It does not require or select a VoiceDNA profile.

Run it after every rewrite, formatter, template expansion, or manual edit, immediately before display, copy, export, posting, or returning an API response. Clean text passes through byte-for-byte. Only a leading U+FEFF is removed automatically. If any other reported hidden Unicode remains, stdout stays empty, the report is written to stderr, and the command exits `2`; usage or runtime errors exit `1`.

HYV does not intercept unrelated applications in the background. Each host must call `hyv final-check -` or the read-only `hyv_final_check` MCP tool at its own final boundary and deliver only accepted output. A check on an earlier draft does not cover text changed later in the pipeline.

`patterns` prints the ruleset version and exact executable deterministic catalog. the current `2.9.24-static.2` catalog contains 143 reviewed rules restored from the published `@holdyourvoice/hyv@2.9.24` `signals.ts` artifact plus two retained 3.1 detectors, for 145 rules total. entries include reconstructable regular-expression source and flags plus an explicit sentence or physical-line scope. with an installed package, the equivalent command is `hyv patterns`. inspection and analysis stay local; the restored catalog does not add hosted analysis, provider calls, telemetry, or file mutation.

use `-` as a text input path where a command accepts a draft or sample from standard input.
