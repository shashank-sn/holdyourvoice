import { runtime } from './catalog.js';
import type { AgentPackage, RuntimeDescriptor } from './types.js';

export function describe(pkg: AgentPackage, hostID: string): RuntimeDescriptor {
  return runtime(pkg.descriptor, hostID);
}

export function emitJson(pkg: AgentPackage, hostID: string): string {
  return JSON.stringify(describe(pkg, hostID), null, 2);
}

function printable(values: string[]): string {
  return values.length === 0 ? 'none' : values.join(', ');
}

function printableUnavailable(values: RuntimeDescriptor['unavailable_capabilities']): string {
  return values.length === 0 ? 'none' : values.map(({ capability, status }) => `${capability} (${status})`).join(', ');
}

function runtimeSummary(descriptor: RuntimeDescriptor): string {
  const host = descriptor.host;
  return `Context capacity: ${host.context_capacity}; filesystem mode: ${host.filesystem_mode}; network policy: ${host.network_policy}; browser/UI: ${host.browser_automation}; subagent isolation: ${host.subagent_isolation}; session reset: ${host.session_reset}; structured output: ${host.structured_output}.`;
}

export function emitPrompt(pkg: AgentPackage, hostID: string): string {
  const descriptor = pkg.descriptor;
  const resolved = describe(pkg, hostID);
  const lines: string[] = [];
  lines.push(`# ${descriptor.title}`, '');
  lines.push(`Role: ${descriptor.role}`);
  lines.push(`Phase: ${descriptor.workflow_phase}`);
  lines.push(`Execution mode: ${resolved.execution_mode}`, '');
  lines.push('## Contract', '');
  lines.push(`Required input: ${printable(descriptor.input.required)}`);
  lines.push(`Required output: ${printable(descriptor.output.required)}`);
  lines.push(`Evidence: ${printable(descriptor.evidence_requirements)}`);
  lines.push(`Stop conditions: ${printable(descriptor.stop_conditions)}`, '');
  lines.push('## Runtime descriptor', '');
  lines.push(runtimeSummary(resolved), '');
  lines.push('## Capability boundary', '');
  lines.push(`Available: ${printable(resolved.available_capabilities)}`);
  lines.push(`Unavailable: ${printableUnavailable(resolved.unavailable_capabilities)}`, '');
  lines.push(`When a capability is unavailable, ${descriptor.tool_free_mode.behavior} Status must be one of: ${printable(descriptor.tool_free_mode.unavailable_statuses)}.`, '');
  lines.push('## Handoff', '');
  lines.push(`Next agents: ${printable(descriptor.handoff_to)}`, '');
  lines.push('## Instructions', '');
  lines.push(pkg.instructions.trim());
  return `${lines.join('\n')}\n`;
}
