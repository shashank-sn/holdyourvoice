# Benchmarks and historical results

Historical articles sit beside a frozen Hyv 3.2.0 baseline at `4e6269121d551c008a34db73077e1e4fea41b3f9`. Treat the articles as dated product writing. A reproducible comparison still needs a rights-cleared corpus, frozen tasks, exact model and editor settings, a published rubric, separate evaluation dimensions, failure cases, and limitations. Keep deterministic fixture tests separate from any credentialed model runner.

Versioned schemas under `benchmarks/schema/` cover the immutable protocol, status-discriminated run events, encrypted blind packet, sealed A/B mapping, append-only reviewer records, ratings seal, aggregate report, and checkpoint disposition. Every locked assignment stays in the intent-to-treat denominator. Timeouts, abandonment, and hard-gate failures are failures. Reports bind every artifact through canonical SHA-256 digests.

## Separate comparison reports

Keep four reports distinct. Do not fold them into one preservation number.

| Arm | Identity | What it is |
|---|---|---|
| Unchanged Hyv 3.2.0 | `4e6269121d551c008a34db73077e1e4fea41b3f9` | Frozen comparison baseline |
| Stage 1 | `32d35eb35246696f0a56e7732d714ca6c22060f7` | Founder-aware Stage 1 on main |
| Advanced edit | `1ffaabe2586adf11a2ed6db4dba8d1d88095f507` | Judgments and range edits |
| Rebuild | `387de69eae9ec176f32bfb0f3a7b769a4e0b6686` | Authorized rebuild |

Maintainer packets emit outside the repository:

```bash
npm run stage1:dry-run -- --out /absolute/path/outside-the-repository/stage1-dry-run
npm run stage1:human-packet -- --out /absolute/path/outside-the-repository/stage1-human-packet
npm run stage2:human-packet -- --out /absolute/path/outside-the-repository/stage2-human-packet
```

See `benchmarks/README.md` for the locked-run commands.

See the historical sources: https://holdyourvoice.com/blog/voice-memory-composer and https://holdyourvoice.com/blog/hold-your-voice-vs-gpt-5-6-writing.
