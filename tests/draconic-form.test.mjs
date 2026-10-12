import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createApi,serialized} from '../src/api.mjs';
import {originAction} from '../src/origin-actions.mjs';
import {naturalWeapon} from '../src/origin-weapons.mjs';
import {draconicChanges,remainingBreathSpent} from '../src/draconic-form.mjs';
import {installDnd5eAdapter} from '../src/adapters/dnd5e-6.mjs';
const docs=await Promise.all((await fs.readdir('packs-src/release/origins')).map(async f=>JSON.parse(await fs.readFile('packs-src/release/origins/'+f,'utf8'))));
const profile=docs.find(d=>d.name==='Half-Dragon'&&d.type==='race').flags.runarcana.creation;
function merge(target,value){for(const [key,v]of Object.entries(value)){if(key.startsWith('-='))delete target[key.slice(2)];else if(v&&typeof v==='object'&&!Array.isArray(v))merge(target[key]??={},v);else target[key]=structuredClone(v);}return target;}
function write(target,path,value){const keys=path.split('.');for(const key of keys.slice(0,-1))target=target[key]??={};const key=keys.at(-1);if(key.startsWith('-='))delete target[key.slice(2)];else if(value&&typeof value==='object'&&!Array.isArray(value))merge(target[key]??={},value);else target[key]=structuredClone(value);}
function setup(name='Glacial Elemental'){
  const variant=profile.variants.find(v=>v.name===name);let n=0;
  const wrap=raw=>({...structuredClone(raw),id:raw._id,getFlag(s,k){return this.flags?.[s]?.[k];},toObject(){const {id,getFlag,toObject,...data}=this;return structuredClone(data);}});
  const items=[{name:'Half-Dragon',type:'race',system:{},flags:{runarcana:{originManaged:true,creation:{origin:'Half-Dragon'}}}},...variant.actions.map(a=>originAction(a,{canonicalId:'dragon'})),...variant.naturalWeapons.map(w=>naturalWeapon(w))].map(d=>wrap({...d,_id:'item'+(++n)}));items.get=id=>items.find(i=>i.id===id);
  const effects=[wrap({_id:'unrelated',name:'Other effect',flags:{}})];effects.get=id=>effects.find(e=>e.id===id);
  const actor={uuid:'Actor.dragon',isOwner:true,items,effects,flags:{runarcana:{enabled:true,originSelection:{plan:{origin:'Half-Dragon'}}}},system:{details:{level:8},traits:{size:'med'},attributes:{prof:3,hp:{value:14,max:30},exhaustion:0},abilities:{con:{mod:2}}},
    getFlag(s,k){return this.flags[s]?.[k];},
    async update(updates){if(this.failFlagOnce){this.failFlagOnce=false;throw Error('flag failed');}for(const [p,v]of Object.entries(updates))write(this,p,v);},
    async createEmbeddedDocuments(type,rows){const made=rows.map(d=>wrap({...d,_id:d._id??'effect'+(++n)}));(type==='Item'?items:effects).push(...made);return made;},
    async deleteEmbeddedDocuments(type,ids){const collection=type==='Item'?items:effects;for(const id of ids){const i=collection.findIndex(d=>d.id===id);if(i>=0)collection.splice(i,1);}},
    async updateEmbeddedDocuments(type,rows){const made=[];for(const r of rows){const item=items.get(r._id);for(const [p,v]of Object.entries(r))if(p!=='_id')write(item,p,v);made.push(item);if(this.failItemsOnce){this.failItemsOnce=false;throw Error('items failed');}}return made;}}
  globalThis.game={settings:{get:()=>true},user:{id:'gm',isGM:true},users:{activeGM:{id:'gm'}},time:{worldTime:100},actors:[actor],modules:new Map()};
  const api=createApi();game.modules.set('runarcana',{api});return {actor,api,variant};
}
const action=(actor,id)=>actor.items.find(i=>i.getFlag('runarcana','originAction')===id);

