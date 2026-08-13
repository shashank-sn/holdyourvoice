# AI Editor pattern taxonomy

The owner-authored [220-pattern editorial catalog](patterns/AI-WRITING-PATTERNS-1-220.md) is the canonical editorial reference. It preserves the original order, each pattern's mechanism, spotting test, ugly escalation, and selective legitimate exceptions. It is broader than the executable catalog: not all 220 entries are rules, and neither document can detect authorship.

The current automated ruleset is `3.2.0-reconciled.1`. Its 148 stable entries cover generic AI vocabulary, formulaic connectors, hedging, binary persuasion templates, manufactured revelation, dramatic punctuation, question hooks, performative sincerity, and related deterministic signals. Most rules inspect one sentence. Selected inherited rules inspect one physical line and return stable sentence locations. Profile policy maps matches to blocking, advisory, judgment-required, or disabled behavior. Duplicate legacy expressions remain cataloged for ID compatibility but emit only their canonical finding.

Each executable rule exposes a stable ID, expression, severity, explanation, repair direction, and scope through `hyv patterns`. From a built source checkout, use `node dist/cli.js patterns`. A catalog entry becomes executable after deduplication, public provenance review, counterexamples, and tests. The 220-pattern document remains guidance rather than a set of 220 executable regexes.

Execution stays local-only. The restored catalog does not bring back the 2.9 hosted analysis, telemetry, authentication, profile sync, provider calls, automatic file mutation, or whole-draft rewriting. Rewrite preparation targets flagged sentences; clean and unflagged text stays unchanged.
