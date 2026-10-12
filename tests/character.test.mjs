import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {characterPlan,originEffects,ABILITIES,REGIONS,validateAbilityGeneration} from '../src/character.mjs';
import {createApi} from '../src/api.mjs';

const docs=(await Promise.all((await fs.readdir('packs-src/release/origins')).map(async f=>JSON.parse(await fs.readFile('packs-src/release/origins/'+f,'utf8'))))).filter(d=>d.type==='race');
const profiles=Object.fromEntries(docs.map(d=>[d.name,d.flags.runarcana.creation]));
function selection(origin,variant) {
  const p=profiles[origin],v=p.variants.find(v=>v.name===variant),region=v?.region??p.region??'Ionia';
  const choices={};for(const c of [...p.choices,...(v?.choices??[])])choices[c.id]=c.type==='option'?c.optional?'':c.options[0].id:c.type==='languages'?['Demacian']:c.type==='craft'?'Smithing':c.type==='proficiency'?'skill:ath':c.options[0];
  return {abilities:Object.fromEntries(ABILITIES.map(k=>[k,10])),plusTwo:'str',plusOne:'con',variant:v?.id??'',size:(v?.sizes??p.sizes)[0],region,regionLanguage:REGIONS[region][0],choices,armorMode:'light',runebornPower:'controlled',traits:[]};
}

test('all ten origins and all 29 named lineages have valid, source-backed creation choices',()=>{
  assert.equal(docs.length,10);assert.equal(docs.reduce((n,d)=>n+d.flags.runarcana.creation.variants.length,0),29);
  for(const d of docs)for(const variant of d.flags.runarcana.creation.variants.length?d.flags.runarcana.creation.variants:[null]){
    const p=characterPlan(profiles[d.name],selection(d.name,variant?.name));assert.equal(p.abilities.str,12);assert.equal(p.abilities.con,11);
    for(const effect of originEffects(p)) {assert.equal(effect.type,'base');assert.ok(effect.system.changes.every(c=>c._id.length===16&&c.type&&c.phase&&typeof c.value==='string'));assert.equal(effect.changes,undefined);}
  }
});
test('origin validation rejects duplicate boosts, foreign variants, missing mandatory choices and overflow',()=>{
  const p=profiles.Human,s=selection('Human');
  assert.throws(()=>characterPlan(p,{...s,plusOne:'str'}),/Choices/);
  assert.throws(()=>characterPlan(p,{...s,variant:'arboreal'}),/Choices/);
  assert.throws(()=>characterPlan(p,{...s,choices:{}}),/Choices/);
  assert.throws(()=>characterPlan(p,{...s,abilities:{...s.abilities,str:30}}),/Choices/);
  assert.throws(()=>characterPlan(profiles.Antroplantae,{...selection('Antroplantae','Floral'),choices:{botany:''}}),/Choices/);
});
test('published ability methods enforce the 27-point table, fixed array and rolled score allocation',()=>{
  assert.deepEqual(validateAbilityGeneration({str:15,dex:15,con:15,int:8,wis:8,cha:8},'pointBuy'),{method:'pointBuy',spent:27,remaining:0});
  assert.throws(()=>validateAbilityGeneration({str:15,dex:15,con:15,int:9,wis:8,cha:8},'pointBuy'),/Budget/);
  assert.throws(()=>validateAbilityGeneration({str:16,dex:10,con:10,int:10,wis:10,cha:10},'pointBuy'),/Choices/);
  validateAbilityGeneration({str:15,dex:14,con:13,int:12,wis:10,cha:8},'standard');
  assert.throws(()=>validateAbilityGeneration({str:15,dex:14,con:13,int:12,wis:10,cha:10},'standard'),/Choices/);
  validateAbilityGeneration({str:14,dex:14,con:13,int:12,wis:11,cha:10},'rolling',[10,11,12,13,14,14]);
  assert.throws(()=>validateAbilityGeneration({str:18,dex:14,con:13,int:12,wis:11,cha:10},'rolling',[10,11,12,13,14,14]),/Choices/);
});
test('published variant stats: Marai swim, Ottrani climb, Nocti darkvision and expertise, Faeric flight',()=>{
  const plan=(o,v,context)=>characterPlan(profiles[o],selection(o,v),context);
  assert.deepEqual(plan('Vastaya','Marai').movement,{walk:25,swim:50});
  assert.equal(plan('Vastaya','Ottrani').movement.climb,20);
  assert.equal(plan('Chireans','Nocti').senses.darkvision,120);
  assert.equal(plan('Chireans','Nocti',{knownSkills:{acr:1}}).skills.acr,2);
  assert.equal(plan('Chireans','Nocti').skills.tec,1);
  assert.equal(plan('Yordle','Faeric').movement.fly,30);
  assert.deepEqual(plan('Troll','Jungle Troll').immunity,['poison']);
  assert.equal(plan('Minotaur','Aelus').initiativeAdvantage,true);
  const dragon=plan('Half-Dragon','Glacial Elemental');
  assert.ok(!originEffects(dragon,{level:14})[0].system.changes.some(c=>c.value==='glacial'));
  assert.ok(originEffects(dragon,{level:15})[0].system.changes.some(c=>c.key==='system.traits.dr.value'&&c.value==='glacial'));
});
test('construct resistance choices and armor prerequisites are enforced',()=>{
  const p=profiles.Construct,s=selection('Construct','Brutal');
  assert.throws(()=>characterPlan(p,{...s,armorMode:'heavy'}),/Prerequisite/);
  assert.equal(characterPlan(p,{...s,armorMode:'heavy',armorProficiencies:['heavy']}).ac,'19');
  assert.throws(()=>characterPlan(p,{...selection('Construct','Nimble'),armorMode:'heavy',armorProficiencies:['heavy']}),/Choices/);
  assert.throws(()=>characterPlan(p,{...s,choices:{resistance:'slashing'}}),/Choices/);
});
test('minotaur extra HP accumulates the published per-level bonus: level 1 = 1, level 10 = 12',()=>{
  const p=characterPlan(profiles.Minotaur,selection('Minotaur','Aelus'));
  const bonus=level=>Function('min','max','return '+p.hpOverall.replaceAll('@details.level',String(level)))(Math.min,Math.max);
  assert.equal(bonus(1),1);assert.equal(bonus(10),12);assert.equal(bonus(20),36);
});
test('all nine classes have their published hit die and a native HP advancement',async()=>{
  const expected={Acolyte:'d8',Arcanist:'d6',Bodhisattva:'d10',Brute:'d12',Combatant:'d10',Hunter:'d10',Marksman:'d8',Mercurial:'d8',Shaman:'d8'};
  for(const f of await fs.readdir('packs-src/release/classes')){const d=JSON.parse(await fs.readFile('packs-src/release/classes/'+f,'utf8'));if(d.type!=='class')continue;assert.equal(d.system.hd.denomination,expected[d.name]);assert.equal(d.system.advancement.filter(a=>a.type==='HitPoints').length,1);delete expected[d.name];}
  assert.deepEqual(expected,{});
});
test('Runeborn budgets, conversion, repeat limits and prerequisites constrain real trait selections',()=>{
  const p=profiles.Runeborn,s=selection('Runeborn'),row=(name,value)=>({id:p.runeborn.find(t=>t.name===name).id,value});
  assert.throws(()=>characterPlan(p,{...s,traits:[row('Spider Climbing')]}),/Prerequisite/);
  assert.throws(()=>characterPlan(p,{...s,traits:[row('Night Vision'),row('Night Vision'),row('Night Vision'),row('Night Vision')]}),/Budget/);
  const valid=characterPlan(p,{...s,conversions:{major:1},traits:[row('Night Vision'),row('Night Vision'),row('Night Vision'),row('Night Vision')]});
  assert.equal(valid.senses.darkvision,120);assert.equal(valid.runebornBudget.remaining,1);
  assert.throws(()=>characterPlan(p,{...s,conversions:{major:1},traits:Array.from({length:5},()=>row('Night Vision'))}),/Choices/);
  assert.throws(()=>characterPlan(p,{...s,traits:[row('Amphibian'),row('Amphibian')]}),/Choices/);
  assert.equal(characterPlan(p,{...s,traits:[row('Winged'),row('Winged')]}).movement.fly,30);
});

