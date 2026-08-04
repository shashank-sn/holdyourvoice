# contributing

the useful contribution is a smaller, more inspectable rule or measurement. broad detectors need clear evidence before they belong here.

## before you open a pull request

1. keep the local-first boundary intact. no hosted APIs, accounts, telemetry, payment collection, or runtime network calls.
2. exclude client writing, profiles, prompts, feedback, embeddings, secrets, and unlicensed examples. use synthetic or rights-cleared fixtures with a short provenance note.
3. for an AI Editor rule, include a stable ID, severity, reason, repair direction, positive test, and counterexample test.
4. a VoiceDNA enforcement change needs a documented policy, counterexamples, and regression tests.
5. run `npm test`, `npm run check:release`, and `git diff --check`.

## contribution model

issues can propose a rule, a counterexample, a documentation correction, or a reproducible benchmark design. maintainers decide whether a contribution belongs in the deterministic ruleset, the editorial catalog, or neither.

the project stays fully usable without payment. [github sponsors](https://github.com/sponsors/shashank-sn) may fund maintenance, tests, documentation, privacy review, and local-first research. sponsorship never buys private source access, feature gates, donor-data collection, or editorial influence.
