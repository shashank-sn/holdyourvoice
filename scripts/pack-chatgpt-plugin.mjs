import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import yazl from 'yazl';

const sourceDirectory = 'chatgpt-plugin';
const manifestPath = join(sourceDirectory, '.codex-plugin', 'plugin.json');
const outputPath = 'dist/hold-your-voice-chatgpt-plugin.zip';

if (!existsSync(manifestPath)) throw new Error(`Missing ${manifestPath}.`);

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.name !== 'hold-your-voice' || manifest.skills !== './skills/' || !manifest.description) {
  throw new Error('The ChatGPT plugin manifest is incomplete.');
}

function addDirectory(zip, directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    const stats = statSync(path);
    if (stats.isDirectory()) addDirectory(zip, path);
    else zip.addFile(path, relative(sourceDirectory, path));
  }
}

mkdirSync(dirname(outputPath), { recursive: true });
const zip = new yazl.ZipFile();
addDirectory(zip, sourceDirectory);
zip.end();

await new Promise((resolve, reject) => {
  const output = createWriteStream(outputPath);
  output.on('close', resolve);
  output.on('error', reject);
  zip.outputStream.on('error', reject).pipe(output);
});

console.log(`Created ${outputPath}.`);
