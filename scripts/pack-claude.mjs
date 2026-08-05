import { createWriteStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import yazl from 'yazl';

const manifestPath = 'mcpb/manifest.json';
const serverPath = 'mcpb/server/index.js';
const outputPath = 'dist/hold-your-voice.mcpb';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const packageManifest = JSON.parse(readFileSync('package.json', 'utf8'));

if (manifest.manifest_version !== '0.4' || manifest.version !== packageManifest.version) throw new Error('MCPB manifest version must be 0.4 and match package.json.');
if (manifest.name !== 'hold-your-voice' || manifest.server?.type !== 'node' || manifest.server?.entry_point !== 'server/index.js' || manifest.server?.mcp_config?.command !== 'node' || manifest.server?.mcp_config?.args?.[0] !== '${__dirname}/server/index.js') {
  throw new Error('MCPB manifest must define the local Node server entry point.');
}
if (!existsSync(serverPath)) throw new Error('Build the Claude extension before packing it.');

mkdirSync(dirname(outputPath), { recursive: true });
const zip = new yazl.ZipFile();
zip.addFile(manifestPath, 'manifest.json');
zip.addFile(serverPath, 'server/index.js');
zip.end();

await new Promise((resolve, reject) => {
  const output = createWriteStream(outputPath);
  output.on('close', resolve);
  output.on('error', reject);
  zip.outputStream.on('error', reject).pipe(output);
});

console.log(`Created ${outputPath}.`);
