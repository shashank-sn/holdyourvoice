# local voice memory

local voice memory makes the next editing brief a little more informed without turning Hold Your Voice into a hosted writing history.

it is on by default. when `verify` passes, the CLI records the finding IDs that the candidate resolved for that portable VoiceDNA profile. the next `rewrite-prompt` adds a bounded list of those already-verified repairs.

## what is stored

each profile gets a separate file under `~/.hyv/learning/`. the filename is a fingerprint of the profile, not a draft name.

the event contains:

- profile-scoped resolved VoiceDNA or AI Editor finding IDs
- severity, count, and timestamp
- an opaque one-way digest used only to avoid counting the same candidate twice
- a one-line instruction only when you add one yourself

it never stores samples, drafts, candidates, excerpts, embeddings, account data, telemetry, or a network copy of your writing.

## how it learns

```text
successful verify
  -> resolved finding IDs saved locally
  -> next rewrite-prompt reads the bounded preferences
```

only a successful candidate can create a verified-repair event. repeated verification of the same outcome does not increase its confidence. the store keeps a bounded recent history, ignores malformed local rows, and caps manual instructions at 240 characters.

## inspect or change it

```bash
hyv learning show profile.json
hyv learning add profile.json "Keep the direct opening."
hyv learning clear profile.json
```

`show` prints the exact preferences that can reach a brief. `add` creates a local preference and normalizes it to one plain-text line. `clear` removes learning for that profile only. Set `HYV_HOME` when you need the local state somewhere other than `~/.hyv`.

## boundaries

memory is a priority hint, not a third score. it never changes VoiceDNA or AI Editor scoring, and it cannot make either engine pass. learned hints cannot override tier 0 preservation, tier 1 blockers, clean-sentence preservation, or tier 4 output. the candidate still needs both engine passes, zero new red regressions, and at least 70 lexical preservation.

the Claude Desktop extension follows the same rule. its `hyv_verify` tool writes only a recoverable, text-free event after a successful verification. it never writes the supplied text.
