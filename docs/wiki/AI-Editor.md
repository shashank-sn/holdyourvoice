# ai editor

AI Editor uses a reviewed, deterministic, versioned ruleset. the current `3.2.0-reconciled.1` ruleset contains 148 stable catalog entries. most rules inspect one sentence; selected inherited rules inspect one physical line and still return stable sentence locations. every rule has a stable ID, severity, reason, repair direction, reconstructable expression, and explicit scope. profile policy is applied after matching, and duplicate legacy expressions emit one canonical finding.

run `hyv patterns` to inspect an installed release, or `node dist/cli.js patterns` in a built source checkout. the JSON output records the ruleset version and exact executable catalog.

red findings block release. yellow findings invite review and never trigger an automatic rewrite. a rule match is editorial evidence and never proves AI authorship.

the public 220-pattern catalog is broader editorial guidance. it does not mean all 220 entries execute, and it cannot prove authorship. the restored catalog stays local-only: it does not restore 2.9 hosted analysis, telemetry, profile sync, provider calls, or automatic file mutation. rewrite preparation can target flagged sentences only; clean and unflagged text stays unchanged.
