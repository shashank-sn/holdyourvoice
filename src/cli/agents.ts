import { writeFileSync } from 'node:fs';
import { loadAll, validateAll, validateId, sortedIds, describe, emitJson, emitPrompt } from '../agents/index.js';
import { json } from './io.js';

function agentFlags(args: string[]): { values: string[]; host: string; mode?: 'prompt' | 'json'; output?: string } {
  const values: string[] = [];
  let host = 'generic';
  let mode: 'prompt' | 'json' | undefined;
  let output: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const separator = argument.indexOf('=');
    const name = separator < 0 ? argument : argument.slice(0, separator);
    if (name !== '--host' && name !== '--mode' && name !== '--output') {
      values.push(argument);
      continue;
    }
    const inline = separator >= 0;
    const value = inline ? argument.slice(separator + 1) : args[++index];
    if (name === '--mode') {
      if (value !== 'prompt' && value !== 'json') throw new Error('Usage: hyv agent --mode prompt|json requires a mode.');
      mode = value;
    } else {
      if (!value || (!inline && value.startsWith('--'))) {
        throw new Error(name === '--host' ? 'Usage: hyv agent --host HOST requires a value.' : 'Usage: hyv agent --output FILE requires a value.');
      }
      if (name === '--host') host = value;
      else output = value;
    }
  }
  return { values, host, mode, output };
}

export function runAgent(args: string[]): number {
  const [subcommand, ...subargs] = args;
  if (subcommand === 'list') {
    if (subargs.length) throw new Error('Usage: hyv agent list');
    const packages = loadAll();
    const ids = sortedIds(packages);
    json(ids.map((id) => {
      const descriptor = packages.get(id)!.descriptor;
      return { id, role: descriptor.role, workflow_phase: descriptor.workflow_phase, description: descriptor.description };
    }));
    return 0;
  }
  if (subcommand === 'validate') {
    if (subargs.length > 1) throw new Error('Usage: hyv agent validate [id]');
    const packages = loadAll();
    const id = subargs[0];
    if (id !== undefined) validateId(packages, id);
    validateAll(packages);
    json({ schema_version: '1.0.0', status: 'PASS', agent: id ?? 'all' });
    return 0;
  }
  if (subcommand === 'describe') {
    const { values, host, mode, output } = agentFlags(subargs);
    if (values.length !== 1 || mode !== undefined || output !== undefined) throw new Error('Usage: hyv agent describe <id> [--host HOST]');
    const packages = loadAll();
    validateId(packages, values[0]!);
    json(describe(packages.get(values[0]!)!, host));
    return 0;
  }
  if (subcommand === 'emit') {
    const { values, host, mode, output } = agentFlags(subargs);
    if (values.length !== 1) throw new Error('Usage: hyv agent emit <id> --mode prompt|json [--host HOST] [--output FILE]');
    if (!mode) throw new Error('Usage: hyv agent emit <id> --mode prompt|json [--host HOST] [--output FILE]');
    const packages = loadAll();
    validateId(packages, values[0]!);
    const pkg = packages.get(values[0]!)!;
    const body = mode === 'prompt' ? emitPrompt(pkg, host) : `${emitJson(pkg, host)}\n`;
    if (output !== undefined) {
      writeFileSync(output, body, { encoding: 'utf8', flag: 'wx' });
    } else {
      process.stdout.write(body);
    }
    return 0;
  }
  throw new Error('Usage: hyv agent <list|validate|describe|emit> ...');
}
