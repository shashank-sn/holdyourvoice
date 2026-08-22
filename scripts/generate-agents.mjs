#!/usr/bin/env node
// Generates the portable agent package tree under skills/hyv-*.
// Each package contains agent.json, SKILL.md, and agents/openai.yaml.
// Run: node scripts/generate-agents.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS = join(ROOT, 'skills');
const SCHEMA = '1.0.0';

const TOOL_FREE = {
  available: true,
  behavior:
    'Provide the decision, artifact template, and exact unavailable capability; never claim a tool action occurred.',
  unavailable_statuses: ['NOT_AVAILABLE', 'NOT_CONFIGURED', 'NOT_RUN', 'STALE', 'ERROR'],
};

const COMMANDS = [
  {
    id: 'hyv-profile', cmd: 'profile',
    role: 'Profile builder', phase: 'analyze',
    description: 'Build a portable VoiceDNA profile from at least two writing samples.',
    input: { required: ['profile output path', 'two or more sample paths'], optional: ['--avoid=phrase avoid-list entries'] },
    output: { required: ['written profile.json'], optional: [] },
    permissions: ['read_repository', 'write_repository'],
    handoff: ['hyv-analyze', 'hyv-rewrite-prompt'],
    usage: 'hyv profile profile.json sample-a.md sample-b.md [sample-c.md] [--avoid=phrase]',
    body: 'Build a portable VoiceDNA profile from at least two writing samples. Samples stay in memory and are not saved into the profile; only measured voice features are written. The output path must be supplied first, followed by two or more sample paths. Use --avoid=phrase to add phrases that must never appear in later output.',
  },
  {
    id: 'hyv-analyze', cmd: 'analyze',
    role: 'Analyzer', phase: 'analyze',
    description: 'Run separate VoiceDNA and AI Editor checks plus a non-scoring Unicode hygiene inspection against a draft.',
    input: { required: ['draft path', 'profile path'], optional: ['writing-brief.json'] },
    output: { required: ['combined analysis report'], optional: [] },
    permissions: ['read_repository'],
    handoff: ['hyv-rewrite-prompt', 'hyv-prepare-rewrite'],
    usage: 'hyv analyze draft.md profile.json [writing-brief.json]',
    body: 'Run independent VoiceDNA and AI Editor reports plus a separate non-scoring Unicode hygiene report against a draft using a portable profile. An optional WritingBrief adds local audience, intent, and format context without changing the profile. Analysis is read-only; it never rewrites the draft or calls a model.',
  },
  {
    id: 'hyv-hygiene', cmd: 'hygiene',
    role: 'Hygiene inspector', phase: 'verify',
    description: 'Inspect text for zero-width characters, bidirectional controls, tag characters, and unusual spaces.',
    input: { required: ['draft path'], optional: ['--fix', '--output=cleaned.md'] },
    output: { required: ['hygiene report', 'optional cleaned file'], optional: [] },
    permissions: ['read_repository', 'write_repository'],
    handoff: ['hyv-final-check'],
    usage: 'hyv hygiene draft.md [--fix] [--output=cleaned.md]',
    body: 'Inspect text for zero-width characters, bidirectional controls, Unicode tag characters, and unusual spaces without requiring a voice profile. Inspection is read-only. --fix writes a new cleaned path (never overwriting the input or an existing output), reports every changed offset, and preserves controls it is not authorized to remove.',
  },
  {
    id: 'hyv-inspect-hidden-text', cmd: 'inspect-hidden-text',
    role: 'Hidden-text inspector', phase: 'verify',
    description: 'Inspect hidden text controls with a non-mutating policy report.',
    input: { required: ['draft path'], optional: ['policy.json'] },
    output: { required: ['hidden-text inspection report'], optional: [] },
    permissions: ['read_repository'],
    handoff: ['hyv-apply-hidden-text-policy', 'hyv-final-check'],
    usage: 'hyv inspect-hidden-text draft.md [policy.json]',
    body: 'Inspect hidden text controls with a non-mutating policy report. Findings are not watermark verdicts. An optional policy.json restricts which controls are reported.',
  },
  {
    id: 'hyv-apply-hidden-text-policy', cmd: 'apply-hidden-text-policy',
    role: 'Hidden-text editor', phase: 'edit',
    description: 'Apply only explicitly approved minimal hidden-text removals and return hashes, exact changes, and remaining findings.',
    input: { required: ['draft path', 'policy path', 'output path'], optional: [] },
    output: { required: ['written output.md', 'change report'], optional: [] },
    permissions: ['read_repository', 'write_repository'],
    handoff: ['hyv-final-check'],
    usage: 'hyv apply-hidden-text-policy draft.md policy.json output.md',
    body: 'Apply only explicitly approved minimal hidden-text removals and return hashes, exact changes, and remaining review findings. The output must differ from the input path. This never invents removals beyond the approved policy.',
  },
  {
    id: 'hyv-final-check', cmd: 'final-check',
    role: 'Output gate', phase: 'verify',
    description: 'Gate exact user-facing text from any model, tool, or interface.',
    input: { required: ['text path or -'], optional: [] },
    output: { required: ['accepted output or withheld report'], optional: [] },
    permissions: ['read_repository'],
    handoff: [],
    usage: 'hyv final-check <path|->',
    body: 'Gate exact final text from every producer. Returns output only when clean or after removing a leading byte-order mark; unresolved hidden characters withhold output. It does not require or select a VoiceDNA profile. Run it immediately before display, copy, export, posting, or returning an API response.',
  },
  {
    id: 'hyv-fact-lint', cmd: 'fact-lint',
    role: 'Fact linter', phase: 'verify',
    description: 'Lint factual claims in a draft against named sources.',
    input: { required: ['draft path', 'one or more --source=id:path'], optional: ['--metadata=metadata.json', '--strict', '--human'] },
    output: { required: ['fact lint report'], optional: [] },
    permissions: ['read_repository'],
    handoff: ['hyv-verify'],
    usage: 'hyv fact-lint <draft|-> --source=id:path [--source=id:path] [--metadata=metadata.json] [--strict] [--human]',
    body: 'Lint factual claims in a draft against one or more named sources passed as --source=id:path. Optional --metadata provides fact metadata, --strict raises severity, and --human selects the human-readable report.',
  },
  {
    id: 'hyv-logic-lint', cmd: 'logic-lint',
    role: 'Logic linter', phase: 'verify',
    description: 'Run the deterministic document-coherence gate for topic drift, unanchored inference, and internal contradictions.',
    input: { required: ['draft path'], optional: ['writing-brief.json'] },
    output: { required: ['logic lint report'], optional: [] },
    permissions: ['read_repository'],
    handoff: ['hyv-verify'],
    usage: 'hyv logic-lint <draft|-> [writing-brief.json]',
    body: 'Run the deterministic document-coherence gate. It detects configured topic drift, unanchored inference, and direct internal contradictions; it does not verify facts or approve publication.',
  },
  {
    id: 'hyv-batch-analyze', cmd: 'batch-analyze',
    role: 'Batch analyzer', phase: 'analyze',
    description: 'Inspect two to one hundred drafts for repeated opening and closing sentences.',
    input: { required: ['two or more draft paths'], optional: [] },
    output: { required: ['advisory batch findings'], optional: [] },
    permissions: ['read_repository'],
    handoff: ['hyv-analyze'],
    usage: 'hyv batch-analyze draft-a.md draft-b.md [draft-c.md]',
    body: 'Inspect two to one hundred drafts for repeated opening and closing sentences. It returns advisory batch findings and does not store the drafts.',
  },
  {
    id: 'hyv-rewrite-prompt', cmd: 'rewrite-prompt',
    role: 'Brief author', phase: 'plan',
    description: 'Create a constrained editing brief without rewriting the draft.',
    input: { required: ['draft path', 'profile path'], optional: ['writing-brief.json'] },
    output: { required: ['markdown editing brief'], optional: [] },
    permissions: ['read_repository'],
    handoff: ['hyv-prepare-rewrite'],
    usage: 'hyv rewrite-prompt draft.md profile.json [writing-brief.json] > rewrite-brief.md',
    body: 'Create a constrained editing brief. It does not rewrite the draft or call a model. The brief is printed to stdout for redirect into a markdown file.',
  },
  {
    id: 'hyv-prepare-rewrite', cmd: 'prepare-rewrite',
    role: 'Task preparer', phase: 'plan',
    description: 'Prepare a local, versioned, fingerprint-bound rewrite task.',
    input: { required: ['draft path', 'profile path', 'task output path'], optional: ['copy-spec.json', 'writing-brief.json'] },
    output: { required: ['written task.json'], optional: [] },
    permissions: ['read_repository', 'write_repository'],
    handoff: ['hyv-apply-rewrite'],
    usage: 'hyv prepare-rewrite draft.md profile.json task.json [copy-spec.json] [writing-brief.json]',
    body: 'Prepare a local, versioned rewrite task written to the named output path. The caller may forward it to a provider; doing so shares the draft and must be an explicit choice. This command never calls a provider itself.',
  },
  {
    id: 'hyv-apply-rewrite', cmd: 'apply-rewrite',
    role: 'Edit applier', phase: 'edit',
    description: 'Validate and apply a model response to a prepared rewrite task, then run local gates.',
    input: { required: ['task.json', 'response.json', 'profile.json'], optional: [] },
    output: { required: ['applied candidate and gate report'], optional: [] },
    permissions: ['read_repository'],
    handoff: ['hyv-verify', 'hyv-prepare-judgment'],
    usage: 'hyv apply-rewrite task.json response.json profile.json',
    body: 'Validate and apply a model response to a prepared task, then run the local gates. It never calls a provider or stores source or candidate text. Exits 2 unless the result is accepted.',
  },
  {
    id: 'hyv-prepare-judgment', cmd: 'prepare-judgment',
    role: 'Judgment preparer', phase: 'plan',
    description: 'Prepare a versioned pre-edit or post-candidate judgment task.',
    input: { required: ['stage (pre-edit|post-candidate)', 'kind', 'draft path', 'profile path', 'task output path'], optional: ['candidate.md'] },
    output: { required: ['written judgment task.json'], optional: [] },
    permissions: ['read_repository', 'write_repository'],
    handoff: ['hyv-reduce-judgment'],
    usage: 'hyv prepare-judgment pre-edit|post-candidate kind draft.md profile.json task.json [candidate.md]',
    body: 'Prepare a versioned pre-edit or post-candidate judgment task. It does not call a model. The post-candidate stage requires a candidate path.',
  },
  {
    id: 'hyv-reduce-judgment', cmd: 'reduce-judgment',
    role: 'Judgment reducer', phase: 'review',
    description: 'Reduce bound judgment envelopes into SHIP, EDIT, REBUILD, CLEAR, or ESCALATE.',
    input: { required: ['three or more judgment envelope.json paths'], optional: [] },
    output: { required: ['reduced decision'], optional: [] },
    permissions: ['read_repository'],
    handoff: ['hyv-prepare-rebuild'],
    usage: 'hyv reduce-judgment envelope.json envelope.json envelope.json [envelope.json...]',
    body: 'Reduce bound judgment envelopes into SHIP, EDIT, REBUILD, CLEAR, or ESCALATE. It does not call a model.',
  },
  {
    id: 'hyv-prepare-rebuild', cmd: 'prepare-rebuild',
    role: 'Rebuild preparer', phase: 'plan',
    description: 'Prepare a rebuild task only after an upstream REBUILD recommendation, a CopySpec, and a signed rebuild-authorization capability.',
    input: { required: ['draft path', 'profile path', 'reduction.json', 'copy-spec.json', 'task output path'], optional: ['writing-brief.json', '--recomposition-policy policy.json', 'capability stdin or file'] },
    output: { required: ['written rebuild task.json'], optional: [] },
    permissions: ['read_repository', 'write_repository'],
    handoff: ['hyv-apply-rebuild'],
    usage: 'hyv prepare-rebuild draft.md profile.json reduction.json copy-spec.json task.json [writing-brief.json] [--recomposition-policy policy.json] (--capability-stdin|--capability-file path)',
    body: 'Prepare a rebuild task only after an upstream REBUILD recommendation, a CopySpec, and a signed rebuild-authorization capability. Capability input requires host-guaranteed sensitive-input redaction. Callers cannot self-select rebuild.',
  },
  {
    id: 'hyv-rebuild-writer-request', cmd: 'rebuild-writer-request',
    role: 'Writer-request author', phase: 'plan',
    description: 'Create the writer-only payload for a prepared rebuild task.',
    input: { required: ['task.json', 'writer-request output path'], optional: [] },
    output: { required: ['written writer-request.json'], optional: [] },
    permissions: ['read_repository', 'write_repository'],
    handoff: ['hyv-apply-rebuild'],
    usage: 'hyv rebuild-writer-request task.json writer-request.json',
    body: 'Create the writer-only payload for a prepared rebuild. It excludes the source draft, capability, profile body, and validation evidence.',
  },
  {
    id: 'hyv-apply-rebuild', cmd: 'apply-rebuild',
    role: 'Rebuild applier', phase: 'edit',
    description: 'Validate and evaluate a whole-document rebuild response against a prepared authorized rebuild task.',
    input: { required: ['task.json', 'response.json', 'profile.json', 'capability stdin or file'], optional: [] },
    output: { required: ['applied rebuild candidate and gate report'], optional: [] },
    permissions: ['read_repository'],
    handoff: ['hyv-verify', 'hyv-lifecycle'],
    usage: 'hyv apply-rebuild task.json response.json profile.json (--capability-stdin|--capability-file path)',
    body: 'Validate and evaluate a whole-document rebuild response against a prepared authorized rebuild task. Capability input requires host-guaranteed sensitive-input redaction. It never calls a provider.',
  },
  {
    id: 'hyv-verify', cmd: 'verify',
    role: 'Verifier', phase: 'verify',
    description: 'Verify a revised candidate against an original draft and portable profile.',
    input: { required: ['original path', 'candidate path', 'profile path'], optional: ['writing-brief.json'] },
    output: { required: ['verification report'], optional: [] },
    permissions: ['read_repository'],
    handoff: ['hyv-lifecycle'],
    usage: 'hyv verify original.md candidate.md profile.json [writing-brief.json]',
    body: 'Verify a revised candidate against an original draft and portable profile without changing learning state. Verification is read-only; learning changes require an explicit learning command or a separately approved lifecycle transition.',
  },
  {
    id: 'hyv-verify-spec', cmd: 'verify-spec',
    role: 'CopySpec verifier', phase: 'verify',
    description: 'Verify a candidate against the existing voice gates and a local CopySpec.',
    input: { required: ['original path', 'candidate path', 'profile path', 'copy-spec.json'], optional: ['writing-brief.json'] },
    output: { required: ['verification report with CopySpec claim gate'], optional: [] },
    permissions: ['read_repository'],
    handoff: ['hyv-lifecycle'],
    usage: 'hyv verify-spec original.md candidate.md profile.json copy-spec.json [writing-brief.json]',
    body: 'Verify a candidate against the existing voice gates and a local CopySpec. Immutable claims remain verbatim unless atoms are supplied; then each declared atom must remain. Prohibited claims fail closed.',
  },
  {
    id: 'hyv-lifecycle', cmd: 'lifecycle',
    role: 'Lifecycle manager', phase: 'review',
    description: 'Advance and inspect the rewrite lifecycle: prepare-semantic, submit-verdict, inspect, validate-final-approval, finalize.',
    input: { required: ['a lifecycle subcommand and its arguments'], optional: ['capability stdin or file where required'] },
    output: { required: ['lifecycle artifact or decision result'], optional: [] },
    permissions: ['read_repository', 'write_repository'],
    handoff: ['hyv-learning'],
    usage: 'hyv lifecycle <prepare-semantic|submit-verdict|inspect|validate-final-approval|finalize> ...',
    body: 'Advance and inspect the rewrite lifecycle. prepare-semantic builds an initial immutable artifact; submit-verdict records one verdict; inspect reads an artifact without exposing source or candidate hashes; validate-final-approval checks a capability against the trust context; finalize records an approved or rejected decision. Artifacts are immutable and exact replay is idempotent.',
  },
  {
    id: 'hyv-learning', cmd: 'learning',
    role: 'Learning manager', phase: 'learn',
    description: 'Inspect or explicitly mutate text-free local learning state for a profile.',
    input: { required: ['an action and profile path, or record-approved lifecycle inputs'], optional: ['instruction, event id, or source/target as needed', '--mutation-id, --authority, --provenance, --weight, --compatibility', 'capability stdin or file for record-approved'] },
    output: { required: ['learning mutation receipt or composition'], optional: [] },
    permissions: ['read_repository', 'write_repository'],
    handoff: [],
    usage: 'hyv learning <show|inspect|add|record|record-approved|ratify|supersede|migrate|clear> profile.json [value] [options]',
    body: 'Inspect or explicitly mutate text-free local learning for a profile. show composes active preferences; inspect returns bounded event metadata; add/record write an explicit instruction with authority and provenance; ratify and supersede require Profile v3 plus an event id; migrate moves v2 history into v3; clear removes the identity state. Accepted-candidate learning requires a separately approved lifecycle transition.',
  },
  {
    id: 'hyv-patterns', cmd: 'patterns',
    role: 'Pattern catalog', phase: 'analyze',
    description: 'List the exact AI Editor rules that run.',
    input: { required: ['no arguments (run hyv patterns)'], optional: [] },
    output: { required: ['ruleset version and exact deterministic catalog'], optional: [] },
    permissions: ['read_repository'],
    handoff: [],
    usage: 'hyv patterns',
    body: 'List the exact AI Editor rules that run in this package: the ruleset version and the deterministic catalog with reconstructable regular-expression source, flags, and sentence or physical-line scope.',
  },
  {
    id: 'hyv-mcp', cmd: 'mcp',
    role: 'MCP server', phase: 'run',
    description: 'Start the local Hold Your Voice MCP server.',
    input: { required: ['no arguments (run hyv mcp)'], optional: [] },
    output: { required: ['running MCP server on stdio'], optional: [] },
    permissions: ['read_repository'],
    handoff: [],
    usage: 'hyv mcp',
    body: 'Start the local Hold Your Voice MCP server over stdio. The server registers the writing tools for MCP-capable hosts. It sends no drafts, samples, profiles, or telemetry to any service.',
  },
];

