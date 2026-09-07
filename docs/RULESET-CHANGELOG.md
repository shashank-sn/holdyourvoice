# ruleset changelog

## 3.5.0-local.4

- adds `struct.colon-reveal` as an advisory physical-line cue for a narrow set of theatrical reveal labels followed by lowercase prose. headings, list labels, and ordinary explanatory colons remain outside its match. the rule is an editorial signal, not proof of AI authorship.

## 3.6.1

- simplified cli command ownership, shared verification and response handling, and removed duplicate maintenance code. commands, serialized contracts, approval boundaries, the executable rule catalog, and strict-default enforcement are unchanged.

## 3.6.0

- Rewrite and rebuild workflows are strict by default: every active AI Editor finding is a required repair, and deterministic verification rejects a candidate that leaves one unresolved. This changes workflow enforcement only; it does not change the executable catalog or turn a finding into authorship evidence. An explicit Profile v3 `disabled` policy remains a deliberate exception.
- `3.5.1` strengthens rewrite feedback: blockers require direct, source-faithful repair guidance; a rewrite may not invent evidence or use an advisory finding as permission to alter clean text. This does not change the executable AI Editor catalog or make a style finding proof of AI authorship.
- `3.5.0-local.3` adds `format.curly-quotes` as an advisory, profile-allowance-eligible house-style cue. It does not infer authorship or override an explicit policy.
- contribution metadata now distinguishes stable and experimental proposals. This changes review evidence, not the active ruleset or default findings.
