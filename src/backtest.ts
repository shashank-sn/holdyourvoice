import type { EngineReport, Finding, Profile } from './contracts.js';
import { analyze } from './pipeline.js';
import { comparePreservation } from './preservation.js';
import { scoreHeldoutProfile, type ProfileScoreReportV1 } from './profile-score.js';
import { sha256 } from './internal.js';

export interface IsolatedBacktestV1 {
  version: '1';
  contextDigest: string;
  targetDigest: string;
  candidateDigest: string;
  preservation: ReturnType<typeof comparePreservation>['legacySet'];
  aiEditor: Omit<EngineReport, 'findings'> & { findings: Array<Omit<Finding, 'excerpt'>> };
  heldout: ProfileScoreReportV1;
}

function textFreeAiEditor(report: EngineReport): IsolatedBacktestV1['aiEditor'] {
  return { ...report, findings: report.findings.map(({ excerpt: _excerpt, ...finding }) => finding) };
}

/** Scores a caller-supplied candidate without generating from or returning the held-out target. */
export function evaluateIsolatedBacktest(context: string, target: string, candidate: string, profile: Profile, heldoutSamples: string[]): IsolatedBacktestV1 {
  return {
    version: '1', contextDigest: sha256(context), targetDigest: sha256(target), candidateDigest: sha256(candidate),
    preservation: comparePreservation(target, candidate).legacySet,
    aiEditor: textFreeAiEditor(analyze(candidate, profile).aiEditor),
    heldout: scoreHeldoutProfile(candidate, profile, heldoutSamples),
  };
}
