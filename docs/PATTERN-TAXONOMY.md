# AI Editor pattern taxonomy

The owner-authored [220-pattern editorial catalog](patterns/AI-WRITING-PATTERNS-1-220.md) is the canonical editorial reference. It preserves the original order, each pattern's mechanism, spotting test, ugly escalation, and selective legitimate exceptions. It is broader than the executable catalog: not all 220 entries are rules, and neither document can detect authorship.

The current automated ruleset is `2.9.24-static.2`. It restores a reviewed 143-rule static catalog from the published `@holdyourvoice/hyv@2.9.24` `signals.ts` artifact and retains two detectors introduced in 3.1, for 145 rules total. It covers generic AI vocabulary, formulaic connectors, hedging, binary persuasion templates, manufactured revelation, dramatic punctuation, question hooks, and related deterministic signals. Most rules inspect one sentence. Selected inherited rules inspect one physical line and return stable sentence locations. Intentional catalog overlaps produce separate findings and each finding contributes to the score.

Each executable rule exposes a stable ID, expression, severity, explanation, repair direction, and scope through `hyv patterns`. From a built source checkout, use `node dist/cli.js patterns`. A catalog entry becomes executable after deduplication, public provenance review, counterexamples, and tests. The 220-pattern document remains guidance rather than a set of 220 executable regexes.

Execution stays local-only. The restored catalog does not bring back the 2.9 hosted analysis, telemetry, authentication, profile sync, provider calls, automatic file mutation, or whole-draft rewriting. Rewrite preparation targets flagged sentences; clean and unflagged text stays unchanged.
