# benchmarks and research

the project may link to historical articles, but they are not checkpoint evidence. a reproducible benchmark needs a rights-cleared corpus, frozen tasks, exact model and editor settings, a published rubric, separate evaluation dimensions, failure cases, and limitations.

## stage 1 human-study gate

the checkoutable baseline is `4e6269121d551c008a34db73077e1e4fea41b3f9`. the hardcoded `STAGE1_COMMIT` is `550ea24f652291dca13757fdbd2f0fa0b5e3f621`; it is not retrievable from origin after the PR #27 squash merge. the merged head is `32d35eb35246696f0a56e7732d714ca6c22060f7`. no committed locked-human protocol digest exists.

run both packets outside the repository:

```bash
npm run stage1:dry-run -- --out /absolute/path/outside-the-repository/stage1-dry-run
npm run stage1:human-packet -- --out /absolute/path/outside-the-repository/stage1-human-packet
```

the human-study kit does not pass MAR-362. the automated harness is not human evidence. `hyv_score` and ratings produced by a model or agent are not writer evidence. kit `--out` is emit-only, not approved encrypted custody. do not capture the Stage 1 arm until `STAGE1_COMMIT` is checkoutable, and do not label merged-HEAD bytes as that commit. shape-checked receipts remain unverified.

while `human_writer_evidence_deferred` is forced, the report decision is `BLOCKED` and `PASS` is unreachable. the only dispositions are `STOP` and `REPEAT_PROTOCOL`. `PROCEED_TO_MAR_363` is rejected with `human_evidence_deferred`.

## stage 2 and rebuild

keep four reports: unchanged 3.2.0, Stage 1, advanced edit, and rebuild. do not merge edit and rebuild preservation. emit the Stage 2 kit outside the repository:

```bash
npm run stage2:human-packet -- --out /absolute/path/outside-the-repository/stage2-human-packet
```

the kit does not pass MAR-364 and cannot authorize a versioned release. `PROCEED_TO_MAR_365` stays rejected while `stage2_adoption_evidence_deferred` is forced.

remaining human inputs are a rights-approved non-synthetic corpus, encrypted custody, a reviewer roster, trust keys, provider captures, blind ratings with external receipts, a mapping-custody attestation, and a checkpoint disposition.
