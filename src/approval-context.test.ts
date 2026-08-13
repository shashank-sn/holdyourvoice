import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { approvalContextMetadataIsSafe, loadApprovalContext } from './approval-context.js';

const context = { now: 0, trustStore: { version: '1', audience: '@holdyourvoice/hyv', maxCapabilityLifetimeSeconds: 300, keys: [] }, authorizedSemanticEvaluatorIds: { normal: ['reviewer-1'], highAssurance: [] }, authorizedHumanFinalizerIds: ['human-1'] };

test('loads only a permission-checked installed approval context and replaces its clock', () => {
  const root = mkdtempSync(join(tmpdir(), 'hyv-approval-context-'));
  try {
    const safe = join(root, 'safe.json'); writeFileSync(safe, JSON.stringify(context), { mode: 0o600 });
    const loaded = loadApprovalContext(safe); assert.deepEqual(loaded.authorizedSemanticEvaluatorIds.normal, ['reviewer-1']); assert.notEqual(loaded.now, 0);
    chmodSync(safe, 0o644); assert.throws(() => loadApprovalContext(safe), /unavailable or unsafe/);
    chmodSync(safe, 0o600); const link = join(root, 'link.json'); symlinkSync(safe, link); assert.throws(() => loadApprovalContext(link), /unavailable or unsafe/);
    const malformed = join(root, 'malformed.json'); writeFileSync(malformed, JSON.stringify({ ...context, authorizedSemanticEvaluatorIds: { normal: ['bad id'], highAssurance: [] } }), { mode: 0o600 }); assert.throws(() => loadApprovalContext(malformed), /unavailable or unsafe/);
    const malformedTrust = join(root, 'malformed-trust.json'); writeFileSync(malformedTrust, JSON.stringify({ ...context, trustStore: { ...context.trustStore, maxCapabilityLifetimeSeconds: 0 } }), { mode: 0o600 }); assert.throws(() => loadApprovalContext(malformedTrust), /unavailable or unsafe/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('fails closed when POSIX ownership metadata is unavailable on this host', () => {
  const metadata = { isFile: () => true, nlink: 1, size: 10, uid: 501, mode: 0o600 };
  assert.equal(approvalContextMetadataIsSafe(metadata, undefined), process.platform === 'win32');
  assert.equal(approvalContextMetadataIsSafe(metadata, 501), true);
  assert.equal(approvalContextMetadataIsSafe({ ...metadata, mode: 0o644 }, 501), false);
});
