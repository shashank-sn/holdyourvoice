---
name: hyv-ingest
description: Redact an owner-authorized Gmail or Telegram export into local VoiceDNA samples.
---

# hyv-ingest

Turn an explicitly authorized local Gmail Sent.mbox or Telegram Desktop JSON export into redacted writing samples. This is opt-in local preprocessing, not background collection, training, synchronization, or network access.

## Usage

```text
hyv ingest <gmail-sent-mbox|telegram-desktop-json> export --owner=owner --output=/absolute/safe-directory [--blocked=word]
```

## Preconditions

- Confirm the source is authorized by its owner and select the source type exactly.
- Use an existing absolute output directory outside every Git checkout. The command creates new `samples.jsonl` and text-free `receipt.json`; it refuses existing files and never overwrites exports.
- Add `--blocked=word` for each user-supplied term that must drop its entire sentence. Do not put secrets or sample prose in command output or a status message.

## Behavior

- Only messages attributable to the explicit owner are retained.
- Email addresses, phone numbers, card-like values, IP addresses, and URLs are deterministically redacted before `samples.jsonl` is created. The receipt records counts and digests, never raw prose, paths, or source content.
- Presidio is optional. If no approved adapter ran, report `NOT_CONFIGURED`; do not imply it was installed.
- This command makes no provider call, telemetry event, network request, profile, or model. It cannot open a socket.

## Handoff

Inspect the new samples locally, then use `hyv-profile` to build a profile or `hyv-score` with a separately held-out set. Do not add the redacted export to a repository without separate approval.
