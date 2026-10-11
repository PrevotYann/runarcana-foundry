import test from 'node:test';
import assert from 'node:assert/strict';
import {comparable,fingerprint,previewImport} from '../src/importer.mjs';
import {serialized} from '../src/api.mjs';
test('import fingerprints ignore volatile fields and their own baseline',async()=>{
  const original={_id:'source',name:'Name',system:{description:{value:'Text'}},flags:{runarcana:{canonicalId:'/example/',import:{baseline:'one'}}}};
  const copy={...structuredClone(original),_id:'world',folder:'folder',_stats:{modifiedTime:123}};
  copy.flags.runarcana.import.baseline='two';
  assert.equal(await fingerprint(original),await fingerprint(copy));
  copy.system.description.value='Local edit';assert.notEqual(await fingerprint(original),await fingerprint(copy));
});
test('key ordering does not cause a false import conflict',()=>{
  assert.equal(comparable({name:'A',system:{a:1,b:2}}),comparable({system:{b:2,a:1},name:'A'}));
});

test('live import preview preserves local edits, detects duplicates and reads only a requested source',async()=>{
  const source={name:'Example',system:{description:{value:'English text'}}};
  const state={...structuredClone(source),flags:{runarcana:{import:{uuid:'Compendium.runarcana.features.Item.one'}}}};
  state.flags.runarcana.import.baseline=await fingerprint(state);
  state.flags.runarcana.import.sourceFingerprint=await fingerprint(source);
  const current={id:'world',toObject:()=>structuredClone(state),getFlag:()=>state.flags.runarcana.import};
  let reads=0;const pack={collection:'runarcana.features',documentName:'Item',getIndex:async()=>[{_id:'one',name:'Example'},{_id:'two',name:'Other'}],getDocument:async()=>{reads++;return {toObject:()=>source};}};
  globalThis.game={user:{id:'gm',isGM:true},users:{activeGM:{id:'gm'}},packs:new Map([['runarcana.features',pack]]),items:[current]};
  assert.equal((await previewImport(['features'],new Set(['one'])))[0].action,'unchanged');
  assert.equal(reads,1);
  state.system.description.value='Local edit';
  assert.equal((await previewImport(['features']))[0].action,'local-conflict');
  assert.equal(reads,1);
  game.items.push(current);
  assert.equal((await previewImport(['features']))[0].action,'duplicate-conflict');
});
test('primary-client mutations serialize and recover after a failed operation',async()=>{
  let count=0;await Promise.all(Array.from({length:20},()=>serialized('actor',async()=>{const before=count;await Promise.resolve();count=before+1;})));
  assert.equal(count,20);
  await assert.rejects(serialized('actor',async()=>{throw Error('failure');}));
  assert.equal(await serialized('actor',async()=>42),42);
});
