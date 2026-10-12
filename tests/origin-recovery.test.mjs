import test from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../src/api.mjs';
import {damageRecoveryFacts,originWeaknessTypes,regenerationAvailable} from '../src/origin-recovery.mjs';
import {weaknessRounds} from '../src/origin-weakness.mjs';
function setup(origin='Troll'){
  const flags={enabled:true,originSelection:{plan:{origin,selectedOptions:[],resistance:[],immunity:[]}},originLife:{blocked:0,turns:0,lastTime:0,processed:[]}};
  const effects=[];let n=0;
  const actor={uuid:'Actor.recovery',documentName:'Actor',isOwner:true,inCombat:false,statuses:new Set(),items:[],effects,system:{attributes:{hp:{value:5,max:20},prof:2,exhaustion:0},abilities:{con:{mod:3,proficient:0}},details:{level:3}},getFlag:(s,k)=>flags[k],async update(rows){for(const [path,v]of Object.entries(rows)){if(path==='system.attributes.hp.value')this.system.attributes.hp.value=v;else if(path.startsWith('flags.runarcana.'))flags[path.slice(16)]=structuredClone(v);}},async toggleStatusEffect(id,{active}){if(active)this.statuses.add(id);else this.statuses.delete(id);return {setFlag:async()=>{}};},async createEmbeddedDocuments(type,rows){const made=rows.map(raw=>({...structuredClone(raw),id:'effect'+(++n),getFlag(s,k){return this.flags[s]?.[k];},async update(rows){for(const [k,v]of Object.entries(rows)){if(k==='system.changes')this.system.changes=v;else this[k]=structuredClone(v);}}}));effects.push(...made);return made;},async rollSavingThrow(config,dialog){this.lastSave={config,dialog};return [{total:this.saveTotal??1}];}};
  globalThis.game={settings:{get:()=>true},user:{id:'gm',isGM:true},users:{activeGM:{id:'gm'}},time:{worldTime:0}};
  return {actor,flags,api:createApi()};
}

test('Troll recovery distinguishes HP wounds from temp-HP damage and permits a declared mixed-damage allocation',()=>{
  const facts=damageRecoveryFacts({origin:'Troll'},[{type:'fire',value:8},{type:'slashing',value:5}],{amount:13,hpBefore:20,hpAfter:15,hpMax:20});assert.equal(facts.blocked,5);
  const temp=damageRecoveryFacts({origin:'Troll'},[{type:'fire',value:8}],{amount:8,hpBefore:20,hpAfter:20,hpMax:20});assert.equal(temp.blocked,0);
  const allocation=damageRecoveryFacts({origin:'Troll'},[{type:'acid',value:8}],{amount:8,hpBefore:20,hpAfter:15,hpMax:20,unregenerableHP:2});assert.equal(allocation.blocked,2);
  assert.throws(()=>damageRecoveryFacts({origin:'Troll'},[],{hpBefore:20,hpAfter:15,unregenerableHP:6}),/Choices/);
  assert.equal(regenerationAvailable({value:5,max:20},8),7);
});

test('fire/acid wounds are recorded once, natural recovery cannot heal them, and treatment releases them',async()=>{
  const {actor,flags,api}=setup();const job={id:'damage1',actor:actor.uuid,blocked:10,treated:0};
  await api.processOriginDamage(actor,job);await api.processOriginDamage(actor,job);assert.equal(flags.originLife.blocked,10);
  game.time.worldTime=7200;const result=await api.advanceTrollRecovery(actor);assert.equal(result.healed,5);assert.equal(actor.system.attributes.hp.value,10);
  game.time.worldTime=10800;await api.advanceTrollRecovery(actor);assert.equal(actor.system.attributes.hp.value,10);
  await api.treatTrollWounds(actor,{treatment:'medical',confirmed:true});assert.equal(flags.originLife.blocked,0);
  game.time.worldTime=14400;await api.advanceTrollRecovery(actor);assert.equal(actor.system.attributes.hp.value,13);
});

