import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson, canonicalJsonBytes, parseCanonicalJson } from './canonical-json.js';

test('canonicalizes nested objects, arrays, escapes, unicode, and numbers', () => {
  const value = { z: [3, { b: '\u20ac', a: '\n' }], a: 1e-7 };
  assert.equal(canonicalJson(value), '{"a":1e-7,"z":[3,{"a":"\\n","b":"€"}]}');
  assert.deepEqual(canonicalJsonBytes(value), Buffer.from(canonicalJson(value), 'utf8'));
});

test('rejects duplicate keys, lone surrogates, unsafe integers, negative zero, and unsupported values', () => {
  assert.throws(() => parseCanonicalJson(Buffer.from('{"a":1,"a":1}')), /duplicate/i);
  for (const value of ['\ud800', Number.MAX_SAFE_INTEGER + 1, -0, undefined]) {
    assert.throws(() => canonicalJson(value), /canonical/i);
  }
});

test('requires exact canonical payload bytes', () => {
  assert.deepEqual(parseCanonicalJson(Buffer.from('{"a":1,"b":2}')), { a: 1, b: 2 });
  assert.throws(() => parseCanonicalJson(Buffer.from('{ "a": 1, "b": 2 }')), /canonical/i);
});

test('rejects inputs beyond the canonical complexity budget', () => {
  let value: unknown = 1;
  for (let index = 0; index < 70; index += 1) value = [value];
  assert.throws(() => canonicalJson(value), /complexity limit/);
});
