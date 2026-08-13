# pattern catalog

the [220-pattern catalog](https://github.com/shashank-sn/holdyourvoice/blob/main/docs/patterns/AI-WRITING-PATTERNS-1-220.md) is broader editorial guidance. it does not mean all 220 entries execute. it cannot detect authorship or provide a verdict, and it includes examples and legitimate exceptions that are outside the CLI ruleset.

the current catalog contains 148 stable entries. its ruleset version is `3.2.0-reconciled.1`. it includes sentence rules and selected physical-line rules. run `hyv patterns`, or `node dist/cli.js patterns` in a built source checkout, to inspect the exact rules, reconstructable expressions, explicit scopes, and version. profile policy is applied after catalog matching; duplicate legacy expressions remain addressable by ID but emit one canonical finding.

a catalog item becomes executable only after deduplication, a clear definition, counterexamples, public provenance review, a severity decision, and positive and negative tests. keep the editorial catalog and deterministic ruleset separate.
