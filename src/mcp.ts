import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { analyzeBatchForMcp, analyzeForMcp, applyRebuildForMcp, applyRewriteForMcp, buildProfileForMcp, clearLearningForMcp, finalOutputCheckForMcp, finalizeLifecycleForMcp, finalizeRejectionForMcp, inspectHygieneForMcp, inspectLearningForMcp, inspectLifecycleForMcp, migrateLearningForMcp, patternsForMcp, prepareJudgmentForMcp, prepareLifecycleForMcp, prepareRebuildForMcp, prepareRewriteForMcp, ratifyLearningForMcp, recordApprovedLearningForMcp, recordLearningForMcp, reduceJudgmentForMcp, rewritePromptForMcp, submitSemanticVerdictForMcp, supersedeLearningForMcp, validateFinalApprovalForMcp, verifyCopySpecForMcp, verifyForMcp } from './mcp-tools.js';
import { HYV_VERSION } from './version.js';
import { loadApprovalContext } from './approval-context.js';

const writing = z.string().min(1).max(100_000);
const hygieneText = z.string().max(100_000);
const profileJson = z.string().min(1).max(50_000);
const copySpecJson = z.string().min(1).max(250_000);
const writingBriefJson = z.string().min(1).max(50_000);
const samples = z.array(writing).min(2).max(20);
const avoid = z.array(z.string().min(1).max(200)).max(50).optional();
const lifecycleJson = z.string().min(1).max(1_048_576);
const approvedLearningText = z.string().min(1).max(1_048_576);
const evaluatorId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const semanticViolation = z.enum(['action_change', 'dropped_object', 'unsupported_claim', 'constraint_weakened', 'clarity_regression']);
const redactsSensitiveInputs = process.env.HYV_MCP_SENSITIVE_INPUT_REDACTION === '1';
const learningOptions = {
  mutation_id: z.string().min(1).max(200).optional(),
  authority: z.enum(['founder', 'team', 'system']).optional(),
  provenance: z.string().min(1).max(500).optional(),
  weight: z.number().positive().finite().optional(),
  compatibility: z.enum(['same-or-newer', 'exact']).optional(),
};
function learningArgs(value: { mutation_id?: string; authority?: 'founder' | 'team' | 'system'; provenance?: string; weight?: number; compatibility?: 'same-or-newer' | 'exact' }) {
  return { mutationId: value.mutation_id, authority: value.authority, provenance: value.provenance, weight: value.weight, compatibility: value.compatibility };
}

function json(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

function failure(error: unknown) {
  return { content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }], isError: true };
}

function lifecycleResult(result: ReturnType<typeof submitSemanticVerdictForMcp>) {
  return json(result.ok ? result.artifact : { error: result.error });
}

const server = new McpServer({ name: 'hold-your-voice', version: HYV_VERSION });

server.registerTool('hyv_build_profile', {
  description: 'Build a portable VoiceDNA profile from at least two writing samples. The samples stay in memory and are not saved.',
  inputSchema: { samples, avoid },
  annotations: { readOnlyHint: true },
}, async ({ samples: writingSamples, avoid: phrases }) => {
  try {
    return json(buildProfileForMcp(writingSamples, phrases));
  } catch (error) {
    return failure(error);
  }
});

server.registerTool('hyv_analyze', {
  description: 'Run separate VoiceDNA and AI Editor checks plus a non-scoring Unicode hygiene inspection against a draft using a portable profile JSON string.',
  inputSchema: { draft: writing, profile_json: profileJson, writing_brief_json: writingBriefJson.optional() },
  annotations: { readOnlyHint: true },
}, async ({ draft, profile_json, writing_brief_json }) => {
  try {
    return json(analyzeForMcp(draft, profile_json, writing_brief_json));
  } catch (error) {
    return failure(error);
  }
});

server.registerTool('hyv_hygiene', {
  description: 'Inspect text for zero-width characters, bidirectional controls, Unicode tag characters, and unusual spaces without changing it or requiring a voice profile.',
  inputSchema: { draft: hygieneText },
  annotations: { readOnlyHint: true },
}, async ({ draft }) => json(inspectHygieneForMcp(draft)));

