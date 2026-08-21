# getting started

the public CLI is [`@holdyourvoice/hyv`](https://www.npmjs.com/package/@holdyourvoice/hyv) 3.3.2.

```bash
npx @holdyourvoice/hyv patterns
npm install --global @holdyourvoice/hyv
hyv patterns
```

to work from source:

1. clone the repository and run `npm install`.
2. run `npm test` and `npm run build`.
3. create a profile from at least two local samples:

```bash
hyv profile profile.json sample-a.md sample-b.md --avoid=overused-phrase
```

4. inspect a draft with `hyv analyze draft.md profile.json`.
5. create a brief with `hyv rewrite-prompt draft.md profile.json > rewrite-brief.md`, apply only the replacements you accept, then run `verify`.
6. for the founder-aware path, reduce a pre-edit judgment to SHIP, EDIT, or REBUILD, then use `prepare-rewrite` / `apply-rewrite` or `prepare-rebuild` / `apply-rebuild` as the recommendation requires.

use `npx @holdyourvoice/hyv` in place of `hyv` when the CLI is not installed globally. from a built checkout, `node dist/cli.js` is the same binary.
