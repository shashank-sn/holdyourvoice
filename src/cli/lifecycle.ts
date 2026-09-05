import { writeFileSync } from 'node:fs';
import type { DeterministicVerificationArtifactV1, Profile, ProfileV3, RewriteLifecycleArtifactV1, RewriteLifecycleBindingV1, RewriteReceipt, SemanticPolicy, SemanticReviewTaskV1, SemanticViolation } from '../contracts.js';
import { clearLearning, composeLearning, inspectLearning, type LearningOptions, migrateLearningV2ToV3, profileFingerprint, ratifyLearningEvent, recordLearningInstruction, supersedeLearningEvent } from '../learning.js';
import { canonicalJson } from '../canonical-json.js';
import { finalizeLifecycle, inspectLifecycle, prepareLifecycle, recordApprovedLearning, submitSemanticVerdict, validateFinalApproval } from '../lifecycle-adapter.js';
import { loadApprovalContext } from '../approval-context.js';
import { input, readJson, capabilityArguments, readProfile, prepareContext, json, canonical } from './io.js';

function requireProfileV3(profile: Profile): ProfileV3 {
  if (profile.version !== '3') throw new Error('This learning operation requires a Profile v3.');
  return profile;
}

function learningArguments(args: string[]): { values: string[]; options: LearningOptions } {
  const values: string[] = []; const options: LearningOptions = {};
  for (const argument of args) {
    if (!argument.startsWith('--')) { values.push(argument); continue; }
    const [name, ...parts] = argument.slice(2).split('='); const value = parts.join('=').trim();
    if (!value) throw new Error(`Learning option --${name} requires a value.`);
    if (name === 'mutation-id' && value.length <= 200) options.mutationId = value;
    else if (name === 'authority' && ['founder', 'team', 'system'].includes(value)) options.authority = value as LearningOptions['authority'];
    else if (name === 'provenance' && value.length <= 500) options.provenance = value;
    else if (name === 'weight' && Number.isFinite(Number(value)) && Number(value) > 0) options.weight = Number(value);
    else if (name === 'compatibility' && ['same-or-newer', 'exact'].includes(value)) options.compatibility = value as LearningOptions['compatibility'];
    else throw new Error(`Invalid learning option: --${name}=${value}`);
  }
  return { values, options };
}

export function runLifecycle(args: string[]): number {
  const [action, ...raw] = args;
  if (action === 'prepare-semantic') return prepareSemanticLifecycle(raw);
  if (action === 'submit-verdict') return submitLifecycleVerdict(raw);
  if (action === 'inspect') return inspectLifecycleArtifact(raw);
  if (action === 'validate-final-approval' || action === 'finalize') return finishLifecycle(action, raw);
  throw new Error('Usage: hyv lifecycle <prepare-semantic|submit-verdict|inspect|validate-final-approval|finalize> ...');
}

