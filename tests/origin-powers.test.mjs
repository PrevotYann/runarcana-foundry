import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {originAction} from '../src/origin-actions.mjs';
import {originSpellGrant} from '../src/origin-spells.mjs';
import {originRollModifiers} from '../src/origin-checks.mjs';
import {originDuration} from '../src/origin-lifecycle.mjs';
import {createApi} from '../src/api.mjs';
const origins=(await Promise.all((await fs.readdir('packs-src/release/origins')).map(async f=>JSON.parse(await fs.readFile('packs-src/release/origins/'+f,'utf8'))))).filter(d=>d.type==='race');
const profile=n=>origins.find(o=>o.name===n).flags.runarcana.creation;
const variant=(n,v)=>profile(n).variants.find(x=>x.name===v);
const document=raw=>({...raw,getFlag(s,k){return this.flags[s]?.[k];},toObject(){const {getFlag,toObject,...data}=this;return structuredClone(data);}});

test('reviewed origin powers have their published native save/heal data, counters and V14 effect durations',()=>{
  const sonar=originAction(variant('Vastaya','Marai').actions.find(a=>a.name==='Sonar'),{spent:2});
  const save=Object.values(sonar.system.activities)[0];assert.equal(save.save.dc.formula,'8 + @prof + @abilities.con.mod');assert.equal(save.damage.parts[0].custom.formula,'1d4 + @prof + @abilities.con.mod');assert.equal(save.damage.onSave,'none');assert.equal(save.target.template.size,'15');assert.equal(sonar.flags.runarcana.originRecovery,'full');assert.equal(sonar.system.uses.spent,2);
  const rescue=originAction(variant('Vastaya','Ottrani').actions.find(a=>a.name==='Rescue'));
  assert.equal(rescue.system.uses.max,'max(0, floor(@abilities.wis.mod / 2))');assert.equal(Object.values(rescue.system.activities)[0].healing.custom.formula,'max(0, @prof + floor(@abilities.wis.mod / 2))');
  const geo=originAction(variant('Construct','Envoy').actions.find(a=>a.name==='Geolocation'));
  assert.deepEqual(geo.effects[0].duration,{value:0,units:'rounds',expiry:'sourceTurnEnd'});assert.equal(geo.effects[0].system.changes[0].value,'60');assert.equal(geo.system.uses.max,'@prof');
  const roar=originAction(variant('Minotaur','Aurochs').actions.find(a=>a.name==='Triumphant Roar'));
  assert.equal(roar.system.uses.max,'max(1, @abilities.con.mod)');assert.deepEqual(roar.effects[0].system.rider.statuses,['frightened']);assert.deepEqual(roar.effects[0].duration,{value:60,units:'seconds',expiry:null});
});

test('botanical spell grants resolve to collected native spells, preserve used charges and advance at source levels',async()=>{
  const options=variant('Antroplantae','Arboreal').choices.find(c=>c.id==='botany').options;
  for(const name of ['Elm','Cedar','Willow','Yew tree']){
    const option=options.find(o=>o.name===name);assert.ok(option);
    for(const definition of option.spellGrants){const id=definition.uuid.split('.').at(-1);const source=document(JSON.parse(await fs.readFile('packs-src/release/spells/'+id+'.json','utf8')));
      const item=originSpellGrant(source,definition,{level:7,spent:1});assert.equal(item.system.method,'innate');assert.equal(item.flags.runarcana.originManaged,true);assert.ok(Object.values(item.system.activities).every(a=>!a.consumption.targets.some(t=>t.type==='runarcanaResource')));
      if(definition.max)assert.equal(item.system.uses.spent,1);
      if(name==='Cedar'){assert.equal(item.system.level,4);const burst=item.system.activities.rcSaplingBurst01;assert.equal(burst.damage.parts[0].number,6);assert.equal(burst.target.template.size,'10');const early=originSpellGrant(source,definition,{level:1});assert.equal(early.system.level,1);assert.equal(early.system.activities.rcSaplingBurst01.damage.parts[0].number,2);assert.equal(early.system.activities.rcSaplingBurst01.target.template.size,'5');}
      if(name==='Willow')assert.equal(item.system.level,4);
    }
  }
});

