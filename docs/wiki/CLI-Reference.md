# cli reference

```bash
node dist/cli.js profile profile.json sample-a.md sample-b.md [--avoid=phrase]
node dist/cli.js analyze draft.md profile.json [writing-brief.json]
node dist/cli.js hygiene draft.md [--fix] [--output=cleaned.md]
node dist/cli.js final-check <path|->
node dist/cli.js batch-analyze draft-a.md draft-b.md [draft-c.md]
node dist/cli.js rewrite-prompt draft.md profile.json [writing-brief.json] > rewrite-brief.md
node dist/cli.js verify original.md candidate.md profile.json [writing-brief.json]
node dist/cli.js learning show profile.json
node dist/cli.js learning add profile.json "Keep the direct opening."
node dist/cli.js learning clear profile.json
node dist/cli.js patterns
```

`profile` needs two or more samples and writes only the profile path you name. `analyze` returns independent VoiceDNA and AI Editor reports plus a separate non-scoring Unicode hygiene report. An optional WritingBrief adds local audience, intent, and format context without changing the VoiceDNA profile. `hygiene` needs no profile; inspection is read-only, while `--fix` writes a new cleaned path, reports every changed offset, and refuses to overwrite either input or an existing output. Bidirectional controls, tag characters, and zero-width joiners/non-joiners are reported but preserved. `final-check` is the universal profile-free output boundary: it passes clean text through exactly, removes only a leading U+FEFF, and withholds stdout with exit code `2` when hidden characters remain. `batch-analyze` returns advisory exact duplicate opening and closing findings across a local set. `rewrite-prompt` prints markdown and never calls a model. A passing `verify` records resolved finding IDs by default under local profile-scoped learning state; it never stores either text. `learning show`, `add`, and `clear` inspect, add, or remove that profile's local state. `verify` and `final-check` return `2` when their gate fails and `1` for usage or runtime errors.

`patterns` prints the ruleset version and exact executable deterministic catalog. the current `2.9.24-static.2` catalog contains 143 reviewed rules restored from the published `@holdyourvoice/hyv@2.9.24` `signals.ts` artifact plus two retained 3.1 detectors, for 145 rules total. entries include reconstructable regular-expression source and flags plus an explicit sentence or physical-line scope. with an installed package, the equivalent command is `hyv patterns`. inspection and analysis stay local; the restored catalog does not add hosted analysis, provider calls, telemetry, or file mutation.

use `-` as a text input path where a command accepts a draft or sample from standard input.
