import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { lintLogic } from './logic-linter.js';
import { words } from './text.js';

interface CorpusPost { id: string; text: string }

const domains = ['marketing', 'engineering', 'deep-tech'];

function corpus(domain: string): CorpusPost[] {
  return JSON.parse(readFileSync(new URL(`../test-fixtures/logic-linter/${domain}.json`, import.meta.url), 'utf8')) as CorpusPost[];
}

test('keeps a 54-post long-form corpus cohesive across marketing, engineering, and deep tech', () => {
  const posts = domains.flatMap(corpus);
  assert.equal(posts.length, 54);
  assert.equal(new Set(posts.map((post) => post.id)).size, 54);
  for (const domain of domains) assert.equal(corpus(domain).length, 18);
  for (const post of posts) {
    const wordCount = words(post.text).length;
    assert.ok(wordCount >= 350 && wordCount <= 1_500, `${post.id} must contain 350–1,500 words; got ${wordCount}`);
    const report = lintLogic(post.text);
    assert.equal(report.passed, true, `${post.id}: ${JSON.stringify(report.findings)}`);
  }
});