server.registerTool('hyv_final_check', {
  description: 'Gate exact user-facing text from any model, tool, or interface. Returns output only when clean or after removing a leading byte-order mark; unresolved hidden characters withhold output.',
  inputSchema: { text: hygieneText },
  annotations: { readOnlyHint: true },
}, async ({ text }) => json(finalOutputCheckForMcp(text)));

server.registerTool('hyv_rewrite_prompt', {
  description: 'Create a constrained editing brief. It does not rewrite the draft or call a model.',
  inputSchema: { draft: writing, profile_json: profileJson, writing_brief_json: writingBriefJson.optional() },
  annotations: { readOnlyHint: true },
}, async ({ draft, profile_json, writing_brief_json }) => {
  try {
    return json(rewritePromptForMcp(draft, profile_json, {}, writing_brief_json));
  } catch (error) {
    return failure(error);
  }
});

server.registerTool('hyv_prepare_rewrite', {
  description: 'Prepare a local, versioned rewrite task. The caller may forward it to a provider; doing so shares the draft and must be an explicit choice.',
  inputSchema: { draft: writing, profile_json: profileJson, copy_spec_json: copySpecJson.optional(), writing_brief_json: writingBriefJson.optional() },
  annotations: { readOnlyHint: true },
}, async ({ draft, profile_json, copy_spec_json, writing_brief_json }) => {
  try {
    return json(prepareRewriteForMcp(draft, profile_json, copy_spec_json, writing_brief_json));
  } catch (error) {
    return failure(error);
  }
});

server.registerTool('hyv_apply_rewrite', {
  description: 'Validate and apply a model response to a prepared task, then run the local gates. It never calls a provider or stores source or candidate text.',
  inputSchema: { task_json: z.string().min(1).max(250_000), response_json: z.string().min(1).max(100_000), profile_json: profileJson },
  annotations: { readOnlyHint: true },
}, async ({ task_json, response_json, profile_json }) => {
  try {
    return json(applyRewriteForMcp(task_json, response_json, profile_json));
  } catch (error) {
    return failure(error);
  }
});

server.registerTool('hyv_prepare_judgment', {
  description: 'Prepare a versioned pre-edit or post-candidate judgment task. It does not call a model.',
  inputSchema: {
    stage: z.enum(['pre-edit', 'post-candidate']),
    kind: z.enum(['triage', 'argument', 'form', 'polarity', 'flatness', 'semantic']),
    draft: writing,
    profile_json: profileJson,
    candidate: writing.optional(),
  },
  annotations: { readOnlyHint: true },
}, async ({ stage, kind, draft, profile_json, candidate }) => {
  try {
    return json(prepareJudgmentForMcp(stage, kind, draft, profile_json, candidate));
  } catch (error) {
    return failure(error);
  }
});

server.registerTool('hyv_reduce_judgment', {
  description: 'Reduce bound judgment envelopes into SHIP, EDIT, REBUILD, CLEAR, or ESCALATE. It does not call a model.',
  inputSchema: { envelopes_json: z.string().min(1).max(250_000) },
  annotations: { readOnlyHint: true },
}, async ({ envelopes_json }) => {
  try {
    return json(reduceJudgmentForMcp(envelopes_json));
  } catch (error) {
    return failure(error);
  }
});

server.registerTool('hyv_verify', {
  description: 'Verify a revised candidate against an original draft and portable profile without changing learning state.',
  inputSchema: { original: writing, candidate: writing, profile_json: profileJson, writing_brief_json: writingBriefJson.optional() },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
}, async ({ original, candidate, profile_json, writing_brief_json }) => {
  try {
    return json(verifyForMcp(original, candidate, profile_json, writing_brief_json));
  } catch (error) {
    return failure(error);
  }
});

server.registerTool('hyv_verify_copy_spec', {
  description: 'Verify a candidate against the existing voice gates and a local CopySpec. Immutable claims remain verbatim unless atoms are supplied; then each declared atom must remain. Prohibited claims fail closed.',
  inputSchema: { original: writing, candidate: writing, profile_json: profileJson, copy_spec_json: copySpecJson, writing_brief_json: writingBriefJson.optional() },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
}, async ({ original, candidate, profile_json, copy_spec_json, writing_brief_json }) => {
  try {
    return json(verifyCopySpecForMcp(original, candidate, profile_json, copy_spec_json, writing_brief_json));
  } catch (error) {
    return failure(error);
  }
});

