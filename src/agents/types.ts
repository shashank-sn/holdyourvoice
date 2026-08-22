export const AGENT_SCHEMA_VERSION = '1.0.0';

export const VALID_PERMISSIONS = new Set([
  'read_repository',
  'write_repository',
  'execute_commands',
  'network',
  'browser_automation',
  'git_write',
  'pull_request_write',
  'subagents',
]);

export const VALID_UNAVAILABLE_STATUSES = new Set([
  'NOT_AVAILABLE',
  'NOT_CONFIGURED',
  'NOT_RUN',
  'STALE',
  'ERROR',
]);

export type UnavailableStatus = 'NOT_AVAILABLE' | 'NOT_CONFIGURED' | 'NOT_RUN' | 'STALE' | 'ERROR';

export interface AgentIO {
  required: string[];
  optional: string[];
}

export interface ToolFreeMode {
  available: boolean;
  behavior: string;
  unavailable_statuses: string[];
}

export interface AgentDescriptor {
  schema_version: string;
  id: string;
  title: string;
  description: string;
  instruction_file: string;
  role: string;
  workflow_phase: string;
  input: AgentIO;
  output: AgentIO;
  evidence_requirements: string[];
  permissions: string[];
  stop_conditions: string[];
  tool_free_mode: ToolFreeMode;
  handoff_to: string[];
}

export interface AgentPackage {
  descriptor: AgentDescriptor;
  directory: string;
  instructions: string;
}

export interface HostCapabilities {
  id: string;
  display_name: string;
  native_skills: boolean;
  subagents: boolean;
  hooks: boolean;
  blocking_approvals: boolean;
  file_edits: boolean;
  command_execution: boolean;
  browser_automation: boolean;
  background_tasks: boolean;
  cli: boolean;
  repository_read: boolean;
  context_capacity: string;
  filesystem_mode: string;
  network_policy: string;
  subagent_isolation: boolean;
  session_reset: boolean;
  structured_output: boolean;
  integration: string;
}

export interface RuntimeDescriptor {
  agent: AgentDescriptor;
  host: HostCapabilities;
  available_capabilities: string[];
  unavailable_capabilities: Array<{ capability: string; status: UnavailableStatus }>;
  execution_mode: string;
}