test('combat recovery uses individual Troll turns and cannot be duplicated by the same turn event',async()=>{
  const {actor,api}=setup();actor.inCombat=true;
  for(let turn=1;turn<=7;turn++)await api.advanceTrollRecovery(actor,{turnKey:'c:'+turn,combatId:'c'});
  assert.equal(actor.system.attributes.hp.value,5);
  await api.advanceTrollRecovery(actor,{turnKey:'c:8',combatId:'c'});assert.equal(actor.system.attributes.hp.value,7);
  await api.advanceTrollRecovery(actor,{turnKey:'c:8',combatId:'c'});assert.equal(actor.system.attributes.hp.value,7);
});

test('zero-HP Trolls recover only on a due regenerable turn; dead creatures never regenerate',async()=>{
  const {actor,flags,api}=setup();actor.system.attributes.hp.value=0;actor.inCombat=true;flags.originLife.turns=7;flags.originLife.combatId='c';
  await api.advanceTrollRecovery(actor,{turnKey:'c:8',combatId:'c'});assert.equal(actor.system.attributes.hp.value,2);assert.ok(!actor.statuses.has('unconscious'));
  actor.system.attributes.hp.value=0;flags.originLife.turns=0;await api.advanceTrollRecovery(actor,{turnKey:'c:9',combatId:'c'});assert.ok(actor.statuses.has('unconscious'));
  actor.statuses.add('dead');flags.originLife.turns=7;await api.advanceTrollRecovery(actor,{turnKey:'c:16',combatId:'c'});assert.equal(actor.system.attributes.hp.value,0);
});

test('a full rest preserves untreated Troll wounds while magical treatment reduces the blocked amount',async()=>{
  const {actor,flags,api}=setup();flags.originLife.blocked=6;flags.rest={longCount:2};await api.rest(actor,'full');assert.equal(actor.system.attributes.hp.value,14);
  await api.processOriginDamage(actor,{id:'heal',actor:actor.uuid,blocked:0,treated:3});assert.equal(flags.originLife.blocked,3);
});

test('legacy Trolls establish a persistent recovery anchor rather than resetting it on every clock event',async()=>{
  const {actor,flags,api}=setup();delete flags.originLife;game.time.worldTime=100;
  await api.advanceTrollRecovery(actor);assert.equal(flags.originLife.lastTime,100);
  game.time.worldTime=3700;await api.advanceTrollRecovery(actor);assert.equal(actor.system.attributes.hp.value,8);
});

test('origin weaknesses select the actual element/material and do not treat unspecified material as a weakness',()=>{
  assert.ok(originWeaknessTypes({origin:'Antroplantae'}).includes('incinerating'));
  assert.ok(originWeaknessTypes({elementalDefense:['fire','incinerating','cold']}).includes('glacial'));
  const ordinary=damageRecoveryFacts({weaknesses:[{type:'fire'}]},[{type:'slashing',value:20}],{amount:20,hpBefore:20,hpAfter:0,hpMax:20});assert.equal(ordinary.weaknessDamage,0);
  assert.equal(weaknessRounds(3,3),6);assert.equal(weaknessRounds(10,6),0);
});

test('failed weakness saves apply only attack/check disadvantages and continuous damage refreshes the duration',async()=>{
  const {actor,flags,api}=setup('Antroplantae');const job={id:'weak1',actor:actor.uuid,blocked:0,treated:0,weaknessDamage:26,weaknessType:'fire'};
  await api.processOriginDamage(actor,job);assert.equal(actor.lastSave.config.target,13);assert.equal(actor.lastSave.dialog.configure,false);assert.equal(actor.effects.length,1);
  const effect=actor.effects[0];assert.equal(effect.duration.units,'rounds');assert.equal(effect.duration.value,7);assert.ok(effect.system.changes.every(c=>!c.key.includes('save')));
  const previous=actor.lastSave;game.time.worldTime=6;await api.processOriginDamage(actor,{...job,id:'weak2',continuous:true});assert.equal(actor.lastSave,previous);assert.equal(effect.start.time,6);assert.equal(actor.effects.length,1);
  assert.ok(flags.originLife.processed.includes('weak2'));
});
