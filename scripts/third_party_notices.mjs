// Gather notices from the locked runtime dependency tree before distributing the app.
import {readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const sections = [];
for (const [path, metadata] of Object.entries(lock.packages)) {
  if (!path || metadata.optional) continue;
  if (metadata.dev && !['node_modules/vite', 'node_modules/esbuild'].includes(path)) continue;
  const manifest = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'));
  const files = readdirSync(path, {withFileTypes:true})
    .filter(f => f.isFile() && /^(license|licence|copying|copyright|notice)(?:[.-]|$)/i.test(f.name))
    .map(f => join(path, f.name));
  if (manifest.name === 'saxes' && manifest.version === '6.0.0' && files.length === 0)
    files.push('assets/licenses/saxes-6.0.0.txt');
  if (manifest.name === 'lucide-react') files.push('assets/licenses/feather-MIT.txt');
  if (!files.length) throw new Error('Missing upstream notice for ' + manifest.name);
  sections.push([manifest.name + ' ' + manifest.version, metadata.license,
    ...files.map(f => readFileSync(f, 'utf8').trim())].join('\n\n'));
}
writeFileSync('assets/licenses/runtime-notices.txt', sections.join('\n\n----------------------------------------\n\n') + '\n');
