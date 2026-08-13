import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import type { Stats } from 'node:fs';
import type { RewriteLifecycleContextV1 } from './contracts.js';
import { parseApprovalTrustStore } from './approval-capability.js';

const MAX_BYTES = 1024 * 1024;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function readBounded(descriptor: number): string {
  const chunks: Buffer[] = []; let size = 0;
  while (size <= MAX_BYTES) {
    const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, MAX_BYTES + 1 - size));
    const count = readSync(descriptor, chunk, 0, chunk.length, null); if (!count) break;
    chunks.push(chunk.subarray(0, count)); size += count;
  }
  if (size > MAX_BYTES) throw new Error();
  return Buffer.concat(chunks, size).toString('utf8');
}

function validIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 128 && value.every((item) => typeof item === 'string' && ID.test(item)) && new Set(value).size === value.length;
}

export function approvalContextMetadataIsSafe(value: Pick<Stats, 'isFile' | 'nlink' | 'size' | 'uid' | 'mode'>, effectiveUserId: number | undefined): boolean {
  if (!value.isFile() || value.nlink !== 1 || value.size > MAX_BYTES) return false;
  if (effectiveUserId === undefined) return process.platform === 'win32';
  return value.uid === effectiveUserId && (value.mode & 0o077) === 0;
}

export function loadApprovalContext(path = join(userInfo().homedir, '.config', 'holdyourvoice', 'approval-context.json')): RewriteLifecycleContextV1 {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)); const before = fstatSync(descriptor);
    if (!approvalContextMetadataIsSafe(before, process.geteuid?.())) throw new Error();
    const value = JSON.parse(readBounded(descriptor)) as RewriteLifecycleContextV1; const after = fstatSync(descriptor);
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs
      || !value || typeof value !== 'object' || !parseApprovalTrustStore(value.trustStore) || !value.authorizedSemanticEvaluatorIds
      || !validIds(value.authorizedSemanticEvaluatorIds.normal) || !validIds(value.authorizedSemanticEvaluatorIds.highAssurance) || !validIds(value.authorizedHumanFinalizerIds)) throw new Error();
    return { ...value, now: Math.floor(Date.now() / 1000) };
  } catch { throw new Error('Approval context is unavailable or unsafe.'); }
  finally { if (descriptor !== undefined) closeSync(descriptor); }
}
