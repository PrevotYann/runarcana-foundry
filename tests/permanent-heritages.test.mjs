import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {heritageEffects,heritageOptions,heritageEligibility} from '../src/heritage.mjs';
import {createApi} from '../src/api.mjs';
const rows=(await Promise.all((await fs.readdir('packs-src/release/heritages')).map(async f=>JSON.parse(await fs.readFile('packs-src/release/heritages/'+f,'utf8'))))).filter(d=>d.flags?.runarcana?.heritageRules);
const find=name=>rows.find(d=>d.name===name),rules=name=>find(name).flags.runarcana.heritageRules;

test('Amphibious Constitution grants minimum swim speed without replacing a faster speed',()=>{
  const r=rules('Amphibious Constitution'),changes=heritageEffects(r)[0].system.changes;
  assert.ok(changes.some(c=>c.key==='system.attributes.movement.speeds.swim'&&c.type==='upgrade'&&c.value==='35'));
  assert.ok(changes.some(c=>c.key==='system.attributes.movement.units'&&c.value==='ft'));
  const context={origin:'Half-Dragon',variant:'Ocean Elemental',region:'Noxus',pool:'origin',initial:true};
  assert.equal(heritageEligibility(r,context).valid,true);assert.equal(heritageEligibility(r,{...context,variant:'Infernal Elemental'}).valid,false);
});

test('Vastayan Blood grants Medicine advantage without inventing proficiency; Primal Fighter has four source choices',()=>{
  const changes=heritageEffects(rules('Vastayan Blood'))[0].system.changes;
  assert.deepEqual(changes.map(c=>[c.key,c.type,c.value]),[['system.skills.med.roll.mode','upgrade','1']]);
  const r=rules('Primal Fighter');
  for(const id of ['itm','ani','nat','sur']){
    assert.equal(heritageOptions(r,{skills:[id]}).valid,true);
    assert.ok(heritageEffects(r,{skills:{[id]:1},options:{skills:[id]}})[0].system.changes.some(c=>c.key===`system.skills.${id}.value`&&c.value==='2'));
  }
  assert.equal(heritageOptions(r,{skills:['arc']}).valid,false);assert.equal(heritageOptions(r,{skills:['itm','sur']}).valid,false);
});

test('Graciousness saving expertise uses a roll bonus while keeping native proficiency within its schema',()=>{
  const r=rules('Graciousness');
  for(const value of [0,1,2]){
    const changes=heritageEffects(r,{context:{saves:{cha:value}}})[0].system.changes;
    assert.ok(changes.some(c=>c.key==='system.abilities.cha.proficient'&&c.value==='1'&&c.type==='upgrade'));
    assert.equal(changes.some(c=>c.key==='system.abilities.cha.save.roll.bonus'&&c.value==='@prof'),value===1);
    assert.ok(changes.every(c=>c.key!=='system.abilities.cha.proficient'||Number(c.value)<=1));
  }
});

test('live saving proficiency conversion reads current class proficiency and rolls back failed grants',async()=>{
  globalThis.game={settings:{get:()=>true},user:{isGM:true,id:'gm'},users:{activeGM:{id:'gm'}},time:{worldTime:0},modules:new Map()};
  const d=find('Graciousness');globalThis.fromUuid=async()=>({...d,getFlag:(scope,k)=>d.flags?.[scope]?.[k],toObject:()=>structuredClone(d)});
  const flags={enabled:true,originSelection:{plan:{origin:'Human',region:'Noxus',heritagePoints:3,regionPoints:2}}};
  const actor={uuid:'Actor.save-test',isOwner:true,system:{details:{level:1},abilities:{cha:{value:14,proficient:1,save:{prof:{multiplier:1}}}},skills:{}},items:[],getFlag:(_,key)=>flags[key],update:async updates=>{for(const [k,v]of Object.entries(updates))flags[k.split('.').at(-1)]=v;},createEmbeddedDocuments:async(type,rows)=>{const made=rows.map((d,i)=>({...d,id:'item'+i}));actor.items.push(...made);return made;},deleteEmbeddedDocuments:async(type,ids)=>{actor.items=actor.items.filter(i=>!ids.includes(i.id));}};
  const api=createApi(),plan={pool:'origin',choices:[{uuid:d._id}]},persist=actor.update;actor.update=async()=>{throw Error('persist failed');};
  await assert.rejects(api.applyHeritages(actor,plan),/persist failed/);assert.equal(actor.items.length,0);actor.update=persist;
  await api.applyHeritages(actor,plan);assert.ok(actor.items[0].effects[0].system.changes.some(c=>c.key==='system.abilities.cha.save.roll.bonus'&&c.value==='@prof'));
  await api.applyHeritages(actor,plan,{overrideReason:'Repeat acquisition approved by GM'});
  assert.equal(actor.items.flatMap(i=>i.effects.flatMap(e=>e.system.changes)).filter(c=>c.key==='system.abilities.cha.save.roll.bonus').length,1);
  actor.items=[];flags.choices=null;actor.system.abilities.cha.proficient=0;actor.system.abilities.cha.save.prof.multiplier=0;
  await api.applyHeritages(actor,{pool:'origin',choices:[{uuid:d._id},{uuid:d._id}]},{overrideReason:'Repeat within one transaction'});
  assert.equal(actor.items.flatMap(i=>i.effects.flatMap(e=>e.system.changes)).filter(c=>c.key==='system.abilities.cha.save.roll.bonus').length,1);
});