test('each reviewed essence has the correct physical boost and flying speed; growth never shrinks a larger creature',()=>{
  const expected={'Glacial Elemental':['con',60],'Infernal Elemental':['str',60],'Mountain Elemental':['con',60],'Cloud Elemental':['dex',70],'Ocean Elemental':['con',60]};
  for(const variant of profile.variants){const form=variant.actions.find(a=>a.kind==='draconicForm');assert.ok(form);const [ability,fly]=expected[variant.name];assert.equal(form.ability,ability);assert.equal(form.fly,fly);const changes=draconicChanges(form,{size:'lg',proficiency:5});assert.equal(changes[0].value,'2');assert.equal(changes[1].value,'huge');assert.equal(Number(changes[2].value),fly);assert.ok(changes.every(c=>c._id.length===16));}
  const form=profile.variants[0].actions.find(a=>a.kind==='draconicForm');assert.equal(draconicChanges(form,{size:'grg'})[1].value,'grg');assert.equal(draconicChanges(form,{size:'huge'})[1].value,'huge');
});

test('entering and leaving form preserves HP, ordinary breath expenditure and unrelated effects, and removes bonus claws',async()=>{
  const {actor,api}=setup();const beforeWeapons=actor.items.filter(i=>i.type==='weapon').map(i=>i.toObject());
  await Promise.all([api.setDraconicForm(actor,true,{equipmentConfirmed:true}),api.setDraconicForm(actor,true,{equipmentConfirmed:true})]);
  assert.equal(action(actor,'draconic-form').system.uses.spent,1);
  assert.equal(actor.system.attributes.hp.value,14);assert.equal(actor.effects.length,2);
  assert.equal(actor.getFlag('runarcana','draconicForm').expires,10900);
  assert.equal(action(actor,'draconic-breath').system.uses.max,'@prof + floor(@prof / 2)');
  const breath=action(actor,'draconic-breath');assert.equal(Object.values(breath.system.activities)[0].damage.parts[0].custom.formula,'(@prof)d8');
  const claws=actor.items.find(i=>i.getFlag('runarcana','weaponDefinition')?.id==='claws');assert.equal(claws.system.damage.base.denomination,8);assert.equal(claws.system.activities.rcDragonClaws001.activation.type,'bonus');
  await api.setDraconicForm(actor,true,{equipmentConfirmed:true});assert.equal(action(actor,'draconic-form').system.uses.spent,1);
  breath.system.uses.spent=3;
  await api.setDraconicForm(actor,false);
  assert.equal(breath.system.uses.spent,2);assert.equal(breath.system.uses.max,'@prof');
  assert.equal(Object.values(breath.system.activities)[0].damage.parts[0].custom.formula,'(@prof)d6');
  assert.deepEqual(actor.items.filter(i=>i.type==='weapon').map(i=>i.toObject()),beforeWeapons);
  assert.equal(actor.effects.length,1);assert.equal(actor.effects[0].id,'unrelated');assert.equal(actor.system.attributes.hp.value,14);
  await api.setDraconicForm(actor,false);assert.equal(action(actor,'draconic-form').system.uses.spent,1);
  await assert.rejects(api.setDraconicForm(actor,true,{equipmentConfirmed:true}),/InsufficientResource/);
});

test('temporary breath uses are spent first without refunding ordinary expenditure',()=>{
  assert.equal(remainingBreathSpent(5,4,2),4);assert.equal(remainingBreathSpent(7,4,2),5);
  assert.equal(remainingBreathSpent(0,4,2),0);assert.equal(remainingBreathSpent(4,4,2),4);
});

test('level, equipment and HP restrictions are checked before charging; form blocks customization and rest',async()=>{
  const {actor,api}=setup();actor.system.details.level=7;
  await assert.rejects(api.setDraconicForm(actor,true,{equipmentConfirmed:true}),/Level8/);
  actor.system.details.level=8;await assert.rejects(api.setDraconicForm(actor,true),/EquipmentRequired/);
  actor.system.attributes.hp.value=0;await assert.rejects(api.setDraconicForm(actor,true,{equipmentConfirmed:true}),/RestHP/);
  assert.equal(action(actor,'draconic-form').system.uses.spent,0);
  actor.system.attributes.hp.value=14;await api.setDraconicForm(actor,true,{equipmentConfirmed:true});
  await assert.rejects(api.customizeOrigin(actor,{}),/ReturnFirst/);await assert.rejects(api.rest(actor,'short'),/ReturnFirst/);
  await api.setDraconicForm(actor,false);actor.flags.runarcana.rest={longCount:2};await api.rest(actor,'full');
  assert.equal(action(actor,'draconic-form').system.uses.spent,0);
});

