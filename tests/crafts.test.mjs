import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {CRAFTS,heritageTools,knownCrafts,craftFromName} from '../src/crafts.mjs';
import {heritageOptions,heritageEffects} from '../src/heritage.mjs';
import {createApi} from '../src/api.mjs';
const documents=(await Promise.all((await fs.readdir('packs-src/release/heritages')).map(async f=>JSON.parse(await fs.readFile('packs-src/release/heritages/'+f,'utf8'))))).filter(d=>d.flags?.runarcana?.heritageRules);
const source=name=>documents.find(d=>d.name===name),rules=name=>source(name).flags.runarcana.heritageRules;
const skill=id=>({kind:'skill',id}),craft=(id,specialty)=>({kind:'craft',id,...(specialty?{specialty}:{})});

test('source craft catalog preserves disciplines and their published check attributes',()=>{
  assert.equal(CRAFTS.length,41);assert.equal(new Set(CRAFTS.map(c=>c.id)).size,41);
  for(const [id,ability]of Object.entries({cook:'cha',weaponsmith:'str',alchemist:'wis','guide-cartographer':'int','guide-navigator':'wis','guide-pilot':'dex','collector-lumberjack':'str'}))assert.equal(CRAFTS.find(c=>c.id===id).ability,ability);
  assert.ok(CRAFTS.every(c=>c.sourceHash.length===64&&c.sourceUrl.startsWith('https://wiki.runarcana.org/en/characters/detailing/crafts/')));
});

test('Skilled requires three distinct new proficiencies and validates real craft disciplines and details',()=>{
  const r=rules('Skilled'),options={training:[skill('ath'),craft('cook'),craft('guide-pilot','Cart')]};
  assert.equal(heritageOptions(r,options).valid,true);
  assert.equal(heritageOptions(r,{training:options.training.slice(1)}).valid,false);
  for(const rows of [[skill('ath'),skill('ath'),craft('cook')],[skill('unknown'),craft('cook'),craft('weaponsmith')],[skill('ath'),craft('guide'),craft('cook')],[skill('ath'),craft('guide-pilot'),craft('cook')],[skill('ath'),craft('cook','invented'),craft('weaponsmith')]])assert.equal(heritageOptions(r,{training:rows}).valid,false);
  assert.equal(heritageOptions(r,options,{skills:{ath:1}}).valid,false);
  assert.equal(heritageOptions(r,options,{crafts:[{id:'cook'}]}).valid,false);
  assert.equal(heritageOptions(r,options,{skills:{ath:0.5}}).valid,true);
  const effects=heritageEffects(r,{options})[0].system.changes;assert.deepEqual(effects.map(c=>[c.key,c.value]),[['system.skills.ath.value','1']]);
  const tools=heritageTools(r,options,{choiceId:'skilled'});assert.equal(tools.length,2);assert.ok(tools.every(t=>t.system.proficient===0.5));assert.equal(tools[0].system.ability,'cha');assert.equal(tools[1].system.ability,'dex');
  assert.ok(tools.every(t=>Object.keys(t.system.activities)[0].length===16));
});

test('craft expertise doubles the half bonus and existing expertise receives the published extra one',()=>{
  const r=rules('Master Artisan'),options={training:[craft('cook')]};
  const tool=heritageTools(r,options)[0];assert.equal(tool.system.proficient,1);assert.equal(tool.system.bonus,'');
  assert.equal(heritageTools(r,options,{known:[{id:'cook',multiplier:0.5}]})[0].system.bonus,'');
  assert.equal(heritageTools(r,options,{known:[{id:'cook',multiplier:1}]})[0].system.bonus,'1');
  assert.equal(heritageOptions(r,{training:[skill('ath')]}).valid,false);
  assert.equal(heritageTools(rules('Hospitable'),{})[0].system.proficient,0.5);
  assert.equal(heritageOptions(rules('Cautious Traveler'),options).valid,false);
  assert.equal(heritageOptions(rules('Cautious Traveler'),{training:[craft('guide-navigator','Demacia trade routes')]}).valid,true);
  const known=knownCrafts([{name:'Guide: Navigator (Demacia trade routes)',type:'tool',system:{proficient:0.5}}]);assert.deepEqual(known,[{id:'guide-navigator',specialty:'Demacia trade routes',multiplier:0.5}]);
  assert.equal(craftFromName('Craft: Cook').craft.ability,'cha');assert.equal(craftFromName('Minor craft: Guide: Pilot: Cart').craft.ability,'dex');
  assert.equal(craftFromName('Unpublished craft'),null);
});

test('live heritage transactions grant skill and craft training together and roll back every created Item',async()=>{
  globalThis.game={settings:{get:()=>true},user:{isGM:true,id:'gm'},users:{activeGM:{id:'gm'}},time:{worldTime:0},modules:new Map()};
  globalThis.fromUuid=async uuid=>{const d=documents.find(d=>d._id===uuid);return d?{...d,getFlag:(scope,k)=>d.flags?.[scope]?.[k],toObject:()=>structuredClone(d)}:null;};
  const flags={enabled:true,originSelection:{plan:{origin:'Human',region:'Noxus',heritagePoints:3,regionPoints:2}}};let sequence=0;
  const actor={uuid:'Actor.craft-test',isOwner:true,system:{details:{level:1},abilities:{},skills:{}},items:[],getFlag:(_,key)=>flags[key],update:async updates=>{for(const [k,v]of Object.entries(updates))flags[k.split('.').at(-1)]=structuredClone(v);},createEmbeddedDocuments:async(type,rows)=>{const made=rows.map(d=>({...d,id:'item'+(++sequence)}));actor.items.push(...made);return made;},deleteEmbeddedDocuments:async(type,ids)=>{actor.items=actor.items.filter(i=>!ids.includes(i.id));}};
  const api=createApi(),choice=(name,training)=>({uuid:source(name)._id,options:{training}}),plan={pool:'origin',choices:[choice('Skilled',[skill('ath'),craft('cook'),craft('weaponsmith')]),choice('Master Artisan',[craft('cook')])]};
  const persist=actor.update;actor.update=async()=>{throw Error('save failed');};
  await assert.rejects(api.applyHeritages(actor,plan),/save failed/);assert.equal(actor.items.length,0);assert.equal(flags.choices,undefined);actor.update=persist;
  const result=await api.applyHeritages(actor,plan);assert.equal(result.spent,2);assert.equal(result.created,5);
  const tools=actor.items.filter(i=>i.type==='tool');assert.deepEqual(tools.map(t=>t.system.proficient),[0.5,0.5,1]);assert.equal(tools.at(-1).system.bonus,'');
  assert.deepEqual(flags.choices.choices[0].options.training,[skill('ath'),craft('cook'),craft('weaponsmith')]);
  await assert.rejects(api.applyHeritages(actor,plan),/Choices|DuplicateChoice/);
  const repeated={pool:'origin',choices:[choice('Skilled',[skill('arc'),craft('cook'),craft('alchemist')])]};assert.ok((await api.previewHeritages(actor,repeated)).mechanicalErrors.length);
});
