---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
created_at: 2026-08-11
topic: restore Hyv 2.9.24 pattern coverage
---

# Restore Hyv 2.9.24 pattern coverage

## Goal Capsule

Restore the broader deterministic AI-pattern findings shipped in `@holdyourvoice/hyv@2.9.24` inside the current local-only engine. Keep the 3.1 preservation, verification, CLI, and MCP contracts unchanged. Stop if parity would require importing hosted services, telemetry, credentials, provider calls, or automatic whole-draft rewriting.

---

## Product Contract

### Requirements

- R1. The current AI Editor must report the reviewed 2.9.24 static pattern IDs, including `ai.meaningful`, `struct.heres-where`, and `cringe.10x`.
- R2. The restored rules must expose stable IDs, severity, reason, repair direction, and executable expressions through the CLI and MCP pattern catalogs.
- R3. A match is editorial evidence, never an authorship verdict. Red findings block release. Yellow findings remain advisory.
- R4. Rewrite preparation may target only flagged sentences. A clean draft or unflagged sentence must remain byte-identical.
- R5. The engine must remain local-only. The port must exclude 2.9 hosted analysis, telemetry, authentication, profile sync, provider calls, and automatic file mutation.
- R6. README and wiki documentation must describe the expanded executable ruleset and its relationship to the 220-pattern editorial catalog.
- R7. The release must record the source package version and the new ruleset version in tests and documentation.

### Acceptance Examples

- `This work is meaningful.` reports `ai.meaningful`.
- `Here's the part nobody is talking about.` reports `struct.heres-where` or the narrower inherited insider rule when both apply, with stable deterministic ordering.
- `The change delivered a 10x result.` reports `cringe.10x`.
- A clean draft produces no AI Editor findings and rewrite preparation preserves it exactly.

### Scope Boundaries

The port covers the 2.9.24 static deterministic catalog that can fit the current sentence-finding contract. Document-level cadence heuristics remain deferred unless they can produce stable sentence locations and tested counterexamples. The old hosted and mutating workflow stays out of scope.

---

## Planning Contract

### Key Technical Decisions

1. Port the published 2.9.24 npm tarball, not marketing copy, as the compatibility source. The old source repository is private, while the tarball is the exact shipped artifact.
2. Keep one current AI Editor ruleset rather than a hidden compatibility mode. Users invoking the latest build expect the broader findings without a second flag.
3. Store inherited rules as typed data separate from the analyzer. This keeps the rule catalog reviewable and lets CLI and MCP expose the same metadata.
4. Remove stateful global-regex behavior from execution. The analyzer must reset expressions or use non-global clones so matches do not depend on prior sentences.
5. Preserve the current finding and scoring contracts. This change expands evidence; it does not restore 2.9 auto-fix or network behavior.

### Risks

- Some inherited 2.9 expressions are broad and can create false positives. Every ported rule needs a positive fixture and a counterexample before release.
- Several 2.9 IDs overlap semantically. Deterministic ordering and deduplication must be explicit.
- Documentation currently says the executable set is intentionally small. README and wiki language must change with the code.

---

## Implementation Units

### U1. Restore the deterministic rule catalog

**Requirements:** R1, R2, R3, R7

**Files:** `src/ai-editor-rules.ts`, `src/ai-editor.ts`, `src/ai-editor.test.ts`

**Approach:** Translate the shipped 2.9.24 static rule arrays into the current `Rule` shape. Review IDs, severities, expressions, reasons, and suggestions. Execute rules without regex state leakage and keep finding order stable.

**Test scenarios:** Detect every executable rule from a positive fixture; reject one counterexample per rule; detect the three benchmark examples; prove repeated analysis returns identical findings; prove two sentences containing the same rule are both reported.

### U2. Preserve pipeline, CLI, and MCP behavior

**Requirements:** R2, R4, R5

**Files:** `src/pipeline.test.ts`, `src/rewrite-task.test.ts`, `src/cli.test.ts`, `src/mcp-tools.test.ts`

**Approach:** Extend parity tests around the shared analyzer. Keep rewrite eligibility limited to flagged sentence IDs and keep clean drafts unchanged.

**Test scenarios:** CLI and MCP expose the same normalized catalog; rewrite preparation marks only matching sentences eligible; zero-finding input produces no replacement opportunity; verification retains existing exit and regression behavior.

### U3. Update public documentation

**Requirements:** R3, R6, R7

**Files:** `Readme.md`, `docs/PATTERN-TAXONOMY.md`, `docs/wiki/AI-Editor.md`, `docs/wiki/Pattern-Catalog.md`, `docs/wiki/CLI-Reference.md`, `docs/wiki/_Sidebar.md`

**Approach:** State that the latest engine restores the reviewed 2.9.24 deterministic catalog while the 220-entry document remains broader editorial guidance. Document local-only boundaries, inspection commands, and version provenance. Change the sidebar only if a new page is needed.

**Test scenarios:** Documentation commands match the executable CLI; all relative links resolve; claims about rule count come from the generated catalog rather than the old “220+” label.

---

## Verification Contract

- Run `npm test`.
- Run `npm run check:release`.
- Run `git diff --check`.
- Inspect `node dist/cli.js patterns` and confirm CLI/MCP catalog parity through tests.
- Run the three benchmark phrases and one clean counterexample through the built analyzer.

---

## Definition of Done

- U1–U3 satisfy their test scenarios.
- The broader rules are executable in the latest build with stable metadata and deterministic ordering.
- Clean text remains byte-identical through rewrite preparation and verification.
- README and wiki reflect the shipped behavior without authorship-detection claims.
- Tests, release audit, and whitespace checks pass.
- No old hosted, telemetry, authentication, or mutation code enters the diff.
- No abandoned extraction or experimental code remains in the branch.