function mockActor() {
  let n=0;const data={system:{abilities:Object.fromEntries(ABILITIES.map(k=>[k,{value:10}])),skills:{},attributes:{ac:{formulas:[]}}},flags:{runarcana:{enabled:true}}};
  const items=[];items.get=id=>items.find(i=>i.id===id);
  const doc=d=>({...d,id:d._id,getFlag(scope,k){return this.flags?.[scope]?.[k];},toObject(){const copy={...this};delete copy.id;delete copy.getFlag;delete copy.toObject;return structuredClone(copy);}});
  data.system.details={level:1};
  const actor={uuid:'Actor.pc',isOwner:true,items,_source:data,system:data.system,getFlag(scope,k){return data.flags[scope]?.[k];},async update(updates){for(const [path,v]of Object.entries(updates)){const parts=path.split('.');let object=data;for(const k of parts.slice(0,-1))object=object[k]??={};object[parts.at(-1)]=structuredClone(v);}},async createEmbeddedDocuments(type,rows){const made=rows.map(d=>doc({...structuredClone(d),_id:d._id??'item'+(++n)}));if(made.some(d=>d.type==='race')&&items.some(d=>d.type==='race'))throw Error('singleton');items.push(...made);return made;},async deleteEmbeddedDocuments(type,ids){for(const id of ids){const i=items.findIndex(d=>d.id===id);if(i>=0)items.splice(i,1);}}};return actor;
}
test('origin customization is idempotent, preserves later score gains and rolls back failed replacement',async()=>{
  globalThis.game={settings:{get:()=>true},user:{id:'gm',isGM:true},users:{activeGM:{id:'gm'}},modules:new Map()};
  const human=structuredClone(docs.find(d=>d.name==='Human'));human.system.advancement=[];
  globalThis.fromUuid=async()=>({...human,getFlag(scope,k){return this.flags[scope][k];},toObject(){return structuredClone(human);}});
  const actor=mockActor(),api=createApi(),s={...selection('Human'),originUuid:'human'};
  await api.customizeOrigin(actor,s);assert.equal(actor._source.system.abilities.str.value,12);const length=actor.items.length;
  await api.customizeOrigin(actor,s);assert.equal(actor.items.length,length);assert.equal(actor._source.system.abilities.str.value,12);
  actor._source.system.abilities.str.value+=1;
  await api.customizeOrigin(actor,{...s,plusTwo:'dex'});assert.equal(actor._source.system.abilities.str.value,11);assert.equal(actor._source.system.abilities.dex.value,12);
  const before=actor.items.map(i=>i.toObject()),selectionBefore=structuredClone(actor.getFlag('runarcana','originSelection'));const update=actor.update;let fail=true;
  actor.update=async u=>{if(fail){fail=false;throw Error('update failed');}return update(u);};
  await assert.rejects(api.customizeOrigin(actor,s),/update failed/);
  assert.deepEqual(actor.items.map(i=>i.toObject()),before);assert.deepEqual(actor.getFlag('runarcana','originSelection'),selectionBefore);assert.equal(actor._source.system.abilities.dex.value,12);
});
