// Lightweight display metadata is generated, never a second hand-maintained rules source.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const formsText=readFileSync('src/ci/forms.json','utf8'), dictionaryText=readFileSync('src/ci/cilin.json','utf8');
const forms=JSON.parse(formsText),dictionary=JSON.parse(dictionaryText);
const metadata={formsSha256:createHash('sha256').update(formsText).digest('hex'),dictionarySha256:createHash('sha256').update(dictionaryText).digest('hex'),rhymeVersion:dictionary.version,forms:forms.map(({id,name,author,version})=>({id,name,author,version}))};
const expected=JSON.stringify(metadata,null,2)+'\n';
if(process.argv.includes('--check')) { if(readFileSync('src/ci/metadata.json','utf8')!==expected)throw Error('词谱元信息已漂移；运行 node scripts/ci_metadata.mjs 生成'); }
else writeFileSync('src/ci/metadata.json',expected);
