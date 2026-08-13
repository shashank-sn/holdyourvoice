# Benchmarks and historical results

The Hold Your Voice vs GPT-5.6 article reported a historical pilot of 16 matched draft pairs, 29 of 32 blind reviewer preferences for the profile-aware treatment, and a +0.34 five-point voice-composite change. It remains a public product report because this repository lacks the raw tasks, outputs, reviewer records, model settings, and rights manifest needed to reproduce it.

Treat those numbers as historical context rather than a leaderboard claim. A reproducible benchmark must publish author-owned or synthetic task packets, baseline and treatment outputs, model identifiers/settings, randomized review protocol, per-engine reports, human/factual rubrics, and a provenance/license field for every case. Keep deterministic fixture tests separate from any credentialed model runner.

## Stage 1 evidence gate

The Stage 1 setup freezes Hyv 3.2.0 at `4e6269121d551c008a34db73077e1e4fea41b3f9` and the completed Stage 1 lifecycle at `550ea24f652291dca13757fdbd2f0fa0b5e3f621`. Versioned schemas under `benchmarks/schema/` cover the immutable protocol, status-discriminated run events, encrypted blind packet, sealed A/B mapping, append-only reviewer records, ratings seal, aggregate report, and checkpoint disposition.

Every locked assignment stays in the intent-to-treat denominator. Timeouts, abandonment, and hard-gate failures are failures; they are never silently rerun or converted into preference ballots. Reports reconcile planned, completed, missing, failed, timed-out, and abandoned assignments and bind every artifact through canonical SHA-256 digests. Synthetic development and calibration fixtures always reduce to `BLOCKED` and cannot support a promotion claim.

Human evidence is external to automation. Private source and blind candidates stay in an approved encrypted root. Exported artifacts contain digests and categorical ratings only. Reviewer, mapping-custody, and checkpoint receipts must come from an external verifier. The current evaluator validates receipt shape and artifact bindings but deliberately blocks cryptographic trust and reviewer-roster acceptance until that verifier is configured.

Run `npm run stage1:dry-run -- --out <absolute-path-outside-the-repository>` to exercise the automatable packet. See `benchmarks/README.md` for the locked-run commands and remaining human inputs.

See the historical sources: https://holdyourvoice.com/blog/voice-memory-composer and https://holdyourvoice.com/blog/hold-your-voice-vs-gpt-5-6-writing.
