# runtime benchmark

this benchmark measures deterministic local runtime. it is separate from the rewrite-quality and human-review protocol in the parent benchmark directory.

## run

```bash
npm ci
npm run build
node --expose-gc scripts/benchmark-runtime.mjs --json
```

the runner emits one flat JSON object. `behavior_preserved`, `fixture_integrity`, and `noise_within_limit` must all equal `1` before timing changes can be compared.

## scenarios

- v3 analysis on a fixed 100,000-character natural document.
- v3 analysis on a fixed 100,000-character dotted document that stresses sentence-boundary handling.
- final-output checking on clean 100,000-character text.
- cold CLI analysis on a fixed 2,048-character document.
- fact linting against a fixed synthetic source set near the 40,000-character input limit.

the manifest freezes the descriptor, expanded inputs, raw output shape, finding order, CLI stdout, stderr, and exit status. every fixture is synthetic.

the optimization run takes seven independent harness samples and uses their median. the runner batches fast in-process cases long enough to reduce timer noise. dotted cases use one fixed warmup and three fixed samples so one harness invocation stays below the five-minute timeout.

## profile

profile one explicit scenario without mixing profiler overhead into benchmark numbers:

```bash
node --cpu-prof \
  --cpu-prof-dir .context/compound-engineering/ce-optimize/runtime-hot-path-performance \
  --cpu-prof-name dotted.cpuprofile \
  scripts/benchmark-runtime.mjs \
  --profile=analyze_v3_dotted_max \
  --profile-iterations=1
```

changing fixtures, expectations, or the runner creates a new benchmark contract. do not rewrite expectations to make a product-code change pass.
