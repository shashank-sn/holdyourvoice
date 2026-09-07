import type { Analysis, Finding, Profile, ProfileV3, WritingBrief } from './contracts.js';
import { finalOutputCheck } from './hygiene.js';
import { analyze } from './pipeline.js';
import { assessProfileReadiness, type ProfileReadinessReportV1 } from './profile-quality.js';

export type StrictQualityDisposition = 'strict-ready' | 'needs-human-review' | 'blocked';
export type StrictQualityFindingDisposition = 'block' | 'review';

export interface StrictQualityFindingV1 {
  id: string;
  disposition: StrictQualityFindingDisposition;
  reason: string;
  suggestion: string;
  sentence?: number;
}

export interface StrictQualityReportV1 {
  version: '1';
  disposition: StrictQualityDisposition;
  readiness: ProfileReadinessReportV1;
  analysis: Analysis;
  finalOutputAccepted: boolean;
  findings: StrictQualityFindingV1[];
}

const MINIMUM_SAMPLES = 5;
const MINIMUM_WORDS = 1_500;

function finding(id: string, disposition: StrictQualityFindingDisposition, reason: string, suggestion: string, sentence?: number): StrictQualityFindingV1 {
  return { id, disposition, reason, suggestion, ...(sentence === undefined ? {} : { sentence }) };
}

const FINGERPRINT_KEYS = new Map<string, keyof ProfileV3['tolerances']>([
  ['dna.fingerprint.contraction-rate', 'contractionRate'],
  ['dna.fingerprint.sentence-length-distribution', 'sentenceLengthDistribution'],
  ['dna.fingerprint.bullet-rate', 'bulletRate'],
  ['dna.fingerprint.en-dash-rate', 'enDashRate'],
]);

function strictFinding(source: Finding, profile: ProfileV3): StrictQualityFindingV1 {
  const metric = FINGERPRINT_KEYS.get(source.id);
  const calibratedDrift = source.engine === 'voice_dna' && metric && profile.tolerances[metric].calibrated;
  const blocks = source.engine === 'ai_editor' || source.severity === 'red' || calibratedDrift;
  return finding(`strict.${source.engine}.${source.id}`, blocks ? 'block' : 'review', source.reason, source.suggestion, source.sentence);
}

export function evaluateStrictQuality(draft: string, profile: Profile, samples: string[], brief?: WritingBrief): StrictQualityReportV1 {
  const readiness = assessProfileReadiness(samples);
  const analysis = analyze(draft, profile, brief);
  const output = finalOutputCheck(draft);
  const findings: StrictQualityFindingV1[] = [];

  if (profile.version !== '3') {
    findings.push(finding('strict.profile.version', 'block', 'Strict quality requires a fixture-backed Profile v3.', 'Build and validate a Profile v3 before enabling strict quality.'));
  } else {
    if (profile.sampleCount < MINIMUM_SAMPLES) findings.push(finding('strict.profile.profile-sample-count', 'block', `Strict quality requires a Profile v3 built from at least ${MINIMUM_SAMPLES} samples; the profile declares ${profile.sampleCount}.`, 'Rebuild and calibrate the profile from at least five distinct, rights-cleared samples.'));
    if (samples.length < MINIMUM_SAMPLES) findings.push(finding('strict.profile.sample-count', 'block', `Strict quality requires at least ${MINIMUM_SAMPLES} local samples; received ${samples.length}.`, 'Add channel-matched, rights-cleared samples from the same writer.'));
    if (readiness.totalWords < MINIMUM_WORDS) findings.push(finding('strict.profile.sample-words', 'block', `Strict quality requires at least ${MINIMUM_WORDS} sample words; received ${readiness.totalWords}.`, 'Add channel-matched, rights-cleared samples before treating voice drift as strict evidence.'));
    if (readiness.findings.some((item) => item.id === 'sample_length')) findings.push(finding('strict.profile.sample-coverage', 'block', 'Strict quality requires enough sentence-level sample coverage to calibrate voice drift.', 'Add longer samples with distinct sentences before treating voice drift as strict evidence.'));
    if (readiness.findings.some((item) => item.id === 'duplicate_sample')) findings.push(finding('strict.profile.duplicate-sample', 'block', 'Strict quality cannot calibrate from duplicate samples.', 'Replace duplicate samples with distinct writing occasions.'));
    if (readiness.findings.some((item) => item.id === 'format_spread')) findings.push(finding('strict.profile.format-spread', 'block', 'Strict quality cannot use a mixed-format sample set as one voice baseline.', 'Use samples from the same intended format and audience, or maintain separate calibrated profiles.'));
    for (const [metric, tolerance] of Object.entries(profile.tolerances)) {
      if (!tolerance.calibrated) findings.push(finding(`strict.profile.uncalibrated.${metric}`, 'block', `Strict quality requires a calibrated ${metric} tolerance.`, 'Calibrate this metric against held-out writing before treating its drift as a strict result.'));
    }
    for (const source of [...analysis.voiceDna.findings, ...analysis.aiEditor.findings, ...(analysis.editorial?.findings ?? [])]) findings.push(strictFinding(source, profile));
  }

  if (!output.accepted) findings.push(finding('strict.final-output', 'block', 'Final output contains unresolved hidden text.', 'Resolve hidden-text findings before treating the draft as strict-ready.'));
  const disposition: StrictQualityDisposition = findings.some((item) => item.disposition === 'block')
    ? 'blocked'
    : findings.length ? 'needs-human-review' : 'strict-ready';
  return { version: '1', disposition, readiness, analysis, finalOutputAccepted: output.accepted, findings };
}
