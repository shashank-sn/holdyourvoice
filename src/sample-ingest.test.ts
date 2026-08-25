import assert from 'node:assert/strict';
import test from 'node:test';
import { ingestGmailSentMbox, ingestTelegramDesktopJson } from './sample-ingest.js';

test('ingests only owner Gmail sent messages and redacts sensitive data before output', () => {
  const mbox = [
    'From sender@example.com Mon Jan 1 00:00:00 2026',
    'From: Owner <owner@example.com>',
    '',
    'Call +1 415 555 0100 or owner@example.com. Secret client detail stays out.',
    'From sender@example.com Mon Jan 2 00:00:00 2026',
    'From: Other <other@example.com>',
    '',
    'This message must not become a sample.',
  ].join('\n');
  const result = ingestGmailSentMbox(mbox, 'Owner <owner@example.com>', ['secret client']);
  assert.equal(result.samples.length, 1);
  assert.match(result.samples[0]!, /REDACTED:PHONE/);
  assert.match(result.samples[0]!, /REDACTED:EMAIL/);
  assert.equal(result.samples[0]!.includes('Secret client'), false);
  assert.equal(result.receipt.droppedSentences, 1);
  assert.equal(JSON.stringify(result.receipt).includes('Secret client'), false);
  assert.equal(JSON.stringify(result.receipt).includes('owner@example.com'), false);
});

test('ingests Telegram Desktop JSON by explicit owner and never places raw text in the receipt', () => {
  const source = JSON.stringify({ messages: [
    { type: 'message', from: 'Shashank', text: ['A link is ', { type: 'link', text: 'https://example.com/private' }, '.'] },
    { type: 'message', from: 'Other', text: 'Ignore me.' },
  ] });
  const result = ingestTelegramDesktopJson(source, 'Shashank');
  assert.equal(result.samples.length, 1);
  assert.match(result.samples[0]!, /REDACTED:URL/);
  assert.equal(JSON.stringify(result.receipt).includes('Ignore me'), false);
  assert.equal(JSON.stringify(result.receipt).includes('example.com'), false);
  assert.equal(result.receipt.presidio, 'NOT_CONFIGURED');
});

test('parsing local exports cannot open a socket', async () => {
  const net = (await import('node:' + 'net')).default;
  const writable = net as typeof net & { connect: typeof net.connect; createConnection: typeof net.createConnection };
  const originalConnect = writable.connect;
  const originalCreateConnection = writable.createConnection;
  const denied = () => { throw new Error('network must remain unavailable'); };
  writable.connect = denied as typeof net.connect;
  writable.createConnection = denied as typeof net.createConnection;
  try {
    const result = ingestTelegramDesktopJson(JSON.stringify({ messages: [{ type: 'message', from: 'Owner', text: 'A local export stays local.' }] }), 'Owner');
    assert.equal(result.samples.length, 1);
  } finally {
    writable.connect = originalConnect;
    writable.createConnection = originalCreateConnection;
  }
});
