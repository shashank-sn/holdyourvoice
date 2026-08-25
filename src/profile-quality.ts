import { createHash } from 'node:crypto';
import { sentences, words } from './text.js';

export interface ProfileReadinessFindingV1 { id: 'sample_count' | 'sample_length' | 'duplicate_sample' | 'format_spread'; disposition: 'review' | 'signal'; reason: string; suggestion: string; }
export interface ProfileReadinessReportV1 { version: '1'; sampleCount: number; totalWords: number; totalSentences: number; sampleDigests: string[]; findings: ProfileReadinessFindingV1[]; }
export function assessProfileReadiness(samples: string[]): ProfileReadinessReportV1 {
  const totalWords = samples.reduce((sum, sample) => sum + words(sample).length, 0);
  const totalSentences = samples.reduce((sum, sample) => sum + sentences(sample).length, 0);
  const sampleDigests = samples.map((sample) => createHash('sha256').update(sample.trim().replace(/\s+/g, ' ')).digest('hex'));
  const findings: ProfileReadinessFindingV1[] = [];
  if (samples.length < 3) findings.push({ id: 'sample_count', disposition: 'review', reason: 'Two samples can build a profile but give a narrow baseline.', suggestion: 'Use three or more rights-cleared samples from the same writer and context.' });
  if (totalWords < 300 || totalSentences < 12) findings.push({ id: 'sample_length', disposition: 'review', reason: 'The sample set has limited text coverage.', suggestion: 'Add longer samples before treating voice drift as high-confidence evidence.' });
  if (new Set(sampleDigests).size !== sampleDigests.length) findings.push({ id: 'duplicate_sample', disposition: 'review', reason: 'At least two normalized samples are identical.', suggestion: 'Replace duplicate samples with distinct writing.' });
  if (samples.some((sample) => /^\s*[-*#]|^\s*subject:/im.test(sample)) && samples.some((sample) => !/^\s*[-*#]|^\s*subject:/im.test(sample))) findings.push({ id: 'format_spread', disposition: 'signal', reason: 'Samples mix visibly different formats.', suggestion: 'Use a profile per audience and format when the distinction matters.' });
  return { version: '1', sampleCount: samples.length, totalWords, totalSentences, sampleDigests, findings };
}
