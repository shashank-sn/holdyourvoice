import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { analyzeForMcp, buildProfileForMcp, patternsForMcp, rewritePromptForMcp, verifyForMcp } from './mcp-tools.js';

const writing = z.string().min(1).max(100_000);
const profileJson = z.string().min(1).max(50_000);
const samples = z.array(writing).min(2).max(20);
const avoid = z.array(z.string().min(1).max(200)).max(50).optional();

function json(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

function failure(error: unknown) {
  return { content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }], isError: true };
}

const server = new McpServer({ name: 'hold-your-voice', version: '3.1.0' });

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
  inputSchema: { draft: writing, profile_json: profileJson },
  annotations: { readOnlyHint: true },
}, async ({ draft, profile_json }) => {
  try {
    return json(analyzeForMcp(draft, profile_json));
  } catch (error) {
    return failure(error);
  }
});

server.registerTool('hyv_rewrite_prompt', {
  description: 'Create a constrained editing brief. It does not rewrite the draft or call a model.',
  inputSchema: { draft: writing, profile_json: profileJson },
  annotations: { readOnlyHint: true },
}, async ({ draft, profile_json }) => {
  try {
    return json(rewritePromptForMcp(draft, profile_json));
  } catch (error) {
    return failure(error);
  }
});

server.registerTool('hyv_verify', {
  description: 'Verify a revised candidate against an original draft and portable profile. On a successful check, it stores only resolved finding IDs in local profile-scoped learning state; it never retains either text.',
  inputSchema: { original: writing, candidate: writing, profile_json: profileJson },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
}, async ({ original, candidate, profile_json }) => {
  try {
    return json(verifyForMcp(original, candidate, profile_json));
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
