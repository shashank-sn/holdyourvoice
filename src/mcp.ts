import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { analyzeBatchForMcp, analyzeForMcp, applyRewriteForMcp, buildProfileForMcp, patternsForMcp, prepareRewriteForMcp, rewritePromptForMcp, verifyCopySpecForMcp, verifyForMcp } from './mcp-tools.js';

const writing = z.string().min(1).max(100_000);
const profileJson = z.string().min(1).max(50_000);
const copySpecJson = z.string().min(1).max(250_000);
const writingBriefJson = z.string().min(1).max(50_000);
const samples = z.array(writing).min(2).max(20);
const avoid = z.array(z.string().min(1).max(200)).max(50).optional();

function json(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

function failure(error: unknown) {
  return { content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }], isError: true };
}

const server = new McpServer({ name: 'hold-your-voice', version: '3.1.1' });

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
  description: 'Run the separate VoiceDNA and AI Editor checks against a draft using a portable profile JSON string.',
  inputSchema: { draft: writing, profile_json: profileJson, writing_brief_json: writingBriefJson.optional() },
  annotations: { readOnlyHint: true },
}, async ({ draft, profile_json, writing_brief_json }) => {
  try {
    return json(analyzeForMcp(draft, profile_json, writing_brief_json));
  } catch (error) {
    return failure(error);
  }
});

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

server.registerTool('hyv_verify', {
  description: 'Verify a revised candidate against an original draft and portable profile. On a successful check, it stores only resolved finding IDs in local profile-scoped learning state; it never retains either text.',
  inputSchema: { original: writing, candidate: writing, profile_json: profileJson, writing_brief_json: writingBriefJson.optional() },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
}, async ({ original, candidate, profile_json, writing_brief_json }) => {
  try {
    return json(verifyForMcp(original, candidate, profile_json, {}, writing_brief_json));
  } catch (error) {
    return failure(error);
  }
});

server.registerTool('hyv_verify_copy_spec', {
  description: 'Verify a candidate against the existing voice gates and a local CopySpec. Immutable claims must remain verbatim and each carries local evidence; prohibited claims fail closed.',
  inputSchema: { original: writing, candidate: writing, profile_json: profileJson, copy_spec_json: copySpecJson, writing_brief_json: writingBriefJson.optional() },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
}, async ({ original, candidate, profile_json, copy_spec_json, writing_brief_json }) => {
  try {
    return json(verifyCopySpecForMcp(original, candidate, profile_json, copy_spec_json, {}, writing_brief_json));
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

await server.connect(new StdioServerTransport());
