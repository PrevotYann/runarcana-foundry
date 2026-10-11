import fs from 'node:fs/promises';
import {ClassicLevel} from 'classic-level';
import assert from 'node:assert/strict';
import {folderErrors} from './pack-validation.mjs';
const manifest=JSON.parse(await fs.readFile('module.json','utf8'));
const index=JSON.parse(await fs.readFile('data/build-index.json','utf8'));
const profile=index.profile==='local'?'local':'release';
const uuids=new Set(index.documents.map(r=>`Compendium.runarcana.${r.pack}.${r.type}.${r.id}`));
const errors=[],warnings=[];let roots=0,embedded=0,links=0;
const ids=new Map();
for(const pack of manifest.packs) {
  const filenames=await fs.readdir(`packs-src/${profile}/${pack.name}`);
  const docs=await Promise.all(filenames.filter(n=>n.endsWith('.json')).map(async n=>JSON.parse(await fs.readFile(`packs-src/${profile}/${pack.name}/${n}`,'utf8'))));
  const folders=new Map(docs.filter(d=>d._key.startsWith('!folders!')).map(d=>[d._id,d]));
  const seen=new Set();
  const walk=(doc,key,root=false)=>{
    if(!/^[A-Za-z0-9]{16}$/.test(doc._id??''))errors.push(`Invalid ID: ${key}`);
    if(seen.has(key))errors.push(`Duplicate document key: ${key}`);seen.add(key);
    if(root)roots++;else embedded++;
    if(!doc.name && !key.includes('.results'))errors.push(`Empty name: ${key}`);
    for(const collection of ['pages','items','effects','results'])for(const child of doc[collection]??[]) {
      if(!child._key)errors.push(`Missing embedded compilation key: ${key}.${child._id}`);
      walk(child,child._key??key+'.'+child._id);
    }
    for(const [id,a]of Object.entries(doc.system?.activities??{})){
      if(id!==a._id)errors.push(`Activity key differs from ID: ${key}.${id}`);
      if(!['attack','save','damage','heal','utility','summon','check','cast','enchant','teleport','transform','forward','order'].includes(a.type))errors.push(`Invalid activity type ${a.type}`);
      if((a.consumption?.targets??[]).some(t=>t.type==='runarcanaResource')&&a.consumption.spellSlot!==false)errors.push(`Double spell consumption: ${key}`);
      for(const summon of a.profiles??[])if(summon.uuid&&!uuids.has(summon.uuid))errors.push(`Unresolved summon profile: ${summon.uuid}`);
    }
    if(root&&pack.type==='Item'&&!doc.system?.description?.value?.trim())errors.push(`Empty item description: ${key}`);
    if(root&&pack.type==='RollTable') {
      const die=/^d(\d+)$/.exec(doc.formula??'');
      const ranges=(doc.results??[]).flatMap(r=>Array.from({length:r.range[1]-r.range[0]+1},(_,i)=>r.range[0]+i)).sort((a,b)=>a-b);
      if(!die||ranges.length!==Number(die[1])||ranges.some((n,i)=>n!==i+1))errors.push(`Incomplete or overlapping source table ranges: ${key}`);
    }
    const string=JSON.stringify(doc);
    for(const match of string.matchAll(/@UUID\[([^\]]+)\]/g)){
      links++;
      if(match[1].startsWith('Compendium.runarcana.')&&!uuids.has(match[1]))errors.push(`Unresolved UUID: ${match[1]}`);
    }
    for(const adv of doc.system?.advancement??[])for(const grant of adv.configuration?.items??[])if(!uuids.has(grant.uuid))errors.push(`Unresolved advancement grant: ${grant.uuid}`);
    for(const adv of doc.system?.advancement??[])for(const choice of adv.configuration?.pool??[])if(!uuids.has(choice.uuid))errors.push(`Unresolved advancement choice: ${choice.uuid}`);
    for(const movement of [doc.system?.movement,doc.system?.attributes?.movement])if(movement) {
      if(['walk','fly','swim','climb','burrow'].some(k=>k in movement))errors.push(`Obsolete pre-6.0 movement schema: ${key}`);
    }
    for(const senses of [doc.system?.senses,doc.system?.attributes?.senses])if(senses) {
      if(['darkvision','blindsight','tremorsense','truesight'].some(k=>k in senses))errors.push(`Obsolete senses schema: ${key}`);
    }
    if(doc.system?.description?.value?.includes('<script'))errors.push(`Unsafe script in description: ${key}`);
  };
  for(const doc of docs) {
    if(doc.folder&&!folders.has(doc.folder))errors.push(`Missing folder ${doc.folder} in ${pack.name}`);
    if(doc._key.startsWith('!folders!')){
      errors.push(...folderErrors(doc,pack.type));
      let parent=doc;const chain=new Set();
      while(parent?.folder){if(chain.has(parent._id)){errors.push(`Folder cycle: ${pack.name}`);break;}chain.add(parent._id);parent=folders.get(parent.folder);}
      continue;
    }
    walk(doc,doc._key,true);
  }
  const db=new ClassicLevel(pack.path,{keyEncoding:'utf8',valueEncoding:'json',readOnly:true});await db.open();
  const binaryKeys=await db.keys().all();
  for await(const [key,doc] of db.iterator())if(key.startsWith('!folders!'))errors.push(...folderErrors(doc,pack.type));
  await db.close();
  const expected=seen.size+folders.size;
  if(binaryKeys.length!==expected)errors.push(`${pack.name}: binary has ${binaryKeys.length} keys; sources have ${expected}`);
  ids.set(pack.name,binaryKeys.length);
}
assert.equal(manifest.id,'runarcana');assert.equal(manifest.relationships.systems[0].id,'dnd5e');
if(manifest.compatibility.verified)errors.push('Manifest must not claim runtime verification.');
for(const path of [...manifest.esmodules,...manifest.styles,...manifest.languages.map(l=>l.path)])await fs.access(path);
const coverage=JSON.parse(await fs.readFile('sources/coverage.json','utf8'));
const catalog=JSON.parse(await fs.readFile('sources/catalog.json','utf8'));
const recorded=new Set(coverage.entries.map(e=>e.id));
for(const page of catalog.pages)if(!recorded.has(page.id))errors.push(`Page missing from coverage: ${page.id}`);
if(!coverage.discoveryComplete)warnings.push('Source discovery is incomplete due to unavailable or uncollected pages.');
if(!coverage.entryInventoryComplete)warnings.push('The entry inventory has not received an exhaustive editorial audit.');
warnings.push('Foundry V14 and Babele runtime tests have not been executed.');
const report={profile,indexedDocuments:roots,embeddedDocuments:embedded,uuidLinks:links,packKeys:Object.fromEntries(ids),errors,warnings,validation:'static-and-LevelDB-only',runtimeVerified:false};
await fs.writeFile('sources/validation.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(errors.length)process.exitCode=1;
