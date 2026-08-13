# rewrite benchmark protocol

This directory is maintainer-only. It evaluates a defined rewrite route; it does not rank models generally or enable provider calls in HYV.

## Artifact boundary

Task packets and captured outputs contain writer text. Keep them local or write them only to an explicit user-chosen destination. HYV does not retain them, include them in learning events, or send them to a provider. Rights-cleared fixtures may live here; client drafts may not.

The committed public lane contains synthetic text only. `manifest.json` locks the unchanged `3.2.0` source commit and baseline digest, plus development, calibration, and locked-test partition digests, against ruleset `2.9.24-static.2` and the ordered 145-rule catalog.

The private lane is disabled by default and must stay outside every repository and worktree. A local run requires an explicitly approved encrypted storage root plus `rights-manifest.json` and `corpus.ndjson` on that volume. The manifest names the custodian, rights basis, explicit approval status and approver, encrypted-storage attestation, permitted users and environments, retention expiry and deletion procedure, incident owner, and corpus digest. CI, missing approval, expired retention, repository storage, and digest drift fail closed with text-free, path-free errors. Private source text must not enter Git, logs, backups, or reviewer exports.

## Stage 1 checkpoint setup

MAR-362 pins the unchanged, checkoutable baseline to `4e6269121d551c008a34db73077e1e4fea41b3f9`. The hardcoded `STAGE1_COMMIT` is `550ea24f652291dca13757fdbd2f0fa0b5e3f621`; it is not retrievable from origin after the PR #27 squash merge. The merged head is `32d35eb35246696f0a56e7732d714ca6c22060f7`. No committed locked-human protocol digest exists. Do not create one until a rights-approved non-synthetic corpus and the rest of the protocol inputs are available. The evaluator validates captured JSON and NDJSON but never calls a provider.

Run the synthetic calibration packet outside the repository:

```bash
npm run stage1:dry-run -- --out /absolute/path/outside-the-repository/stage1-dry-run
```

The expected result is `BLOCKED`, `promotable: false`, with `human_writer_evidence_deferred`, `synthetic_fixture_evidence`, and `locked_human_evidence_required`. This checks the protocol, run, blind mapping, reviewer log, ratings seal, report, and release-audit bindings. It is development evidence only.

Emit the human-study operator kit outside the repository and every worktree:

```bash
npm run stage1:human-packet -- --out /absolute/path/outside-the-repository/stage1-human-packet
```

This kit does not pass MAR-362. The automated harness is not human evidence. `hyv_score` and ratings produced by a model or agent are not writer evidence. Kit `--out` is emit-only and is not approved encrypted custody. Do not capture the Stage 1 arm until `STAGE1_COMMIT` is checkoutable; do not label merged-HEAD bytes as that commit. Shape-checked receipts remain unverified until an external verifier exists.

The lower-level commands operate on the emitted artifacts:

```bash
npm run stage1:evaluate -- commit-protocol --protocol <uncommitted-protocol.json>
npm run stage1:evaluate -- preflight --protocol <protocol.json>
npm run stage1:evaluate -- validate-runs --protocol <protocol.json> --runs <runs.ndjson-or-json>
npm run stage1:evaluate -- freeze-blind --protocol <protocol.json> --runs <runs> --mapping <mapping.json> --contents <encrypted-contents.json> --non-reviewable <failed-pairs.json>
npm run stage1:evaluate -- record-rating --packet <packet.json> --ratings <ratings.ndjson> --rating <signed-rating.json>
npm run stage1:evaluate -- seal-ratings --packet <packet.json> --mapping <mapping.json> --ratings <ratings.ndjson>
npm run stage1:evaluate -- reduce --protocol <protocol.json> --runs <runs> --packet <packet.json> --mapping <mapping.json> --ratings <ratings.ndjson> --seal <seal.json> --release-audit <audit.json>
npm run stage1:evaluate -- record-checkpoint-disposition --report <report.json> --disposition <STOP|REPEAT_PROTOCOL> --attestation <external-receipt.json>
```

While `human_writer_evidence_deferred` is forced, the report decision is `BLOCKED` and `PASS` is unreachable. The only accepted checkpoint dispositions are `STOP` and `REPEAT_PROTOCOL`. `PROCEED_TO_MAR_363` is rejected with `human_evidence_deferred`.

Before the locked partition runs, commit the canonical protocol digest. It freezes corpus and per-case provenance/rights digests, provider/model/revision/settings, task/ruleset/rubric digests, randomization commitment, statistic, margin, sample and rating minima, missingness, tie, retry and routing policies, disclosure and derived-retention scopes, and the release-audit contract. No field may be filled from observed results.

The initial operator is a HYV maintainer. Prepare a local task, explicitly forward it to a provider, apply the captured response, review any escalation, and own rights-cleared benchmark artifacts. CLI/MCP users are deferred until a locked-test promotion.

The baseline comparison measures are pre-registered before later-stage results: blind writer preference, correction-versus-confirm, workflow completion, and workflow abandonment. Hard-gate failures count as failures; edit and rebuild results remain separate.

## Result states

| condition | state | next action |
| --- | --- | --- |
| response-schema failure or one adapter repair attempt | repairable | return stable error and let the caller correct or resubmit |
| candidate passes all deterministic gates | accepted | eligible for blinded review |
| VoiceDNA, AI Editor, regression, preservation, or CopySpec failure | needs_escalation | do not auto-repair; caller may use a human or frontier route |

## Locked-test report

For each route, report lower-tier direct, lower-tier accepted after adapter repair, frontier accepted, human accepted, and unresolved separately. Include intent-to-treat approval against the unedited source: hard-gate failures are unapproved, even when excluded from pairwise preference. Private blind contents stay encrypted and are reviewed in place inside the approved root. Exported reviewer records, journals, reports, errors, and attestations contain digests and categorical ratings, never source or correction prose. The A/B mapping has a separate custodian and stays concealed until the ratings seal.

Promotion requires the committed confidence method, sample/rating minimums, reviewer aggregation, and missing-data rule. The initial consequence is approval only for the recorded maintainer-run rewrite distribution, never a default runtime model route. A later locked-test failure demotes that route to experimental.

## Human boundary

Automation stops before locked evidence. A locked run still needs:

1. A rights-approved, non-synthetic corpus with per-case provenance and provider/reviewer disclosure permission.
2. Approved encrypted custody, a retention/deletion plan, a mapping custodian, a reviewer roster, and trusted external signing keys.
3. Pre-registered model revision, route, statistic, margin, sample/rating minimums, missingness, tie, retry, and routing policies.
4. Real provider captures and blind human ratings with external receipts.
5. A mapping-custody attestation and a human checkpoint disposition after the bound release audit.

Synthetic fixtures, model-generated ballots, unsigned records, missing assignments, or digest drift can never produce `PROCEED_TO_MAR_363`.
The current harness rejects `PROCEED_TO_MAR_363` unconditionally. MAR-362 stays open until the external verifier and reviewer-roster check are implemented and the real writer study is complete.
