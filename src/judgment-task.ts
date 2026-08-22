import type {
  JudgmentEnvelopeV1,
  JudgmentFindingV1,
  JudgmentKind,
  JudgmentStage,
  JudgmentTaskV1,
  PostCandidateDecision,
  PreEditDecision,
  PreEditReduction,
  Profile,
  SentenceRange,
} from './contracts.js';
import { canonicalJson } from './canonical-json.js';
import { sentences } from './text.js';
import { HYV_VERSION } from './version.js';
import { profileIdentity, sha256 as digest } from './internal.js';

const PRE_EDIT_KINDS: JudgmentKind[] = ['triage', 'argument', 'form'];
const POST_CANDIDATE_KINDS: JudgmentKind[] = ['argument', 'polarity', 'form', 'flatness', 'semantic'];

function fingerprintTask(task: Omit<JudgmentTaskV1, 'taskFingerprint'>): string {
  return digest(`hyv:judgment-task:v1\0${canonicalJson(task)}`);
}

function sentenceIds(text: string): number[] {
  return sentences(text).map((sentence) => sentence.index);
}

function isRange(value: unknown): value is SentenceRange {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && Number.isInteger((value as SentenceRange).startSentenceId)
    && Number.isInteger((value as SentenceRange).endSentenceId)
    && (value as SentenceRange).startSentenceId >= 1
    && (value as SentenceRange).endSentenceId >= (value as SentenceRange).startSentenceId;
}

function rangesContiguous(ranges: SentenceRange[]): boolean {
  return ranges.every((range) => range.endSentenceId >= range.startSentenceId);
}

export function parseJudgmentEnvelope(value: unknown): JudgmentEnvelopeV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Judgment envelope must be an object.');
  const envelope = value as Partial<JudgmentEnvelopeV1>;
  if (envelope.version !== '1') throw new Error('Judgment envelope version must be "1".');
  if (envelope.stage !== 'pre-edit' && envelope.stage !== 'post-candidate') throw new Error('Judgment stage is invalid.');
  if (typeof envelope.judgmentType !== 'string' || typeof envelope.taskFingerprint !== 'string' || envelope.taskFingerprint.length !== 64) {
    throw new Error('Judgment envelope is missing a bound task.');
  }
  if (!envelope.bindings || typeof envelope.bindings !== 'object' || typeof envelope.bindings.sourceHash !== 'string' || typeof envelope.bindings.evaluatorId !== 'string') {
    throw new Error('Judgment envelope is missing bindings.');
  }
  if (!Array.isArray(envelope.findings) || typeof envelope.decision !== 'string') throw new Error('Judgment envelope is missing findings or a decision.');
  for (const [index, finding] of envelope.findings.entries()) {
    if (!finding || typeof finding !== 'object' || typeof finding.kind !== 'string') throw new Error(`Finding ${index} is invalid.`);
    if (finding.ranges && (!Array.isArray(finding.ranges) || !finding.ranges.every(isRange))) throw new Error(`Finding ${index} ranges are invalid.`);
  }
  if (envelope.editScope && (!Array.isArray(envelope.editScope.ranges) || !envelope.editScope.ranges.every(isRange))) {
    throw new Error('Edit scope ranges are invalid.');
  }
  return envelope as JudgmentEnvelopeV1;
}

function prepareTask(stage: JudgmentStage, judgmentType: JudgmentKind, draft: string, profile: Profile, candidate?: string): JudgmentTaskV1 {
  const identity = profileIdentity(profile);
  const allowedDecisions = stage === 'pre-edit' ? ['SHIP', 'EDIT', 'REBUILD'] as PreEditDecision[] : ['CLEAR', 'ESCALATE', 'REBUILD'] as PostCandidateDecision[];
  const base: Omit<JudgmentTaskV1, 'taskFingerprint'> = {
    version: '1',
    stage,
    judgmentType,
    ...(stage === 'pre-edit' ? { draft } : { draft, candidate }),
    bindings: {
      sourceHash: digest(draft),
      ...(candidate !== undefined ? { candidateHash: digest(candidate) } : {}),
      ...identity,
      rulesetVersion: HYV_VERSION,
      evidenceScope: { sentenceIds: sentenceIds(candidate ?? draft) },
    },
    allowedDecisions,
  };
  return { ...base, taskFingerprint: fingerprintTask(base) };
}

export function preparePreEditJudgment(draft: string, profile: Profile, kind: 'triage' | 'argument' | 'form'): JudgmentTaskV1 {
  return prepareTask('pre-edit', kind, draft, profile);
}

export function preparePostCandidateJudgment(draft: string, candidate: string, profile: Profile, kind: 'argument' | 'polarity' | 'form' | 'flatness' | 'semantic'): JudgmentTaskV1 {
  return prepareTask('post-candidate', kind, draft, profile, candidate);
}

