# ai editor

AI Editor uses a reviewed, deterministic, versioned ruleset. the current `3.5.0-local.1` ruleset contains 171 stable catalog entries. most rules inspect one sentence; selected rules inspect one physical line and still return stable sentence locations. frontmatter, fenced and inline code, URLs, and Markdown link targets are not prose and are excluded before matching. every rule has a stable ID, severity, reason, repair direction, reconstructable expression, and explicit scope. profile policy is applied after matching; a signed Profile v3 sample allowance may suppress only an eligible default, and an explicit policy always wins.

run `hyv patterns` to inspect an installed release, or `node dist/cli.js patterns` in a built source checkout. the JSON output records the ruleset version and exact executable catalog.

red findings block release. yellow findings invite review and never trigger an automatic rewrite. a rule match is editorial evidence and never proves AI authorship.

the public 220-pattern catalog is broader editorial guidance. it does not mean all 220 entries execute, and it cannot prove authorship. the restored catalog stays local-only: it does not restore 2.9 hosted analysis, telemetry, profile sync, provider calls, or automatic file mutation. rewrite preparation can target flagged sentences only; clean and unflagged text stays unchanged.
