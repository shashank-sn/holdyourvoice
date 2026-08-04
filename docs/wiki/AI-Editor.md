# ai editor

AI Editor uses a small, deterministic, versioned ruleset. every executable rule has a stable ID, severity, reason, repair direction, and sentence-level finding. run `node dist/cli.js patterns` to inspect the rules installed in your checkout.

red findings block release. yellow findings invite review and never trigger an automatic rewrite. a rule match is editorial evidence and never proves AI authorship.

the public 220-pattern catalog is broader editorial guidance. the CLI implements a much smaller set of deterministic checks.
