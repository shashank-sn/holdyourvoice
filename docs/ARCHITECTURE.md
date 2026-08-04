# Architecture

`text.ts` establishes stable sentence indices and text measurements. `voice-dna.ts` builds 13-element profiles and evaluates the explicitly automated VoiceDNA checks. `ai-editor.ts` owns the public deterministic ruleset. `pipeline.ts` composes reports, produces the priority-tiered rewrite brief, and performs post-rewrite verification. `cli.ts` is a file/stdin-only adapter.

`pipeline.ts` is the only output-composition point. It combines pass states and keeps both engine scores unchanged. Add an AI Editor rule in `ai-editor.ts` with a test and documentation entry. Add a VoiceDNA signal in `voice-dna.ts` with an auditable explanation. The [prompt contract](PROMPT-CONTRACT.md) owns tier ordering; changing the priority above preservation requires a contract and test update.
