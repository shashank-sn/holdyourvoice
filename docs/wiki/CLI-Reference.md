# cli reference

```bash
node dist/cli.js profile profile.json sample-a.md sample-b.md [--avoid=phrase]
node dist/cli.js analyze draft.md profile.json [writing-brief.json]
node dist/cli.js batch-analyze draft-a.md draft-b.md [draft-c.md]
node dist/cli.js rewrite-prompt draft.md profile.json [writing-brief.json] > rewrite-brief.md
node dist/cli.js verify original.md candidate.md profile.json [writing-brief.json]
node dist/cli.js learning show profile.json
node dist/cli.js learning add profile.json "Keep the direct opening."
node dist/cli.js learning clear profile.json
node dist/cli.js patterns
```

`profile` needs two or more samples and writes only the profile path you name. `analyze` returns independent JSON reports. An optional WritingBrief adds local audience, intent, and format context without changing the VoiceDNA profile. `batch-analyze` returns advisory exact duplicate opening and closing findings across a local set. `rewrite-prompt` prints markdown and never calls a model. A passing `verify` records resolved finding IDs by default under local profile-scoped learning state; it never stores either text. `learning show`, `add`, and `clear` inspect, add, or remove that profile's local state. `verify` returns `2` when the gate fails and `1` for usage or runtime errors. `patterns` prints the exact executable deterministic rules.

use `-` as a text input path where a command accepts a draft or sample from standard input.
