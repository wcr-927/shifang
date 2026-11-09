// Only the configured data files enter the build. A user-selected directory is never copied recursively.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve(process.env.SHIFANG_DATA_DIR || 'data/sample');
const names = ['rules/rhyme', 'rules/pingze', 'rules/metre', 'rules/reading_rules',
  'rules/rhyme_usage', 'rules/reading_explanations', 'ci/cilin', 'ci/forms'];
const files = names.map(name => {
  const path = join('src', name + '.json');
  const data = readFileSync(join(root, path));
  JSON.parse(data.toString());
  return {path, data};
});
for (const {path, data} of files) {
  mkdirSync(dirname(path), {recursive:true});
  writeFileSync(path, data);
}
const result = spawnSync(process.execPath, ['scripts/ci_metadata.mjs'], {stdio:'inherit'});
process.exitCode = result.status ?? 1;

const artwork = resolve(process.env.SHIFANG_ART_DIR || 'data/sample/assets');
const images = ['home/landscape.png', 'home/mist.png', 'publication/mountain.jpeg',
  'publication/bamboo.jpeg', 'publication/water.jpeg'];
const artFiles = images.map(name => ({name, data:readFileSync(join(artwork, name))}));
for (const {name, data} of artFiles) {
  const output = join('assets', name);
  mkdirSync(dirname(output), {recursive:true});
  writeFileSync(output, data);
}
