# Benchmarks and historical results

Historical articles are not checkpoint evidence because this repository lacks the raw tasks, outputs, reviewer records, model settings, and rights manifest needed to reproduce them. A reproducible benchmark must publish author-owned or synthetic task packets, baseline and treatment outputs, model identifiers/settings, randomized review protocol, per-engine reports, human/factual rubrics, and a provenance/license field for every case. Keep deterministic fixture tests separate from any credentialed model runner.

## Stage 1 evidence gate

The Stage 1 setup freezes the checkoutable baseline at `4e6269121d551c008a34db73077e1e4fea41b3f9`. The hardcoded `STAGE1_COMMIT` is `550ea24f652291dca13757fdbd2f0fa0b5e3f621`; it is not retrievable from origin after the PR #27 squash merge. The merged head is `32d35eb35246696f0a56e7732d714ca6c22060f7`. No committed locked-human protocol digest exists. Versioned schemas under `benchmarks/schema/` cover the immutable protocol, status-discriminated run events, encrypted blind packet, sealed A/B mapping, append-only reviewer records, ratings seal, aggregate report, and checkpoint disposition.

Every locked assignment stays in the intent-to-treat denominator. Timeouts, abandonment, and hard-gate failures are failures; they are never silently rerun or converted into preference ballots. Reports reconcile planned, completed, missing, failed, timed-out, and abandoned assignments and bind every artifact through canonical SHA-256 digests. Synthetic development and calibration fixtures always reduce to `BLOCKED` and cannot support a promotion claim.

Human evidence is external to automation. Remaining inputs are a rights-approved non-synthetic corpus, encrypted custody, a reviewer roster, trust keys, provider captures, blind ratings with external receipts, a mapping-custody attestation, and a checkpoint disposition. Private source and blind candidates stay in approved encrypted custody. Exported artifacts contain digests and categorical ratings only. The current evaluator validates receipt shape and artifact bindings but deliberately blocks cryptographic trust and reviewer-roster acceptance until an external verifier is configured.

Run the automated dry-run and emit the human-study kit outside the repository:

```bash
npm run stage1:dry-run -- --out /absolute/path/outside-the-repository/stage1-dry-run
npm run stage1:human-packet -- --out /absolute/path/outside-the-repository/stage1-human-packet
```

The kit does not pass MAR-362. The automated harness is not human evidence. `hyv_score` and ratings produced by a model or agent are not writer evidence. Kit `--out` is emit-only and is not approved encrypted custody. Do not capture the Stage 1 arm until `STAGE1_COMMIT` is checkoutable; do not label merged-HEAD bytes as that commit. Shape-checked receipts remain unverified until an external verifier exists. While `human_writer_evidence_deferred` is forced, the report decision is `BLOCKED` and `PASS` is unreachable. A disposition may be only `STOP` or `REPEAT_PROTOCOL`; `PROCEED_TO_MAR_363` is rejected with `human_evidence_deferred`.

See `benchmarks/README.md` for the locked-run commands.

See the historical sources: https://holdyourvoice.com/blog/voice-memory-composer and https://holdyourvoice.com/blog/hold-your-voice-vs-gpt-5-6-writing.