function openaiDisplayName(id) {
  return id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function writePackage(command) {
  const dir = join(SKILLS, command.id);
  mkdirSync(join(dir, 'agents'), { recursive: true });
  const descriptor = {
    schema_version: SCHEMA,
    id: command.id,
    title: command.id,
    description: command.description,
    instruction_file: 'SKILL.md',
    role: command.role,
    workflow_phase: command.phase,
    input: command.input,
    output: command.output,
    evidence_requirements: [
      'Report only the deterministic result the command returns; never invent a model or provider call that did not occur.',
    ],
    permissions: [...new Set(['execute_commands', ...command.permissions])],
    stop_conditions: [
      'Stop when required input is missing, when the command cannot run without changing existing behavior, or when a claimed capability is unavailable.',
    ],
    tool_free_mode: TOOL_FREE,
    handoff_to: command.handoff,
  };
  writeFileSync(join(dir, 'agent.json'), `${JSON.stringify(descriptor, null, 2)}\n`);
  const skill = `---
name: ${command.id}
description: ${command.description}
---

# ${command.id}

${command.body}

## Usage

\`\`\`text
${command.usage}
\`\`\`

## Behavior

- Deterministic and local-first: this command never calls a provider and never sends drafts, samples, profiles, or telemetry to a service.
- Commands that write use an explicit output path. Confirm that path before running the command.
- This agent describes how to invoke the command and what it returns. It does not change command behavior or exit codes.

## Handoff

Run \`hyv ${command.cmd}\` directly to execute the operation.${command.handoff.length ? ` Follow-on agents: ${command.handoff.join(', ')}.` : ''}
`;
  writeFileSync(join(dir, 'SKILL.md'), skill);
  const openai = `interface:
  display_name: "${openaiDisplayName(command.id)}"
  short_description: "${command.description}"
  default_prompt: "Use $${command.id} to ${command.description.toLowerCase()}"
`;
  writeFileSync(join(dir, 'agents', 'openai.yaml'), openai);
  return dir;
}

let count = 0;
for (const command of COMMANDS) {
  writePackage(command);
  count += 1;
}
console.log(`generated ${count} agent packages under ${SKILLS}`);
