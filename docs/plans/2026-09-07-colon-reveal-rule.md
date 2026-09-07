# colon reveal rule plan

## objective

Add one narrow, advisory AI Editor rule for theatrical colon-reveal labels from the reviewed public editorial guidance.

## requirements

1. Keep analysis deterministic, local-only, and separate from VoiceDNA, rewrite execution, and authorship claims.
2. Flag only a bounded list of reveal labels when they begin a prose line and introduce lowercase prose after a colon.
3. Exclude headings, list labels, ordinary explanatory colons, and protected non-prose regions.
4. Publish immutable rule metadata, public provenance, synthetic positive and counterexamples, current catalog version, and rule count.

## implementation and evidence

| Unit | Files | Acceptance evidence |
| --- | --- | --- |
| Catalog | `src/ai-editor-rules.ts`, `src/ai-editor.ts` | `struct.colon-reveal` is advisory by default and can use normal Profile v3 policy. |
| Tests | `src/ai-editor.test.ts`, `src/cli.test.ts` | Positive labels match; ordinary colons, headings, and list labels do not; CLI and MCP catalogs remain identical. |
| Contribution record | `test-fixtures/rules/struct.colon-reveal.json` | Rule metadata validator accepts public provenance and synthetic examples. |
| Documentation | pattern taxonomy, architecture, wiki, changelog | Version and count describe the final executable catalog. |

## verification

Run `npm run validate:rule-contributions`, `npm test`, `npm run check:release`, and `git diff --check` on the final commit. Review the final diff independently before opening the PR.

## non-goals

Do not copy the external skill wholesale, add a hosted provider path, mutate drafts automatically, or treat a rule match as proof of AI authorship.
