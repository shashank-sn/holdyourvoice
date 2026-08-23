---
title: simplify the codebase without behavior changes
status: implementation-ready
date: 2026-08-23
branch: refactor/simplify-codebase
base_commit: 5abce246a5e7be23ab6036271b2ad25f34b5c09b
---

# Goal

Make the code easier to read and change without removing commands, MCP tools, portable agents, package exports, validation rules, safety checks, or release checks. Replace the README with a shorter guide written in simple technical English.

# Scope boundaries

- Keep every CLI command, MCP tool, portable agent, public function, error exit code, output shape, and security boundary.
- Preserve rule IDs, scores, thresholds, fingerprints, canonical JSON, benchmark policy, and stored learning formats.
- Keep the existing dependency set and avoid speculative abstractions.
- Refactor only where the live code shows repeated logic, long dispatch functions, or mixed responsibilities.
- Documentation may link to detailed guides instead of repeating them, but it must keep the complete command surface discoverable.

# Baseline evidence

- Default branch: `main` at `5abce246a5e7be23ab6036271b2ad25f34b5c09b`.
- Open pull requests: none at plan time.
- `npm ci`: passed.
- `npm test`: 323 passed, 0 failed.
- `npm run check:release`: passed.
- Production TypeScript: 6,162 lines across 37 non-test files.
- README: 180 lines.
- Built JavaScript export-manifest digest: `f42e010980c6a1f8627411a7f0ed4f13cf1e8428851f2c0240cc6a458b02701d`.

# Codebase-wide review boundary

The structural pass covered all 37 production TypeScript files and 760 baseline functions. The three largest mixed-responsibility flows were `runCli` (278 lines), `lintFacts` (86 lines), and `reduceEvaluation` (50 lines). This change turns each into a short coordinator with named helpers.

High-decision functions that remain are mostly strict schema parsers, capability checks, canonicalization code, and benchmark integrity validators. Their repeated conditions encode fail-closed policy. Flattening those distinct checks would make the safety contract harder to audit and increase behavior-change risk.

# Implementation units

## 1. Split CLI dispatch into bounded handlers

- Goal: replace the 278-line `runCli` branch chain with named command handlers and a small dispatcher.
- Files: `src/cli.ts`, existing CLI tests, focused tests only if a behavior gap is found.
- Approach: keep parsing and output behavior unchanged; group lifecycle and learning subcommands behind named handlers; use one command-handler table.
- Dependencies: current CLI helpers and core modules.
- Patterns: early validation, one responsibility per function, no hidden I/O.
- Test scenarios: every existing CLI integration test; invalid usage; exit code 2 gates; stdin and capability handling.
- Verification: `npm test`, built CLI smoke commands, export-manifest comparison.

## 2. Separate fact-lint routing from report assembly

- Goal: make claim routing, capability checks, contradiction checks, and summary calculation readable as separate steps.
- Files: `src/fact-linter.ts` and existing fact-lint tests.
- Approach: extract private helpers while preserving finding order, evidence selection, severity, and report shape.
- Dependencies: existing fact-lint contracts and sentence utilities.
- Patterns: one decision flow per helper, explicit return values, no policy changes.
- Test scenarios: supported claims, missing evidence, drift, overreach, contradictions, semantic adapters, and metadata exceptions.
- Verification: focused fact-lint, CLI, MCP, and pipeline tests plus the full suite.

The similar private response parsers in `rewrite-task.ts` and `rebuild-task.ts` stay separate. Moving them into a new shipped module would change the package's deep-import surface for a small reduction in repeated code.

## 3. Make MCP error handling uniform

- Goal: remove repeated `try`/`catch` wrappers while preserving exact redaction behavior for sensitive tools.
- Files: `src/mcp.ts` and existing MCP tests.
- Approach: add a small result wrapper for ordinary tools; keep capability-bearing tools on explicit redacted error paths.
- Dependencies: MCP SDK handler contract.
- Patterns: one error boundary, explicit security exceptions.
- Test scenarios: registered tools, malformed input, sensitive-input redaction on and off.
- Verification: MCP helper and stdio integration tests; Claude bundle build.

## 4. Break evaluation calculations into named helpers

- Goal: make the main Stage 1 reducer describe the workflow instead of embedding every metric calculation.
- Files: `src/stage1-evaluation.ts` and existing evaluation tests.
- Approach: extract pure helpers for audit validation, blockers, arm metrics, and report metrics; preserve order and arithmetic exactly.
- Dependencies: committed protocol and reviewer contracts.
- Patterns: pure calculations, explicit inputs, no schema changes.
- Test scenarios: valid synthetic evaluation and every existing integrity rejection.
- Verification: Stage 1 tests, full suite, release audit.

## 5. Rewrite the README

- Goal: keep only setup, core use, the complete command index, privacy boundaries, contributor checks, and links to deeper docs.
- Files: `Readme.md`.
- Approach: short sentences, simple technical English, no repeated architecture detail or marketing claims.
- Dependencies: current CLI command surface and documentation paths.
- Test scenarios: release audit package-contract checks; manual link and command comparison.
- Verification: command names checked against CLI usage and portable-agent catalog; `npm pack --dry-run` includes the README.

# Verification contract

| Requirement | Hard check |
| --- | --- |
| Features remain available | 323-test baseline stays green; CLI command, MCP tool, agent ID, and built export sets match the base revision. |
| Output and security behavior remain stable | CLI/MCP integration tests, canonical/fingerprint tests, lifecycle/capability tests, benchmark integrity tests. |
| Package remains installable | `npm pack`, install the tarball in a clean temporary project, then run representative CLI commands. |
| Release surfaces remain valid | `npm run check:release` and `npm run pack:claude`. |
| Diff is clean | `git diff --check`, focused review, simplification pass, and no unrelated files. |
| PR is merge-ready | GitHub CI passes on the exact pushed head and no blocking review finding remains. |

# Definition of done

- The public surface and feature inventory match the base revision.
- All local hard checks pass on the final revision.
- The README is shorter and covers the necessary user path.
- The branch is pushed and an open PR contains the verification evidence and simplification brief.
- GitHub CI is green on the PR head.

# Deferred to implementation

- Skip any proposed cleanup that changes a public export, serialized value, safety decision, or error contract.
