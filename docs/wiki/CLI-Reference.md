# cli reference

```bash
node dist/cli.js profile profile.json sample-a.md sample-b.md [--avoid=phrase]
node dist/cli.js analyze draft.md profile.json
node dist/cli.js rewrite-prompt draft.md profile.json > rewrite-brief.md
node dist/cli.js verify original.md candidate.md profile.json
node dist/cli.js patterns
```

`profile` needs two or more samples and writes only the profile path you name. `analyze` returns independent JSON reports. `rewrite-prompt` prints markdown and never calls a model. `verify` prints original and candidate reports, returns `2` when the gate fails, and returns `1` for usage or runtime errors. `patterns` prints the exact executable deterministic rules.

use `-` as a text input path where a command accepts a draft or sample from standard input.