test('partial entry and failed exit roll back effects, counters, damage and state',async()=>{
  const {actor,api}=setup();const before=actor.items.map(i=>i.toObject());actor.failItemsOnce=true;
  await assert.rejects(api.setDraconicForm(actor,true,{equipmentConfirmed:true}),/items failed/);
  assert.deepEqual(actor.items.map(i=>i.toObject()),before);assert.equal(actor.effects.length,1);assert.equal(actor.getFlag('runarcana','draconicForm'),null);
  await api.setDraconicForm(actor,true,{equipmentConfirmed:true});const active=actor.items.map(i=>i.toObject()),effects=actor.effects.map(e=>e.toObject()),state=structuredClone(actor.getFlag('runarcana','draconicForm'));
  actor.failFlagOnce=true;await assert.rejects(api.setDraconicForm(actor,false),/flag failed/);
  assert.deepEqual(actor.items.map(i=>i.toObject()),active);assert.deepEqual(actor.effects.map(e=>e.toObject()),effects);assert.deepEqual(actor.getFlag('runarcana','draconicForm'),state);
});

test('Infernal form adds a breath die; duration and zero HP restore base form; consumed materials are blocked',async()=>{
  const {actor,api}=setup('Infernal Elemental');await api.setDraconicForm(actor,true,{equipmentConfirmed:true});
  assert.equal(Object.values(action(actor,'draconic-breath').system.activities)[0].damage.parts[0].custom.formula,'(@prof + 1)d8');
  const hooks=new Map();globalThis.Hooks={on:(k,fn)=>hooks.set(k,fn)};globalThis.CONFIG={DND5E:{activityConsumptionTypes:{},damageTypes:{},healingTypes:{}}};globalThis.ui={notifications:{warn:()=>{}}};game.i18n={localize:k=>k};installDnd5eAdapter();
  const activity={actor,item:{type:'spell',system:{materials:{consumed:true}},getFlag:()=>undefined},consumption:{targets:[]}};
  assert.equal(hooks.get('dnd5e.preUseActivity')(activity,{}),false);activity.item.system.materials.consumed=false;assert.equal(hooks.get('dnd5e.preUseActivity')(activity,{}),undefined);
  game.time.worldTime=10900;hooks.get('updateWorldTime')();await serialized(actor.uuid,async()=>{});assert.equal(actor.getFlag('runarcana','draconicForm'),null);
  action(actor,'draconic-form').system.uses.spent=0;await api.setDraconicForm(actor,true,{equipmentConfirmed:true});actor.system.attributes.hp.value=0;hooks.get('updateActor')(actor);await serialized(actor.uuid,async()=>{});assert.equal(actor.getFlag('runarcana','draconicForm'),null);assert.equal(actor.system.attributes.hp.value,0);
});

test('deleting the managed origin ends form and cannot leave a usable transformation without its origin',async()=>{
  const {actor,api}=setup();await api.setDraconicForm(actor,true,{equipmentConfirmed:true});
  const hooks=new Map();globalThis.Hooks={on:(k,fn)=>hooks.set(k,fn)};
  globalThis.CONFIG={DND5E:{activityConsumptionTypes:{},damageTypes:{},healingTypes:{}}};installDnd5eAdapter();
  const race=actor.items.find(i=>i.type==='race');race.parent=actor;
  actor.items.splice(actor.items.indexOf(race),1);
  hooks.get('deleteItem')(race);await serialized(actor.uuid,async()=>{});
  assert.equal(actor.getFlag('runarcana','draconicForm'),null);
  assert.equal(actor.effects.length,1);
  action(actor,'draconic-form').system.uses.spent=0;
  await assert.rejects(api.setDraconicForm(actor,true,{equipmentConfirmed:true}),/Source/);
});
