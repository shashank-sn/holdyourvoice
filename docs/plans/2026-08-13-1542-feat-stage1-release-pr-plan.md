---
title: "feat: Ship the verified HYV Stage 1 release candidate"
date: 2026-08-13
type: feat
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
origin: docs/plans/2026-08-13-001-refactor-founder-aware-rewrite-system-plan.md
---

# feat: Ship the verified HYV Stage 1 release candidate

## Goal Capsule

- **Objective:** Prepare one reviewable PR containing verified MAR-357 through MAR-361 behavior, the fail-closed MAR-362 automation harness, and factual README/wiki/release-audit updates.
- **Authority:** Runtime behavior and passing tests control documentation claims. The user-approved fast path narrows the original U7 release scope to Stage 1.
- **Stop conditions:** Do not claim the MAR-362 checkpoint passed. Do not include advanced edit, rebuild, writer outcomes, release, tag, publish, or approval evidence.
- **Tail ownership:** This plan ends at local PR readiness. The parent workflow confirms the repository and remote before pushing or opening a PR.

---

## Product Contract

### Summary

The PR packages the completed Stage 1 founder-aware rewrite work without representing deferred human evaluation as completed evidence.

### Problem Frame

The verified implementation is split across a MAR-361 base, a MAR-362 automation commit, and a documentation/release-prep commit. They need one coherent branch whose documentation, package contents, and release checks agree with the runtime while the real writer checkpoint stays open.

### Requirements

- R1. The branch contains the verified MAR-357 through MAR-361 implementation from base `550ea24f652291dca13757fdbd2f0fa0b5e3f621`.
- R2. The MAR-362 automation harness is included as fail-closed development infrastructure and cannot produce a checkpoint pass or MAR-363 promotion without external evidence.
- R3. README, wiki, benchmark, plugin, package, and release-audit surfaces describe only behavior present in the integrated runtime.
- R4. The complete test suite, release audit, package dry-run, and whitespace check pass on the integrated branch.
- R5. An independent review covers correctness, evidence integrity, package boundaries, and unsupported claims before PR handoff.
- R6. Pushing, opening the PR, tagging, publishing, and making release claims remain outside this integration lane.

### Key Decisions

- **Ship Stage 1 without substituting agent evidence for writers** `(session-settled: user-directed — chosen over waiting for real user testing: the checkpoint is deferred rather than passed)`. Governs R2, R3, R6.
- **Keep later stages out of this PR.** MAR-363 through MAR-365 remain unstarted, so advanced edit and rebuild behavior cannot enter the branch or its claims. Governs R3, R6.

### Scope Boundaries

In scope:

- MAR-357 through MAR-361 implementation.
- MAR-362 automated evaluation machinery and synthetic blocked proof.
- Factual README, wiki, benchmark, plugin, package, and release-audit updates.
- Local verification, independent review, repair, and PR description planning.

Deferred to follow-up work:

- Real MAR-362 writer evidence and checkpoint disposition.
- MAR-363 advanced edit, MAR-364 adoption evidence, and MAR-365 authorized rebuild.
- Locked final evaluation, human release approval, tag, npm publish, and rollout evidence.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Integrate in dependency order.** Apply the MAR-362 harness to the MAR-361 base before the docs/release-prep commit so shared release-audit code resolves against the newest runtime contract.
- KTD2. **Use the package file list as release truth.** Package verification must inspect the actual dry-run contents, not only literal entries in `package.json`.
- KTD3. **Bind claims to evidence state.** Synthetic and development runs must remain `BLOCKED` and non-promotable in code, schemas, tests, and docs.
- KTD4. **Keep the shipping action outside this branch task.** Local commits and a complete PR plan are allowed; push and PR creation require the parent workflow's remote-state confirmation.

### Risks and Dependencies

- Documentation can accidentally imply the writer checkpoint passed even when the reducer blocks promotion.
- A permissive package entry can include nested private or planning files unless the audit checks the produced file list.
- The release-prep and benchmark commits both edit `scripts/release-audit.mjs`; green tests alone do not prove their policies compose correctly.
- MAR-362 remains operationally dependent on external writer evidence even though its automation is ready.

