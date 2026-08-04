# Architecture

`text.ts` establishes stable sentence indices and text measurements. `voice-dna.ts` builds 13-element profiles and evaluates the explicitly automated VoiceDNA checks. `ai-editor.ts` owns the public deterministic ruleset. `pipeline.ts` composes reports, produces the priority-tiered rewrite brief, and performs post-rewrite verification. `cli.ts` is a file/stdin-only adapter.

Only `pipeline.ts` combines outputs. It may combine pass states, but it must not combine or overwrite engine scores. Add a new rule only in `ai-editor.ts`, with a test and documentation entry. Add a new VoiceDNA signal only in `voice-dna.ts`, with an explanation that makes it auditable. The [prompt contract](PROMPT-CONTRACT.md) owns tier ordering; do not place a new instruction above preservation without changing that contract and its tests.
