import {assertGM,serialized} from './api.mjs';

export function canonicalJson(value) {
  if(Array.isArray(value))return `[${value.map(canonicalJson).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function comparable(data) {
  const copy=structuredClone(data);
  for(const key of ['_id','_key','_stats','folder','sort','ownership'])delete copy[key];
  if(copy.flags?.runarcana)delete copy.flags.runarcana.import;
  if(copy.flags?.core)delete copy.flags.core.sourceId;
  if(copy.flags?.core&&!Object.keys(copy.flags.core).length)delete copy.flags.core;
  return canonicalJson(copy);
}
export async function fingerprint(data) {
  const bytes=new TextEncoder().encode(comparable(data));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
function worldCollection(type) {return {Actor:game.actors,Item:game.items,JournalEntry:game.journal,RollTable:game.tables}[type];}
export async function previewImport(packNames, documentIds=null) {
  assertGM();const result=[];
  for(const name of packNames) {
    const pack=game.packs.get('runarcana.'+name);
    if(!pack)throw new Error('RUNARCANA.Error.Pack');
    const index=await pack.getIndex({fields:['flags.runarcana.canonicalId']});
    const existing=worldCollection(pack.documentName);
    for(const entry of index) {
      if(documentIds&&!documentIds.has(entry._id))continue;
      const uuid=`Compendium.${pack.collection}.${pack.documentName}.${entry._id}`;
      const matches=existing.filter(d=>d.getFlag('runarcana','import')?.uuid===uuid);
      let action='create';
      if(matches.length>1)action='duplicate-conflict';
      else if(matches.length===1) {
        const current=matches[0],baseline=current.getFlag('runarcana','import')?.baseline;
        action=baseline && (await fingerprint(current.toObject()))===baseline?'update':'local-conflict';
        if(action==='update') {
          const source=await pack.getDocument(entry._id);
          if(current.getFlag('runarcana','import')?.sourceFingerprint===await fingerprint(source.toObject()))action='unchanged';
        }
      }
      result.push({pack:name,id:entry._id,name:entry.name,uuid,type:pack.documentName,action,worldId:matches[0]?.id});
    }
  }
  return result;
}
export async function applyImport(preview) {
  assertGM();return serialized('runarcana:world-import',async()=>{
    const results=[];
    for(const row of preview) {
      if(!['create','update'].includes(row.action)){results.push({...row,status:'skipped'});continue;}
      // Recompute from live documents: the preview is not authority to overwrite later edits.
      const latest=(await previewImport([row.pack],new Set([row.id])))[0];
      if(!latest||latest.action!==row.action){results.push({...row,status:'changed-since-preview'});continue;}
      const pack=game.packs.get('runarcana.'+row.pack),source=await pack.getDocument(row.id);
      const sourceFingerprint=await fingerprint(source.toObject());
      const data=source.toObject();delete data._id;delete data._stats;
      data.folder=await worldFolder(pack,source.folder);
      data.flags??={};data.flags.runarcana??={};
      const Class=getDocumentClass(row.type);
      let target=latest.worldId?worldCollection(row.type).get(latest.worldId):null;
      if(target) {
        // Native imports translate compendium copies; updating every persisted field explicitly removes stale mechanics.
        const original=target.toObject();
        if(await fingerprint(original)!==target.getFlag('runarcana','import')?.baseline){results.push({...row,status:'local-conflict'});continue;}
        const update=structuredClone(data);delete update.folder;delete update.ownership;
        if(original.flags?.runarcana?.import)delete original.flags.runarcana.import.backup;
        data.flags.runarcana.import={uuid:row.uuid,baseline:null,sourceFingerprint,backup:original};
        update.flags=data.flags;
        await target.update(update,{diff:false,recursive:false});
      } else {
        data.flags.runarcana.import={uuid:row.uuid,baseline:null,sourceFingerprint};
        target=await Class.create(data);
      }
      const baseline=await fingerprint(target.toObject());
      await target.setFlag('runarcana','import',{...target.getFlag('runarcana','import'),baseline});
      results.push({...row,status:'imported',worldId:target.id});
    }
    return results;
  });
}
async function worldFolder(pack,sourceFolder) {
  const type=pack.documentName;
  let root=game.folders.find(f=>f.type===type&&f.getFlag('runarcana','folderKey')==='root');
  root??=await Folder.create({name:'Runarcana',type,flags:{runarcana:{folderKey:'root'}}});
  if(!sourceFolder)return root.id;
  const chain=[];let current=sourceFolder;
  while(current){chain.unshift(current);current=current.folder;}
  let parent=root;
  for(const f of chain) {
    const key=pack.collection+'.'+f.id;
    let target=game.folders.find(x=>x.type===type&&x.getFlag('runarcana','folderKey')===key);
    target??=await Folder.create({name:f.name,type,folder:parent.id,flags:{runarcana:{folderKey:key}}});
    parent=target;
  }
  return parent.id;
}
