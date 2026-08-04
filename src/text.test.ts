import assert from 'node:assert/strict';
import test from 'node:test';
import { sentences, words } from './text.js';

test('keeps decimals and common abbreviations inside a sentence', () => {
  assert.deepEqual(
    sentences('Dr. Shah raised $3.5m. It funded the work.').map((sentence) => sentence.text),
    ['Dr. Shah raised $3.5m.', 'It funded the work.'],
  );
});

test('records exact sentence offsets across newlines', () => {
  const text = 'First line\nSecond line.';
  assert.deepEqual(sentences(text), [
    { index: 1, start: 0, end: 10, text: 'First line' },
    { index: 2, start: 11, end: 23, text: 'Second line.' },
  ]);
});

test('counts Unicode writing as words', () => {
  assert.deepEqual(words('café नमस्ते दुनिया'), ['café', 'नमस्ते', 'दुनिया']);
});
