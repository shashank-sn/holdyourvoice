# runtime benchmark

this benchmark measures deterministic local runtime. in-process scenarios use per-process CPU time so scheduler contention does not enter the result. the cold CLI scenario uses wall-clock time. this benchmark is separate from the rewrite-quality and human-review protocol in the parent benchmark directory.

## run

```bash
npm ci
npm run build
node --predictable --single-threaded --predictable-gc-schedule \
  --expose-gc scripts/benchmark-runtime.mjs --json
```

the runner emits one flat JSON object. `behavior_preserved`, `fixture_integrity`, and `noise_within_limit` must all equal `1` before timing changes can be compared.

## scenarios

- v3 analysis on a fixed 100,000-character natural document.
- v3 analysis on a fixed 100,000-character dotted document that stresses sentence-boundary handling.
- final-output checking on clean 100,000-character text.
- cold CLI analysis on a fixed 2,048-character document.
- fact linting against a fixed synthetic source set near the 40,000-character input limit.

the manifest freezes the descriptor, expanded inputs, raw output shape, finding order, CLI stdout, stderr, and exit status. every fixture is synthetic.

the optimization run takes seven independent harness samples and uses their median. the runner normalizes heap state before each timed in-process batch, outside the timer, and batches fast cases long enough to reduce timer noise. dotted analysis uses four fixed warmups and five fixed samples; its sentence diagnostic uses one warmup and three samples. one harness invocation stays below the five-minute timeout.

## reference result

the measured baseline is `bdd425569a67c571afd2c6c6b609948f7fadc5ac`, whose product source matches `f7598cc688cbe3d7cf61ae9871093a210bafade1`. the measured patch was later committed on the optimization branch as `7b351d60b55d732f5e6fc685ebedf697909078a7`. measurements ran on arm64 macOS 26.6.2 with Node 26.7.0 and npm 11.19.0. lower is better; each value is the median of seven independent harness runs.

| scenario | clock | before | after | change | protocol result |
|---|---:|---:|---:|---:|---|
| v3 natural analysis | process CPU | 19.8255 ms | 18.4075 ms | 7.1524% lower | inconclusive under the strict paired rule |
| v3 dotted analysis | process CPU | 8,823.134 ms | 17.245 ms | 99.8045% lower | improved in all seven pairs |
| clean final-check | process CPU | 1.000906 ms | 0.986313 ms | 1.4580% lower | inconclusive, inside its guardrail |
| cold short CLI analysis | wall | 44.609354 ms | 44.770770 ms | 0.3618% higher | inconclusive, inside its 5% guardrail |
| fact lint near 40k | process CPU | 119.203 ms | 119.837 ms | 0.5319% higher | secondary, report-only |

the decision protocol pairs baseline and candidate samples by index and requires every pair to clear a 3% relative improvement threshold for an improved verdict. the controlled runs were not temporally interleaved, so this is a protocol verdict rather than a statistical-significance claim.

the baseline Node profile isolated the end-anchored terminal-word lookup in `sentences()`. repeated dotted boundaries made it rescan growing prefixes. the retained change bounds that work to the terminal Unicode-letter run. dotted sentence parsing fell from 1,761.708 ms to 1.799 ms of process CPU time.

all retained behavior, fixture-integrity, and noise gates passed. the worst candidate internal relative MAD was 4.1427%, inside the frozen 5% gate. these are synthetic, host-specific results. the dotted result is not a whole-application speedup, and the indexed pairs are not a statistical-significance claim.

## profile

profile one explicit scenario without mixing profiler overhead into benchmark numbers:

```bash
HYV_PROFILE_DIR=/absolute/path/outside-the-repository/hyv-runtime-profile
mkdir -p "$HYV_PROFILE_DIR"
node --cpu-prof \
  --cpu-prof-dir "$HYV_PROFILE_DIR" \
  --cpu-prof-name dotted.cpuprofile \
  scripts/benchmark-runtime.mjs \
  --profile=analyze_v3_dotted_max \
  --profile-iterations=1
```

changing fixtures, expectations, or the runner creates a new benchmark contract. do not rewrite expectations to make a product-code change pass.