export function bindJudgmentEnvelope(task: JudgmentTaskV1, envelope: unknown): JudgmentEnvelopeV1 {
  const parsed = parseJudgmentEnvelope(envelope);
  if (parsed.taskFingerprint !== task.taskFingerprint) throw new Error('Judgment envelope task fingerprint does not match.');
  if (parsed.stage !== task.stage || parsed.judgmentType !== task.judgmentType) throw new Error('Judgment envelope type does not match the task.');
  if (parsed.bindings.sourceHash !== task.bindings.sourceHash) throw new Error('Judgment envelope source hash does not match.');
  if (task.bindings.candidateHash && parsed.bindings.candidateHash !== task.bindings.candidateHash) throw new Error('Judgment envelope candidate hash does not match.');
  if (parsed.bindings.profileId !== task.bindings.profileId || parsed.bindings.profileRevisionDigest !== task.bindings.profileRevisionDigest) {
    throw new Error('Judgment envelope profile binding does not match.');
  }
  if (parsed.bindings.rulesetVersion !== task.bindings.rulesetVersion) throw new Error('Judgment envelope ruleset does not match.');
  if (canonicalJson(parsed.bindings.evidenceScope) !== canonicalJson(task.bindings.evidenceScope)) throw new Error('Judgment envelope evidence scope does not match.');
  if (!task.allowedDecisions.includes(parsed.decision)) throw new Error('Judgment decision is not allowed at this stage.');
  return parsed;
}

function namedRanges(findings: JudgmentFindingV1[]): SentenceRange[] {
  return findings.flatMap((finding) => finding.ranges ?? []);
}

function fingerprintReduction(decision: PreEditDecision, editScope: { ranges: SentenceRange[] }, reason?: 'unbounded_argument_failure'): string {
  return digest(`hyv:pre-edit-reduction:v1\0${canonicalJson({ decision, editScope, ...(reason ? { reason } : {}) })}`);
}

export function fingerprintPreEditReduction(reduction: Pick<PreEditReduction, 'decision' | 'editScope' | 'reason'>): string {
  return fingerprintReduction(reduction.decision, reduction.editScope, reduction.reason);
}

function reduced(decision: PreEditDecision, editScope: { ranges: SentenceRange[] }, reason?: 'unbounded_argument_failure'): PreEditReduction {
  return { decision, editScope, ...(reason ? { reason } : {}), recommendationFingerprint: fingerprintReduction(decision, editScope, reason) };
}

export function reducePreEdit(envelopes: JudgmentEnvelopeV1[]): PreEditReduction {
  if (envelopes.length !== PRE_EDIT_KINDS.length) throw new Error('Pre-edit reduction requires triage, argument, and form envelopes.');
  const kinds = new Set(envelopes.map((envelope) => envelope.judgmentType));
  if (PRE_EDIT_KINDS.some((kind) => !kinds.has(kind))) throw new Error('Pre-edit reduction requires triage, argument, and form envelopes.');
  if (envelopes.some((envelope) => envelope.stage !== 'pre-edit')) throw new Error('Pre-edit reduction rejects post-candidate envelopes.');
  const argument = envelopes.find((envelope) => envelope.judgmentType === 'argument')!;
  if (argument.findings.some((finding) => finding.unbounded) || argument.decision === 'REBUILD') {
    return reduced('REBUILD', { ranges: [] }, argument.findings.some((finding) => finding.unbounded) ? 'unbounded_argument_failure' : undefined);
  }
  if (envelopes.some((envelope) => envelope.decision === 'REBUILD')) {
    return reduced('REBUILD', { ranges: [] });
  }
  const ranges = envelopes.flatMap((envelope) => envelope.editScope?.ranges ?? namedRanges(envelope.findings));
  if (!rangesContiguous(ranges) || ranges.some((range) => range.endSentenceId < range.startSentenceId)) {
    throw new Error('Edit scope must name contiguous sentence ranges.');
  }
  if (envelopes.every((envelope) => envelope.decision === 'SHIP') && ranges.length === 0) {
    return reduced('SHIP', { ranges: [] });
  }
  if (ranges.length === 0) throw new Error('Paragraph-level findings cannot unlock text unless they name contiguous sentence ranges.');
  return reduced('EDIT', { ranges });
}

export function reducePostCandidate(envelopes: JudgmentEnvelopeV1[]): { decision: PostCandidateDecision } {
  if (envelopes.length !== POST_CANDIDATE_KINDS.length) throw new Error('Post-candidate reduction requires argument, polarity, form, flatness, and semantic envelopes.');
  const kinds = new Set(envelopes.map((envelope) => envelope.judgmentType));
  if (POST_CANDIDATE_KINDS.some((kind) => !kinds.has(kind))) throw new Error('Post-candidate reduction requires argument, polarity, form, flatness, and semantic envelopes.');
  if (envelopes.some((envelope) => envelope.stage !== 'post-candidate')) throw new Error('Post-candidate reduction rejects pre-edit envelopes.');
  if (envelopes.some((envelope) => envelope.decision === 'REBUILD')) return { decision: 'REBUILD' };
  if (envelopes.some((envelope) => envelope.decision === 'ESCALATE')) return { decision: 'ESCALATE' };
  if (!envelopes.every((envelope) => envelope.decision === 'CLEAR')) throw new Error('Post-candidate envelopes must CLEAR, ESCALATE, or REBUILD.');
  return { decision: 'CLEAR' };
}

export function authorizedSentenceIds(reduction: PreEditReduction): number[] {
  if (reduction.decision !== 'EDIT') return [];
  const ids = new Set<number>();
  for (const range of reduction.editScope.ranges) {
    for (let id = range.startSentenceId; id <= range.endSentenceId; id += 1) ids.add(id);
  }
  return [...ids].sort((left, right) => left - right);
}
