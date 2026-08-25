# rule authoring

new rules need a stable ID, scope, severity recommendation, public provenance, a positive example, a counterexample, and an intended impact statement. Add metadata under `test-fixtures/rules/` and run `node scripts/validate-rule-contributions.mjs`.

experimental rules are documentation and fixture work only. They do not enter the default catalog or change a release gate until a maintainer promotes them with implementation, tests, and a ruleset changelog entry.

rule IDs are immutable. A removal needs a compatibility note; a severity or policy change needs updated fixtures and an explicit false-positive/false-negative hypothesis. Do not use client text, private prompts, or unlicensed writing as a fixture.
