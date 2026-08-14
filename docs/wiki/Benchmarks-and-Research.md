# benchmarks and research

historical articles sit beside a frozen Hyv 3.2.0 baseline at `4e6269121d551c008a34db73077e1e4fea41b3f9`. they are dated product writing. a reproducible comparison still needs a rights-cleared corpus, frozen tasks, exact model and editor settings, a published rubric, separate evaluation dimensions, failure cases, and limitations.

keep four reports distinct: unchanged 3.2.0, Stage 1, advanced edit, and rebuild. do not fold edit and rebuild into one preservation number.

| arm | identity | what it is |
|---|---|---|
| unchanged Hyv 3.2.0 | `4e6269121d551c008a34db73077e1e4fea41b3f9` | frozen comparison baseline |
| Stage 1 | `32d35eb35246696f0a56e7732d714ca6c22060f7` | founder-aware Stage 1 on main |
| advanced edit | `1ffaabe2586adf11a2ed6db4dba8d1d88095f507` | judgments and range edits |
| rebuild | `387de69eae9ec176f32bfb0f3a7b769a4e0b6686` | authorized rebuild |

maintainer packets emit outside the repository:

```bash
npm run stage1:dry-run -- --out /absolute/path/outside-the-repository/stage1-dry-run
npm run stage1:human-packet -- --out /absolute/path/outside-the-repository/stage1-human-packet
npm run stage2:human-packet -- --out /absolute/path/outside-the-repository/stage2-human-packet
```

see `benchmarks/README.md` for the locked-run commands.
