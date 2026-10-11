import fs from 'node:fs/promises';
import {textTemplate} from '../src/translation.mjs';
const index=JSON.parse(await fs.readFile('data/build-index.json','utf8'));
const manifest=JSON.parse(await fs.readFile('module.json','utf8'));
const profile=index.profile==='local'?'local':'release';
await fs.mkdir('translations/templates',{recursive:true});
await fs.mkdir('translations/english',{recursive:true});
for(const pack of manifest.packs) {
  const mapping={name:'name'};
  if(pack.type==='Item'){mapping.system={path:'system',converter:'runarcanaSystem'};mapping.effects={path:'effects',converter:'runarcanaNested'};}
  if(pack.type==='Actor'){mapping.system={path:'system',converter:'runarcanaSystem'};mapping.items={path:'items',converter:'runarcanaNested'};mapping.effects={path:'effects',converter:'runarcanaNested'};}
  if(pack.type==='JournalEntry')mapping.pages={path:'pages',converter:'runarcanaNested'};
  if(pack.type==='RollTable'){mapping.description='description';mapping.results={path:'results',converter:'runarcanaNested'};}
  const reference={label:pack.label,mapping,entries:{}};
  for(const record of index.documents.filter(x=>x.pack===pack.name)) {
    const doc=JSON.parse(await fs.readFile(`packs-src/${profile}/${pack.name}/${record.id}.json`,'utf8'));
    reference.entries[record.id]=textTemplate(doc);
  }
  await fs.writeFile(`translations/english/runarcana.${pack.name}.json`,JSON.stringify(reference,null,2)+'\n');
  // Templates are intentionally empty: English reference content is never mislabeled as French.
  await fs.writeFile(`translations/templates/runarcana.${pack.name}.json`,JSON.stringify({label:pack.label,mapping,entries:{}},null,2)+'\n');
}
await fs.writeFile('translations/english/index.json',JSON.stringify(index.documents,null,2)+'\n');
console.log(`Generated ${manifest.packs.length} Babele templates and English reference files.`);