test('Vesani Arcane Shot uses the selected casting ability, first-target line, no mana and level-11 runic damage',async()=>{
  const definition=variant('Vastaya','Vesani').spellGrants[0],source=document(JSON.parse(await fs.readFile('packs-src/release/spells/'+definition.uuid.split('.').at(-1)+'.json','utf8')));
  const spell=originSpellGrant(source,definition,{castingAbility:'wis',level:11});assert.equal(spell.system.ability,'wis');
  const activity=Object.values(spell.system.activities)[0];assert.equal(activity.save.dc.calculation,'spellcasting');assert.equal(activity.target.affects.count,'1');assert.equal(activity.target.template.width,'5');assert.deepEqual(activity.damage.parts[0].types,['runic']);assert.deepEqual(activity.consumption.targets,[]);
  assert.throws(()=>originSpellGrant(source,definition,{castingAbility:'int'}),/Choices/);
});

test('situational modifiers do not leak into ordinary rolls and preserve competing climate modifiers',()=>{
  assert.equal(originRollModifiers({origin:'Chireans',variant:'Nocti'},'save','dex',{circumstance:'brightLight'}).disadvantage,true);
  assert.equal(originRollModifiers({origin:'Chireans',variant:'Nocti'},'save','dex').disadvantage,false);
  const climate=originRollModifiers({origin:'Construct',variant:'Envoy'},'save','con',{circumstance:'extremeCold'});assert.ok(climate.advantage&&climate.disadvantage);
  assert.equal(originRollModifiers({origin:'Construct',variant:'Envoy'},'save','con',{circumstance:'extremeCold',properEquipment:true}).disadvantage,false);
  assert.equal(originRollModifiers({origin:'Construct'},'save','con',{circumstance:'poisonFormula',proficiency:3,poisonLevel:2,alreadyAdvantage:true}).bonus,1);
  assert.equal(originRollModifiers({origin:'Troll',variant:'Sand Troll'},'save','con',{circumstance:'extremeHeat'}).immune,true);
  assert.equal(originRollModifiers({origin:'Vastaya',variant:'Kiilash'},'skill','prc',{circumstance:'hearing'}).advantage,true);
  assert.equal(originRollModifiers({origin:'Vastaya',variant:'Kiilash'},'skill','prc',{circumstance:'sight'}).advantage,false);
});

test('three-turn acceleration and its two-turn followup use the correct source-turn expiration',()=>{
  const actor={uuid:'Actor.a'};globalThis.game={combat:{id:'c',turn:1,turns:[{id:'other'},{id:'self'},{id:'other2'}],getCombatantsByActor:()=>[{id:'self'}]}};
  assert.deepEqual(originDuration({rounds:3},actor),{value:2,units:'rounds',expiry:'sourceTurnEnd'});
  game.combat.turn=2;assert.deepEqual(originDuration({rounds:2},actor),{value:2,units:'rounds',expiry:'sourceTurnEnd'});
  assert.deepEqual(originDuration({turns:1},actor),{value:0,units:'rounds',expiry:'sourceTurnEnd'});
  game.combat=null;assert.deepEqual(originDuration({rounds:3},actor),{value:18,units:'seconds',expiry:null});
});

test('Construct full rest does not silently heal; six-hour repair and explicitly confirmed repair do',async()=>{
  globalThis.game={settings:{get:()=>true},user:{id:'gm',isGM:true},users:{activeGM:{id:'gm'}},time:{worldTime:1000}};
  const flags={enabled:true,originSelection:{plan:{origin:'Construct'}},rest:{longCount:2}};
  const actor={uuid:'Actor.construct',isOwner:true,statuses:new Set(),items:[],system:{attributes:{hp:{value:3,max:30},exhaustion:1},abilities:{con:{mod:2}}},getFlag:(s,k)=>flags[k],async update(rows){for(const [path,v]of Object.entries(rows)){if(path==='system.attributes.hp.value')this.system.attributes.hp.value=v;else if(path.startsWith('flags.runarcana.'))flags[path.slice(16)]=v;}},async updateEmbeddedDocuments(){}};
  const api=createApi();await api.rest(actor,'full');assert.equal(actor.system.attributes.hp.value,3);
  await assert.rejects(api.repairConstruct(actor,{hours:5,confirmed:true}),/RepairRequirements/);
  await api.repairConstruct(actor,{hours:6,confirmed:true});assert.equal(actor.system.attributes.hp.value,30);
});
