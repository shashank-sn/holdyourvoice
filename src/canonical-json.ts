const MAX_DEPTH = 64;
const MAX_NODES = 10_000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function validUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

function serialize(value: unknown, depth: number, budget: { nodes: number }): string {
  budget.nodes += 1;
  if (depth > MAX_DEPTH || budget.nodes > MAX_NODES) throw new Error('Value is not valid canonical JSON: complexity limit exceeded.');
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') {
    if (!validUnicode(value)) throw new Error('Value is not valid canonical JSON: lone surrogate.');
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)) || Object.is(value, -0)) throw new Error('Value is not valid canonical JSON: unsafe number.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => serialize(item, depth + 1, budget)).join(',')}]`;
  if (isPlainObject(value)) {
    const entries = Object.keys(value).sort().map((key) => {
      if (!validUnicode(key)) throw new Error('Value is not valid canonical JSON: lone surrogate key.');
      return `${JSON.stringify(key)}:${serialize(value[key], depth + 1, budget)}`;
    });
    return `{${entries.join(',')}}`;
  }
  throw new Error('Value is not valid canonical JSON: unsupported value.');
}

export function canonicalJson(value: unknown): string { return serialize(value, 0, { nodes: 0 }); }

export function canonicalJsonBytes(value: unknown): Buffer {
  return Buffer.from(canonicalJson(value), 'utf8');
}

function hasDuplicateKeys(source: string): boolean {
  const stack: Array<Set<string> | null> = [];
  let index = 0;
  let expectingKey = false;
  while (index < source.length) {
    const char = source[index]!;
    if (char === '{') { stack.push(new Set()); expectingKey = true; index += 1; continue; }
    if (char === '[') { stack.push(null); expectingKey = false; index += 1; continue; }
    if (char === '}' || char === ']') { stack.pop(); expectingKey = false; index += 1; continue; }
    if (char === ',') { expectingKey = stack.at(-1) instanceof Set; index += 1; continue; }
    if (char === '"') {
      let end = index + 1;
      while (end < source.length) {
        if (source[end] === '\\') { end += 2; continue; }
        if (source[end] === '"') break;
        end += 1;
      }
      if (expectingKey && source[end + 1] === ':') {
        const key = JSON.parse(source.slice(index, end + 1)) as string;
        const keys = stack.at(-1) as Set<string>;
        if (keys.has(key)) return true;
        keys.add(key); expectingKey = false;
      }
      index = end + 1; continue;
    }
    index += 1;
  }
  return false;
}

export function parseCanonicalJson(bytes: Uint8Array): unknown {
  const source = Buffer.from(bytes).toString('utf8');
  if (!Buffer.from(source, 'utf8').equals(Buffer.from(bytes)) || source.includes('\ufffd')) throw new Error('Payload is not canonical JSON.');
  if (hasDuplicateKeys(source)) throw new Error('Payload contains a duplicate JSON key.');
  let value: unknown;
  try { value = JSON.parse(source); } catch { throw new Error('Payload is not canonical JSON.'); }
  if (canonicalJson(value) !== source) throw new Error('Payload is not canonical JSON.');
  return value;
}
