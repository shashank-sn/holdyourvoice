# Benchmarks and historical results

Historical articles are not checkpoint evidence because this repository lacks the raw tasks, outputs, reviewer records, model settings, and rights manifest needed to reproduce them. A reproducible benchmark must publish author-owned or synthetic task packets, baseline and treatment outputs, model identifiers/settings, randomized review protocol, per-engine reports, human/factual rubrics, and a provenance/license field for every case. Keep deterministic fixture tests separate from any credentialed model runner.

## Stage 1 optional research protocol

The Stage 1 setup freezes the checkoutable baseline at `4e6269121d551c008a34db73077e1e4fea41b3f9`. The hardcoded `STAGE1_COMMIT` is `550ea24f652291dca13757fdbd2f0fa0b5e3f621`; it is not retrievable from origin after the PR #27 squash merge. The merged head is `32d35eb35246696f0a56e7732d714ca6c22060f7`. No committed locked-human protocol digest exists. Versioned schemas under `benchmarks/schema/` cover the immutable protocol, status-discriminated run events, encrypted blind packet, sealed A/B mapping, append-only reviewer records, ratings seal, aggregate report, and checkpoint disposition.

Every locked assignment stays in the intent-to-treat denominator. Timeouts, abandonment, and hard-gate failures are failures; they are never silently rerun or converted into preference ballots. Reports reconcile planned, completed, missing, failed, timed-out, and abandoned assignments and bind every artifact through canonical SHA-256 digests. Synthetic development and calibration fixtures always reduce to `BLOCKED` and cannot support a promotion claim.

Human evidence is external to automation. Remaining inputs are a rights-approved non-synthetic corpus, encrypted custody, a reviewer roster, trust keys, provider captures, blind ratings with external receipts, a mapping-custody attestation, and a checkpoint disposition. Private source and blind candidates stay in approved encrypted custody. Exported artifacts contain digests and categorical ratings only. The current evaluator validates receipt shape and artifact bindings but deliberately blocks cryptographic trust and reviewer-roster acceptance until an external verifier is configured.

Run the automated dry-run and emit the human-study kit outside the repository:

```bash
npm run stage1:dry-run -- --out /absolute/path/outside-the-repository/stage1-dry-run
npm run stage1:human-packet -- --out /absolute/path/outside-the-repository/stage1-human-packet
```

The kit does not pass MAR-362. The automated harness is not human evidence. `hyv_score` and ratings produced by a model or agent are not writer evidence. Kit `--out` is emit-only and is not approved encrypted custody. Do not capture the Stage 1 arm until `STAGE1_COMMIT` is checkoutable; do not label merged-HEAD bytes as that commit. Shape-checked receipts remain unverified until an external verifier exists. While `human_writer_evidence_deferred` is forced, the report decision is `BLOCKED` and `PASS` is unreachable. A disposition may be only `STOP` or `REPEAT_PROTOCOL`; `PROCEED_TO_MAR_363` is rejected with `human_evidence_deferred`. Writer-study kits stay optional research. Product npm publish uses the version bump and CI. Keep writer-checkpoint claims off the publish.

## Separate comparison reports

Keep four reports distinct. Do not fold them into one preservation number.

| Arm | Identity | Current report |
|---|---|---|
| Unchanged Hyv 3.2.0 | `4e6269121d551c008a34db73077e1e4fea41b3f9` | checkoutable baseline |
| Stage 1 | `550ea24f652291dca13757fdbd2f0fa0b5e3f621` | protocol identity; not checkoutable after the PR #27 squash |
| Advanced edit | `1ffaabe2586adf11a2ed6db4dba8d1d88095f507` | judgments and range edits on main |
| Rebuild | `387de69eae9ec176f32bfb0f3a7b769a4e0b6686` | authorized rebuild on main; optional study is out of product-release scope |

Emit the Stage 2 operator kit outside the repository:

```bash
npm run stage2:human-packet -- --out /absolute/path/outside-the-repository/stage2-human-packet
```

The Stage 2 kit stays BLOCKED and cannot promote MAR-364. Keep `PROCEED_TO_MAR_365` and writer-checkpoint claims off the record. Product npm publish uses the version bump and CI.

See `benchmarks/README.md` for the locked-run commands.

See the historical sources: https://holdyourvoice.com/blog/voice-memory-composer and https://holdyourvoice.com/blog/hold-your-voice-vs-gpt-5-6-writing.