server.registerTool('hyv_batch_analyze', {
  description: 'Inspect two to one hundred drafts for repeated opening and closing sentences. It returns advisory batch findings and does not store the drafts.',
  inputSchema: { drafts: z.array(writing).min(2).max(100) },
  annotations: { readOnlyHint: true },
}, async ({ drafts }) => {
  try {
    return json(analyzeBatchForMcp(drafts));
  } catch (error) {
    return failure(error);
  }
});

server.registerTool('hyv_patterns', {
  description: 'List the exact AI Editor rules that run in this extension.',
  inputSchema: {},
  annotations: { readOnlyHint: true },
}, async () => json(patternsForMcp()));

server.registerTool('hyv_learning_inspect', {
  description: 'Inspect profile-scoped learning receipts without returning stored instruction or draft text.',
  inputSchema: { profile_json: profileJson }, annotations: { readOnlyHint: true },
}, async ({ profile_json }) => { try { return json(inspectLearningForMcp(profile_json)); } catch (error) { return failure(error); } });

server.registerTool('hyv_learning_record', {
  description: 'Record an explicit profile-scoped learning instruction with authority and provenance metadata.',
  inputSchema: { profile_json: profileJson, instruction: z.string().min(1).max(240), ...learningOptions }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
}, async (args) => { try { return json(recordLearningForMcp(args.profile_json, args.instruction, learningArgs(args))); } catch (error) { return failure(error); } });

server.registerTool('hyv_learning_ratify', {
  description: 'Ratify a learning event for a Profile v3 revision.',
  inputSchema: { profile_json: profileJson, event_id: z.string().min(1).max(200), ...learningOptions }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
}, async (args) => { try { return json(ratifyLearningForMcp(args.profile_json, args.event_id, learningArgs(args))); } catch (error) { return failure(error); } });

server.registerTool('hyv_learning_supersede', {
  description: 'Supersede a learning event for a Profile v3 revision.',
  inputSchema: { profile_json: profileJson, event_id: z.string().min(1).max(200), ...learningOptions }, annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
}, async (args) => { try { return json(supersedeLearningForMcp(args.profile_json, args.event_id, learningArgs(args))); } catch (error) { return failure(error); } });

server.registerTool('hyv_learning_migrate', {
  description: 'Migrate Profile v2 learning into a Profile v3 identity.',
  inputSchema: { source_profile_json: profileJson, target_profile_json: profileJson, ...learningOptions }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
}, async (args) => { try { return json(migrateLearningForMcp(args.source_profile_json, args.target_profile_json, learningArgs(args))); } catch (error) { return failure(error); } });

server.registerTool('hyv_learning_clear', {
  description: 'Delete all local learning state for a profile.',
  inputSchema: { profile_json: profileJson }, annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
}, async ({ profile_json }) => { try { return json(clearLearningForMcp(profile_json)); } catch (error) { return failure(error); } });

server.registerTool('hyv_lifecycle_prepare_semantic', {
  description: 'Prepare a normal semantic-review task and its initial immutable lifecycle artifact.',
  inputSchema: { deterministic_json: lifecycleJson, binding_json: lifecycleJson, receipt_json: lifecycleJson, policy: z.literal('normal'), allowed_violations: z.array(semanticViolation).max(5) },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
}, async (args) => { try { return json(prepareLifecycleForMcp(args.deterministic_json, args.binding_json, args.receipt_json, args.policy, args.allowed_violations)); } catch (error) { return failure(error); } });

server.registerTool('hyv_lifecycle_submit_verdict', {
  description: 'Submit one normal-policy semantic verdict using the server-installed evaluator authorization context.',
  inputSchema: { artifact_json: lifecycleJson, task_json: lifecycleJson, evaluator_id: evaluatorId, verdict_json: lifecycleJson },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
}, async (args) => { try { return lifecycleResult(submitSemanticVerdictForMcp(args.artifact_json, args.task_json, args.evaluator_id, args.verdict_json, loadApprovalContext())); } catch (error) { return failure(error); } });

