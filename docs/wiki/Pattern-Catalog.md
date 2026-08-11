# pattern catalog

the [220-pattern catalog](https://github.com/shashank-sn/holdyourvoice/blob/main/docs/patterns/AI-WRITING-PATTERNS-1-220.md) is broader editorial guidance. it does not mean all 220 entries execute. it cannot detect authorship or provide a verdict, and it includes examples and legitimate exceptions that are outside the CLI ruleset.

the current executable catalog contains 143 reviewed rules restored from the published `@holdyourvoice/hyv@2.9.24` `signals.ts` artifact plus two retained 3.1 detectors, for 145 rules total. its ruleset version is `2.9.24-static.2`. it includes sentence rules and selected physical-line rules. run `hyv patterns`, or `node dist/cli.js patterns` in a built source checkout, to inspect the exact rules, reconstructable expressions, explicit scopes, and version. intentional inherited overlaps remain separate findings.

a catalog item becomes executable only after deduplication, a clear definition, counterexamples, public provenance review, a severity decision, and positive and negative tests. keep the editorial catalog and deterministic ruleset separate.