function prepareSemanticLifecycle(args: string[]): number {
  const [deterministicPath, bindingPath, receiptPath, policy, violationsPath, output, ...extra] = args;
  if (!deterministicPath || !bindingPath || !receiptPath || !policy || !violationsPath || !output || extra.length || !['normal', 'high_assurance'].includes(policy)) throw new Error('Usage: hyv lifecycle prepare-semantic deterministic.json binding.json receipt.json <normal|high_assurance> violations.json output.json');
  if (policy === 'high_assurance') throw new Error('High-assurance semantic review requires a trusted embedding.');
  const result = prepareLifecycle(readJson(deterministicPath) as DeterministicVerificationArtifactV1, readJson(bindingPath) as RewriteLifecycleBindingV1, readJson(receiptPath) as RewriteReceipt, policy as SemanticPolicy, readJson(violationsPath) as SemanticViolation[]);
  const serialized = canonicalJson(result);
  writeFileSync(output, `${serialized}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  process.stdout.write(`${serialized}\n`);
  return 0;
}

function submitLifecycleVerdict(args: string[]): number {
  const [artifactPath, taskPath, evaluatorId, verdictPath, ...extra] = args;
  if (!artifactPath || !taskPath || !evaluatorId || !verdictPath || extra.length) throw new Error('Usage: hyv lifecycle submit-verdict artifact.json task.json evaluator-id verdict.json');
  const artifact = readJson(artifactPath) as RewriteLifecycleArtifactV1;
  const task = readJson(taskPath) as SemanticReviewTaskV1;
  if (task.policy !== 'normal') throw new Error('High-assurance semantic review requires a trusted embedding.');
  const result = submitSemanticVerdict(artifact, task, evaluatorId, readJson(verdictPath), loadApprovalContext());
  canonical(result.ok ? result.artifact : { error: result.error });
  return result.ok && result.artifact.status === 'ready_for_human_review' ? 0 : 2;
}

function inspectLifecycleArtifact(args: string[]): number {
  const [artifactPath, ...extra] = args;
  if (!artifactPath || extra.length) throw new Error('Usage: hyv lifecycle inspect artifact.json');
  canonical(inspectLifecycle(readJson(artifactPath) as RewriteLifecycleArtifactV1));
  return 0;
}

function finishLifecycle(action: 'validate-final-approval' | 'finalize', args: string[]): number {
  const { values, capability } = capabilityArguments(args);
  if (action === 'validate-final-approval') {
    const [artifactPath, ...extra] = values;
    if (!artifactPath || extra.length || !capability) throw new Error('Usage: hyv lifecycle validate-final-approval artifact.json (--capability-stdin|--capability-file path)');
    const result = validateFinalApproval(readJson(artifactPath) as RewriteLifecycleArtifactV1, capability, loadApprovalContext());
    canonical(result);
    return result.ok ? 0 : 2;
  }
  const [artifactPath, decisionPath, ...extra] = values;
  if (!artifactPath || !decisionPath || extra.length) throw new Error('Usage: hyv lifecycle finalize artifact.json decision.json [--capability-stdin|--capability-file path]');
  const decision = readJson(decisionPath) as { evaluatorId: string; decision: 'approve' | 'reject' };
  if (decision.decision === 'approve' && !capability) throw new Error('Approval requires a capability.');
  if (decision.decision === 'reject' && capability) throw new Error('Rejection does not accept a capability.');
  const result = finalizeLifecycle(readJson(artifactPath) as RewriteLifecycleArtifactV1, decision, loadApprovalContext(), capability);
  canonical(result.ok ? result.artifact : { error: result.error });
  return result.ok && result.artifact.status === 'approved' ? 0 : 2;
}

export function runLearning(args: string[]): number {
  const [action, ...raw] = args;
  if (action === 'record-approved') return runRecordApprovedLearning(raw);
  const { values, options } = learningArguments(raw);
  const [profilePath, ...operands] = values;
  if (!action || !profilePath) throw new Error('Usage: hyv learning <show|inspect|add|record|ratify|supersede|migrate|clear> profile.json [value] [options]');
  const profile = readProfile(profilePath);
  if (action === 'show') {
    json({ profile: profileFingerprint(profile), preferences: composeLearning(profile, options) });
    return 0;
  }
  if (action === 'inspect') {
    if (Object.keys(options).length) throw new Error('Usage: hyv learning inspect profile.json');
    json(inspectLearning(profile));
    return 0;
  }
  if (action === 'add' || action === 'record') {
    const text = operands.join(' ').trim();
    if (!text) throw new Error('Usage: hyv learning record profile.json "instruction" [options]');
    const result = recordLearningInstruction(profile, text, options);
    json(action === 'add' ? { added: result.status === 'recorded' } : result);
    return 0;
  }
  if (action === 'ratify' || action === 'supersede') {
    const [eventId, ...extra] = operands;
    if (!eventId || extra.length) throw new Error(`Usage: hyv learning ${action} profile.json event-id [options]`);
    json(action === 'ratify' ? ratifyLearningEvent(requireProfileV3(profile), eventId, options) : supersedeLearningEvent(requireProfileV3(profile), eventId, options));
    return 0;
  }
  if (action === 'migrate') {
    const [targetPath, ...extra] = operands;
    if (!targetPath || extra.length || profile.version !== '2') throw new Error('Usage: hyv learning migrate source-v2.json target-v3.json [options]');
    json(migrateLearningV2ToV3(profile, requireProfileV3(readProfile(targetPath)), options));
    return 0;
  }
  if (action === 'clear') {
    if (operands.length || Object.keys(options).length) throw new Error('Usage: hyv learning clear profile.json');
    json({ cleared: clearLearning(profile) });
    return 0;
  }
  throw new Error('Usage: hyv learning <show|inspect|add|record|ratify|supersede|migrate|clear> profile.json [value] [options]');
}

function runRecordApprovedLearning(args: string[]): number {
  const { values, capability } = capabilityArguments(args);
  const [readyPath, approvedPath, originalPath, candidatePath, profilePath, decisionPath, ...contextPaths] = values;
  if (!readyPath || !approvedPath || !originalPath || !candidatePath || !profilePath || !decisionPath || !capability) throw new Error('Usage: hyv learning record-approved ready.json approved.json original.md candidate.md profile.json decision.json [copy-spec.json] [writing-brief.json] (--capability-stdin|--capability-file path)');
  const context = prepareContext(contextPaths);
  const status = recordApprovedLearning({ ready: readJson(readyPath) as RewriteLifecycleArtifactV1, approved: readJson(approvedPath) as RewriteLifecycleArtifactV1, decision: readJson(decisionPath) as { evaluatorId: string; decision: 'approve' }, capability, source: input(originalPath), candidate: input(candidatePath), profile: readProfile(profilePath), context: loadApprovalContext(), copySpec: context.copySpec, writingBrief: context.writingBrief });
  canonical({ status });
  return status === 'write_failed' ? 2 : 0;
}