server.registerTool('hyv_lifecycle_inspect', {
  description: 'Validate and inspect an immutable lifecycle artifact without exposing bound source or candidate hashes.',
  inputSchema: { artifact_json: lifecycleJson }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
}, async ({ artifact_json }) => { try { return json(inspectLifecycleForMcp(artifact_json)); } catch (error) { return failure(error); } });

if (redactsSensitiveInputs) {
  server.registerTool('hyv_lifecycle_finalize', {
    description: 'Finalize an authorized human approval or rejection. Capability input requires host-guaranteed sensitive-input redaction.',
    inputSchema: { artifact_json: lifecycleJson, decision_json: lifecycleJson, capability_json: lifecycleJson.optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async (args) => { try { return lifecycleResult(finalizeLifecycleForMcp(args.artifact_json, args.decision_json, loadApprovalContext(), args.capability_json)); } catch { return failure(new Error('Lifecycle finalization failed.')); } });

  server.registerTool('hyv_lifecycle_validate_final_approval', {
    description: 'Validate a final-approval capability against the server-installed trust context.',
    inputSchema: { artifact_json: lifecycleJson, capability_json: lifecycleJson }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async (args) => { try { return json(validateFinalApprovalForMcp(args.artifact_json, args.capability_json, loadApprovalContext())); } catch { return failure(new Error('Capability validation failed.')); } });

  server.registerTool('hyv_learning_record_approved', {
    description: 'Record one approval-revalidated, deterministic, text-free learning event.',
    inputSchema: { ready_json: lifecycleJson, approved_json: lifecycleJson, original: approvedLearningText, candidate: approvedLearningText, profile_json: profileJson, decision_json: lifecycleJson, capability_json: lifecycleJson, copy_spec_json: copySpecJson.optional(), writing_brief_json: writingBriefJson.optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async (args) => { try { return json({ status: recordApprovedLearningForMcp({ readyJson: args.ready_json, approvedJson: args.approved_json, source: args.original, candidate: args.candidate, profileJson: args.profile_json, decisionJson: args.decision_json, capabilityJson: args.capability_json, context: loadApprovalContext(), copySpecJson: args.copy_spec_json, writingBriefJson: args.writing_brief_json }) }); } catch { return failure(new Error('Approved learning was not authorized.')); } });

  server.registerTool('hyv_prepare_rebuild', {
    description: 'Prepare a rebuild task only after an upstream REBUILD recommendation, CopySpec, and signed rebuild-authorization capability. Capability input requires host-guaranteed sensitive-input redaction.',
    inputSchema: {
      draft: writing,
      profile_json: profileJson,
      reduction_json: lifecycleJson,
      copy_spec_json: copySpecJson,
      capability_json: lifecycleJson,
      writing_brief_json: writingBriefJson.optional(),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async (args) => {
    try {
      return json(prepareRebuildForMcp(args.draft, args.profile_json, args.reduction_json, args.copy_spec_json, args.capability_json, loadApprovalContext(), args.writing_brief_json));
    } catch {
      return failure(new Error('Rebuild preparation failed.'));
    }
  });

  server.registerTool('hyv_apply_rebuild', {
    description: 'Validate and evaluate a whole-document rebuild response against a prepared authorized rebuild task. Capability input requires host-guaranteed sensitive-input redaction. It never calls a provider.',
    inputSchema: { task_json: lifecycleJson, response_json: z.string().min(1).max(100_000), profile_json: profileJson, capability_json: lifecycleJson },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async (args) => {
    try {
      return json(applyRebuildForMcp(args.task_json, args.response_json, args.profile_json, args.capability_json, loadApprovalContext()));
    } catch {
      return failure(new Error('Rebuild application failed.'));
    }
  });
} else {
  server.registerTool('hyv_lifecycle_finalize', {
    description: 'Record an authorized human rejection. Approval is unavailable because this host does not guarantee sensitive-input redaction.',
    inputSchema: { artifact_json: lifecycleJson, decision_json: lifecycleJson }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async (args) => { try {
    return lifecycleResult(finalizeRejectionForMcp(args.artifact_json, args.decision_json, loadApprovalContext()));
  } catch { return failure(new Error('Only rejection is available without sensitive-input redaction.')); } });
}

await server.connect(new StdioServerTransport());
