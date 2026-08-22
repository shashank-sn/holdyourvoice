import type { HostCapabilities, RuntimeDescriptor, AgentDescriptor } from './types.js';

const CATALOG: Record<string, HostCapabilities> = {
  generic: {
    id: 'generic', display_name: 'Generic coding environment', native_skills: false, subagents: false,
    hooks: false, blocking_approvals: false, file_edits: false, command_execution: false, browser_automation: false,
    background_tasks: false, cli: true, repository_read: false,
    context_capacity: 'host-defined', filesystem_mode: 'host-defined', network_policy: 'host-defined',
    subagent_isolation: false, session_reset: false, structured_output: false,
    integration: 'portable Markdown instructions and standalone CLI',
  },
  codex: {
    id: 'codex', display_name: 'Codex', native_skills: true, subagents: true,
    hooks: false, blocking_approvals: true, file_edits: true, command_execution: true, browser_automation: false,
    background_tasks: false, cli: true, repository_read: true,
    context_capacity: 'host-defined', filesystem_mode: 'sandboxed', network_policy: 'approval-gated',
    subagent_isolation: true, session_reset: true, structured_output: true,
    integration: 'native skills with AGENTS.md fallback',
  },
  'claude-code': {
    id: 'claude-code', display_name: 'Claude Code', native_skills: true, subagents: true,
    hooks: true, blocking_approvals: true, file_edits: true, command_execution: true, browser_automation: false,
    background_tasks: false, cli: true, repository_read: true,
    context_capacity: 'host-defined', filesystem_mode: 'host-defined', network_policy: 'approval-gated',
    subagent_isolation: true, session_reset: false, structured_output: true,
    integration: 'native skills and agent instructions',
  },
  cursor: {
    id: 'cursor', display_name: 'Cursor', native_skills: false, subagents: false,
    hooks: false, blocking_approvals: false, file_edits: true, command_execution: true, browser_automation: false,
    background_tasks: false, cli: true, repository_read: true,
    context_capacity: 'host-defined', filesystem_mode: 'workspace', network_policy: 'host-defined',
    subagent_isolation: false, session_reset: false, structured_output: false,
    integration: 'generated rules and portable instructions',
  },
  copilot: {
    id: 'copilot', display_name: 'GitHub Copilot', native_skills: false, subagents: false,
    hooks: false, blocking_approvals: false, file_edits: true, command_execution: false, browser_automation: false,
    background_tasks: false, cli: true, repository_read: true,
    context_capacity: 'host-defined', filesystem_mode: 'workspace', network_policy: 'host-defined',
    subagent_isolation: false, session_reset: false, structured_output: false,
    integration: 'repository instructions and custom agent definitions',
  },
  'gemini-cli': {
    id: 'gemini-cli', display_name: 'Gemini CLI', native_skills: false, subagents: false,
    hooks: false, blocking_approvals: true, file_edits: true, command_execution: true, browser_automation: false,
    background_tasks: true, cli: true, repository_read: true,
    context_capacity: 'host-defined', filesystem_mode: 'workspace', network_policy: 'approval-gated',
    subagent_isolation: false, session_reset: false, structured_output: true,
    integration: 'terminal-agent instructions and standalone CLI',
  },
  'ide-agent': {
    id: 'ide-agent', display_name: 'IDE coding agent', native_skills: false, subagents: false,
    hooks: false, blocking_approvals: false, file_edits: true, command_execution: false, browser_automation: false,
    background_tasks: false, cli: true, repository_read: true,
    context_capacity: 'host-defined', filesystem_mode: 'workspace', network_policy: 'host-defined',
    subagent_isolation: false, session_reset: false, structured_output: false,
    integration: 'generated rules or portable instructions',
  },
  windsurf: {
    id: 'windsurf', display_name: 'Windsurf', native_skills: false, subagents: false,
    hooks: false, blocking_approvals: false, file_edits: true, command_execution: true, browser_automation: false,
    background_tasks: false, cli: true, repository_read: true,
    context_capacity: 'host-defined', filesystem_mode: 'workspace', network_policy: 'host-defined',
    subagent_isolation: false, session_reset: false, structured_output: false,
    integration: 'generated workspace rules and standalone CLI',
  },
  cline: {
    id: 'cline', display_name: 'Cline', native_skills: false, subagents: false,
    hooks: false, blocking_approvals: false, file_edits: true, command_execution: true, browser_automation: false,
    background_tasks: false, cli: true, repository_read: true,
    context_capacity: 'host-defined', filesystem_mode: 'workspace', network_policy: 'host-defined',
    subagent_isolation: false, session_reset: false, structured_output: false,
    integration: 'generated workspace rules and standalone CLI',
  },
  'roo-code': {
    id: 'roo-code', display_name: 'Roo Code', native_skills: false, subagents: false,
    hooks: false, blocking_approvals: false, file_edits: true, command_execution: true, browser_automation: false,
    background_tasks: false, cli: true, repository_read: true,
    context_capacity: 'host-defined', filesystem_mode: 'workspace', network_policy: 'host-defined',
    subagent_isolation: false, session_reset: false, structured_output: false,
    integration: 'generated workspace rules and standalone CLI',
  },
};

export function resolveHost(id: string): HostCapabilities {
  return CATALOG[id] ?? CATALOG.generic!;
}

export function listHosts(): HostCapabilities[] {
  return Object.values(CATALOG).sort((a, b) => a.id.localeCompare(b.id));
}

function hostSupports(host: HostCapabilities, permission: string): boolean {
  switch (permission) {
    case 'read_repository': return host.repository_read;
    case 'write_repository': return host.file_edits;
    case 'execute_commands': return host.command_execution;
    case 'network': return false;
    case 'browser_automation': return host.browser_automation;
    case 'git_write':
    case 'pull_request_write': return host.command_execution;
    case 'subagents': return host.subagents;
    default: return false;
  }
}

export function runtime(agent: AgentDescriptor, hostID: string): RuntimeDescriptor {
  const host = resolveHost(hostID);
  const available: string[] = [];
  const unavailable: RuntimeDescriptor['unavailable_capabilities'] = [];
  for (const permission of agent.permissions) {
    if (hostSupports(host, permission)) available.push(permission);
    else unavailable.push({ capability: permission, status: 'NOT_AVAILABLE' });
  }
  let mode = 'procedural';
  if (unavailable.length > 0) mode = 'prompt-only';
  if (host.native_skills && unavailable.length === 0) mode = 'native';
  return { agent, host, available_capabilities: available, unavailable_capabilities: unavailable, execution_mode: mode };
}
