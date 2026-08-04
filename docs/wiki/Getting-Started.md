# getting started

1. clone the repository and run `npm install`.
2. run `npm test` and `npm run build`.
3. create a profile from at least two local samples:

```bash
node dist/cli.js profile profile.json sample-a.md sample-b.md --avoid=overused-phrase
```

4. inspect a draft with `node dist/cli.js analyze draft.md profile.json`.
5. create a brief with `node dist/cli.js rewrite-prompt draft.md profile.json > rewrite-brief.md`, apply only the replacements you accept, then run `verify`.

the package is private until a deliberate npm publication. use the local CLI path above.
