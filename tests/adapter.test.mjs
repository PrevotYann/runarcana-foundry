import test from 'node:test';
import assert from 'node:assert/strict';
import {installDnd5eAdapter} from '../src/adapters/dnd5e-6.mjs';

test('mana consumption stages native updates and does not debit a cancelled workflow',async()=>{
  const hooks=new Map();
  globalThis.Hooks={on:(name,fn)=>hooks.set(name,fn)};
  globalThis.CONFIG={DND5E:{activityConsumptionTypes:{},damageTypes:{},healingTypes:{healing:{}}}};
  class ConsumptionError extends Error {}
  globalThis.game={settings:{get:()=>true},i18n:{localize:k=>k,format:k=>k},dnd5e:{dataModels:{activity:{ConsumptionError}}}};
  installDnd5eAdapter();
  const stored={mana:{value:10,max:10}};
  const actor={isOwner:true,getFlag:(_module,key)=>key==='enabled'?true:stored};
  const target={actor,item:{type:'spell',system:{level:1}},target:'mana'};
  const updates={actor:{},rolls:[]};
  await CONFIG.DND5E.activityConsumptionTypes.runarcanaResource.consume.call(target,{scaling:1},updates);
  assert.equal(updates.actor['flags.runarcana.resources.mana.value'],7);
  assert.equal(stored.mana.value,10);
  // A second native target reads the staged balance instead of the original balance.
  await CONFIG.DND5E.activityConsumptionTypes.runarcanaResource.consume.call(target,{scaling:0},updates);
  assert.equal(updates.actor['flags.runarcana.resources.mana.value'],5);
  await assert.rejects(CONFIG.DND5E.activityConsumptionTypes.runarcanaResource.consume.call(target,{scaling:4},updates),ConsumptionError);
  assert.equal(stored.mana.value,10);
  assert.equal(updates.actor['flags.runarcana.resources.mana.value'],5);
  const usage={consume:{spellSlot:true}};
  const activity={actor,consumption:{targets:[{type:'runarcanaResource'}],spellSlot:true}};
  hooks.get('dnd5e.preUseActivity')(activity,usage);
  assert.equal(activity.consumption.spellSlot,false);
  assert.equal(usage.consume.spellSlot,false);
});

test('unmarked actors keep native rests and damage',()=>{
  const hooks=new Map();globalThis.Hooks={on:(name,fn)=>hooks.set(name,fn)};
  globalThis.CONFIG={DND5E:{activityConsumptionTypes:{},damageTypes:{},healingTypes:{}}};
  globalThis.game={settings:{get:()=>true}};
  installDnd5eAdapter();
  const actor={getFlag:()=>false};const parts=[{type:'fire',value:15}],options={};
  assert.equal(hooks.get('dnd5e.preShortRest')(actor),undefined);
  hooks.get('dnd5e.preCalculateDamage')(actor,parts,options);
  assert.deepEqual(parts,[{type:'fire',value:15}]);assert.deepEqual(options,{});
});
test('Alnuk damage reduction respects multipliers, true damage and an explicit GM bypass',()=>{
  const hooks=new Map();globalThis.Hooks={on:(name,fn)=>hooks.set(name,fn)};
  globalThis.CONFIG={DND5E:{activityConsumptionTypes:{},damageTypes:{},healingTypes:{healing:{}}}};
  globalThis.game={settings:{get:()=>true}};installDnd5eAdapter();
  const actor={system:{abilities:{str:{mod:3}}},getFlag:(scope,key)=>key==='enabled'?true:key==='originSelection'?{plan:{strengthReduction:true}}:undefined};
  const damage=[{type:'fire',value:10},{type:'true',value:10},{type:'healing',value:10}],options={multiplier:2};
  hooks.get('dnd5e.preCalculateDamage')(actor,damage,options);assert.equal(damage[0].value*options.multiplier,17);assert.equal(damage[1].value,10);assert.equal(damage[2].value,10);
  const bypass=[{type:'fire',value:10}];hooks.get('dnd5e.preCalculateDamage')(actor,bypass,{runarcana:{ignoreOriginReduction:true}});assert.equal(bypass[0].value,10);
});