---

## Implementation Units

### U1. Integrate Stage 1 automation and documentation

- **Goal:** Produce one branch from the verified MAR-361 base with both accepted commits applied in dependency order.
- **Requirements:** R1, R2, R3.
- **Dependencies:** None.
- **Files:** `src/stage1-evaluation.ts`, `src/stage1-evaluation.test.ts`, `benchmarks/`, `scripts/release-audit.mjs`, `Readme.md`, `docs/`, `claude-plugin/README.md`, `package.json`.
- **Approach:** Preserve the MAR-362 fail-closed contract, then resolve documentation and release-audit overlap against the integrated runtime.
- **Test scenarios:**
  - A synthetic Stage 1 packet reduces to `BLOCKED` and cannot request MAR-363 progression.
  - Failed hard-gate candidates remain in intent-to-treat counts but never enter blind review.
  - README and wiki commands correspond to built CLI and MCP behavior.
- **Verification:** The integrated diff contains no MAR-363 through MAR-365 implementation and no unsupported outcome claim.

### U2. Verify package and release boundaries

- **Goal:** Prove the branch builds, tests, audits, and packages the intended public files.
- **Requirements:** R3, R4.
- **Dependencies:** U1.
- **Files:** `scripts/release-audit.mjs`, `src/release-audit.test.ts`, `package.json`.
- **Approach:** Run the complete suite and inspect the actual package dry-run file list, including nested forbidden-path cases and a clean passing fixture.
- **Test scenarios:**
  - The clean repository fixture exits successfully.
  - A broad package entry cannot smuggle private evaluation, profile, or planning paths into the archive.
  - Package, plugin, MCP runtime, and npm versions remain consistent.
- **Verification:** Tests, release audit, package dry-run, and `git diff --check` pass from a clean branch.

### U3. Review and prepare the PR handoff

- **Goal:** Produce an evidence-backed review receipt and a PR body that states the Stage 1 boundary plainly.
- **Requirements:** R5, R6.
- **Dependencies:** U1, U2.
- **Files:** `docs/plans/2026-08-13-1542-feat-stage1-release-pr-plan.md` and the complete diff from the MAR-361 base.
- **Approach:** Run independent correctness, evidence-integrity, security, package, and documentation review. Repair verified findings, rerun authoritative checks, and prepare the PR summary without pushing.
- **Test scenarios:**
  - A reviewer cannot find text claiming MAR-362 passed or that writer outcomes exist.
  - A reviewer cannot find advanced edit or rebuild implementation in the Stage 1 diff.
  - Every PR claim maps to a committed file and a passing verification result.
- **Verification:** Review has no unresolved P0/P1 finding, the final tree is clean, and the parent workflow receives the exact commits and validation evidence needed to open the PR.

---

## Verification Contract

| Gate | Applies to | Required result |
|---|---|---|
| `npm test` | U1, U2 | Complete suite passes with zero failures. |
| `npm run check:release` | U2 | Release audit exits successfully. |
| `npm pack --dry-run --json` | U2 | Produced archive contains only the intended public package surface. |
| `git diff --check 550ea24..HEAD` | U1-U3 | No whitespace errors. |
| Independent CE review | U3 | No unresolved P0/P1 correctness, integrity, security, packaging, or factual-claim finding. |

---

## Definition of Done

- R1 through R6 are satisfied on one isolated integration branch.
- U1 through U3 have observed verification evidence.
- MAR-362 remains In Progress and explicitly unpassed in Linear.
- MAR-363 through MAR-365 remain unstarted.
- MAR-366 records the factual integration and review state without being marked Done prematurely.
- README/wiki/package contracts match the integrated runtime.
- No dead-end integration code, conflict marker, generated archive, or unrelated change remains in the diff.
- The branch is committed and ready for the parent workflow to confirm the remote and invoke the CE PR workflow.
