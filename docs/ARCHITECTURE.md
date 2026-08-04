# Architecture

`text.ts` establishes stable sentence indices. `voice-dna.ts` builds and evaluates profiles. `ai-editor.ts` owns the public ruleset. `pipeline.ts` composes reports, produces the rewrite brief, and performs post-rewrite verification. `cli.ts` is a file/stdin-only adapter.

Only `pipeline.ts` combines outputs. It may combine pass states, but it must not combine or overwrite engine scores. Add a new rule only in `ai-editor.ts`, with a test and documentation entry. Add a new VoiceDNA signal only in `voice-dna.ts`, with an explanation that makes it auditable.
