# Meaning-first recomposition

Use recomposition when you need a new whole-document candidate while preserving facts in a CopySpec. It is an optional policy on HYV's existing authorized REBUILD path.

The policy belongs in a local JSON file:

```json
{
  "version": "1",
  "mode": "meaning-first",
  "lexicalResidual": {
    "ngramSize": 5,
    "maxSharedNgramFraction": 0.1,
    "maxLongestSharedRunTokens": 8
  },
  "acknowledgement": "Measures shared wording only; does not detect or prove removal of a watermark."
}
```

Run it only after the existing REBUILD authorization flow:

```bash
hyv prepare-rebuild draft.md profile.json reduction.json copy-spec.json task.json \
  --recomposition-policy policy.json \
  --capability-file capability.json
hyv apply-rebuild task.json response.json profile.json --capability-file capability.json
```

HYV's recomposition prompt contains the CopySpec and optional WritingBrief. It does not automatically include the source draft. Create the safe writer payload instead of forwarding the prepared task:

```bash
hyv rebuild-writer-request task.json writer-request.json
```

`writer-request.json` contains only the prompt, task fingerprint, and stable fingerprints of the CopySpec and recomposition policy. It excludes the source draft, authorization capability, profile body, and validation evidence.

`apply-rebuild` returns `receipt.lexicalResidual` when a policy is configured. The report measures normalized shared five-token sequences and the longest shared token run, excluding only declared CopySpec facts or atoms. It can block the candidate with `lexical_residual_exceeds_policy`.

Every rebuild evaluation also runs HYV's default final-output gate. It removes only non-semantic ASCII controls and byte-order marks. If ambiguous hidden Unicode remains, the evaluation becomes `needs_escalation` and HYV omits the candidate from the result. Any host that changes the text later must still run `hyv final-check` at its delivery boundary.

A passing report means the candidate met this local overlap policy. It is not a watermark detector, does not establish authorship, and cannot prove that Gemini, Claude, OpenAI, or any other provider watermark is absent. `apply-rebuild` records `provenanceStatus: unknown` for a meaning-first candidate unless HYV has a matching verifier. A final external model can apply its own watermark.
