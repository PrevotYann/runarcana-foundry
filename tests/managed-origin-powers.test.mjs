import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createApi} from '../src/api.mjs';
import {originAction} from '../src/origin-actions.mjs';
import {originSpellGrant} from '../src/origin-spells.mjs';
const docs=(await Promise.all((await fs.readdir('packs-src/release/origins')).map(async f=>JSON.parse(await fs.readFile('packs-src/release/origins/'+f,'utf8'))))).filter(d=>d.type==='race');
const getVariant=(origin,name)=>docs.find(d=>d.name===origin).flags.runarcana.creation.variants.find(v=>v.name===name);
const copy=v=>structuredClone(v);
function write(object,path,value){const keys=path.split('.');for(const k of keys.slice(0,-1))object=object[k]??={};object[keys.at(-1)]=copy(value);}
function setup(origin='Vastaya',name='Vesani'){
  let n=0;
  const wrap=d=>({...copy(d),id:d._id,getFlag(s,k){return this.flags?.[s]?.[k];},toObject(){const {id,getFlag,toObject,...raw}=this;return copy(raw);}});
  const make=(uuid,plan,hp=20,max=30)=>{
    const items=[],effects=[];items.get=id=>items.find(i=>i.id===id);effects.get=id=>effects.find(e=>e.id===id);
    const actor={uuid,documentName:'Actor',isOwner:true,items,effects,statuses:new Set(),flags:{runarcana:{enabled:true,originSelection:{plan}}},system:{attributes:{hp:{value:hp,max,temp:0},prof:3},details:{level:9},abilities:{con:{mod:3},wis:{mod:2},cha:{mod:1}}},getFlag(s,k){return this.flags[s]?.[k];},getRollData(){return {prof:3,details:{level:9},abilities:this.system.abilities};},async update(rows){if(this.failOnce){this.failOnce=false;throw Error('update failed');}for(const [p,v]of Object.entries(rows))write(this,p,v);},async updateEmbeddedDocuments(type,rows){if(this.failItemsOnce){this.failItemsOnce=false;throw Error('item update failed');}for(const r of rows){const item=items.get(r._id);for(const [p,v]of Object.entries(r))if(p!=='_id')write(item,p,v);}return rows.map(r=>items.get(r._id));},async createEmbeddedDocuments(type,rows){const made=rows.map(d=>wrap({...d,_id:d._id??'doc'+(++n)}));(type==='Item'?items:effects).push(...made);return made;},async deleteEmbeddedDocuments(type,ids){const list=type==='Item'?items:effects;for(const id of ids){const i=list.findIndex(x=>x.id===id);if(i>=0)list.splice(i,1);}},async toggleStatusEffect(condition,{active}){if(active){this.statuses.add(condition);effects.push(wrap({_id:'condition'+(++n),type:'condition',name:condition,system:{type:condition},flags:{}}));}else{this.statuses.delete(condition);for(let i=effects.length-1;i>=0;i--)if(effects[i].system.type===condition)effects.splice(i,1);}}};return actor;
  };
  const variant=getVariant(origin,name),actor=make('Actor.source',{origin,variant:name,castingAbility:'wis'}),target=make('Actor.target',{origin:'Human'},5,20);
  const max=d=>d.max==='@prof'?3:d.max==='10 * @prof'?30:d.max==='3 + @prof'?6:d.max==='floor(@details.level / 2)'?4:d.max==='floor(@prof / 2)'?1:0;
  for(const definition of variant.actions.filter(d=>d.managed)){const item=originAction(definition);item._id='power'+(++n);item.system.uses.max=max(definition);actor.items.push(wrap(item));}
  const cls=wrap({_id:'class',name:'Acolyte',type:'class',system:{levels:9,hd:{spent:0,denomination:'d8'}},flags:{}});actor.items.push(cls);
  globalThis.game={settings:{get:()=>true},user:{id:'gm',isGM:true},users:{activeGM:{id:'gm'}},time:{worldTime:100},modules:new Map()};
  globalThis.fromUuid=async uuid=>uuid===actor.uuid?actor:uuid===target.uuid?target:null;
  globalThis.Roll=class{constructor(){this.total=9;}async evaluate(){return this;}};
  return {actor,target,variant,api:createApi(),wrap};
}
const power=(actor,kind)=>actor.items.find(i=>i.getFlag('runarcana','originPower')?.managed===kind);
const confirmed={prerequisitesConfirmed:true};

test('Floral branches charge actual feet, create a Dexterity-damage whip and expire after 24 hours',async()=>{
  const {actor,api}=setup('Antroplantae','Floral'),p=power(actor,'floralBranch');
  await api.useOriginPower(actor,p.id,{...confirmed,whip:true});assert.equal(p.system.uses.spent,6);
  const whip=actor.items.find(i=>i.getFlag('runarcana','branchLength')===6);assert.equal(whip.type,'weapon');assert.equal(whip.getFlag('runarcana','originExpires'),86500);
  assert.equal(Object.values(whip.system.activities)[0].damage.parts[0].custom.formula,'1d4 + @prof + @abilities.dex.mod');
  await api.useOriginPower(actor,p.id,{...confirmed,length:5});assert.equal(p.system.uses.spent,11);
  await assert.rejects(api.useOriginPower(actor,p.id,{...confirmed,length:2.5}),/InsufficientResource/);
});

test('Vesani spirit orbs use the selected Wisdom DC, consume one Fox Fire use, and restore creation after failure',async()=>{
  const {actor,api,variant,wrap}=setup(),p=power(actor,'foxFire'),definition=variant.spellGrants[0];
  const sourceRaw=JSON.parse(await fs.readFile('packs-src/release/spells/'+definition.uuid.split('.').at(-1)+'.json','utf8'));
  const source={...sourceRaw,getFlag:(s,k)=>sourceRaw.flags[s]?.[k],toObject:()=>copy(sourceRaw)};
  actor.items.push(wrap({...originSpellGrant(source,definition,{castingAbility:'wis',level:9}),_id:'arcane'}));
  await api.useOriginPower(actor,p.id,{...confirmed,count:2});assert.equal(p.system.uses.spent,1);
  const orbs=actor.items.find(i=>i.getFlag('runarcana','foxFireOrbs'));
  assert.equal(orbs.system.uses.max,'2');assert.equal(orbs.getFlag('runarcana','originExpires'),130);
  const activity=Object.values(orbs.system.activities)[0];assert.equal(activity.save.dc.formula,'8 + @prof + @abilities.wis.mod');assert.equal(activity.consumption.targets[0].type,'itemUses');
  const before=actor.items.length;actor.failItemsOnce=true;await assert.rejects(api.useOriginPower(actor,p.id,confirmed),/item update failed/);assert.equal(actor.items.length,before);assert.equal(p.system.uses.spent,1);
});

test('Plumdaggers respect two-proficiency carrying capacity and record the GM decay ruling',async()=>{
  const {actor,api}=setup('Vastaya','Lhotlan'),p=power(actor,'plumdaggers');
  for(let i=0;i<3;i++)await api.useOriginPower(actor,p.id,{...confirmed,decayHours:2});
  assert.equal(actor.items.filter(i=>i.type==='weapon').reduce((n,i)=>n+i.system.quantity,0),6);
  await assert.rejects(api.useOriginPower(actor,p.id,{...confirmed,decayHours:2}),/Capacity/);
  await api.useOriginPower(actor,p.id,{...confirmed,decayHours:3,discardOldest:true});assert.equal(p.system.uses.spent,4);
  const feathers=actor.items.filter(i=>i.type==='weapon');assert.equal(feathers.length,3);assert.equal(feathers.at(-1).getFlag('runarcana','decayRuling').hours,3);
  assert.equal(feathers.at(-1).system.damage.base.bonus,'@prof');
  await assert.rejects(api.useOriginPower(actor,p.id,confirmed),/DecayRequired/);
});

test('Selfsacrifice spends one real Hit Die, halves Construct healing and applies unmitigated damage from actual healing',async()=>{
  const {actor,target,api}=setup('Vastaya','Ottrani'),p=power(actor,'selfsacrifice');target.flags.runarcana.originSelection.plan.origin='Construct';
  const result=await api.useOriginPower(actor,p.id,{...confirmed,classId:'class',targetUuid:target.uuid});
  assert.equal(result.healed,4);assert.equal(result.selfDamage,2);assert.equal(target.system.attributes.hp.value,9);assert.equal(actor.system.attributes.hp.value,18);
  assert.equal(actor.items.get('class').system.hd.spent,1);assert.equal(p.system.uses.spent,1);
  actor.failOnce=true;const sourceHP=actor.system.attributes.hp.value,targetHP=target.system.attributes.hp.value;
  await assert.rejects(api.useOriginPower(actor,p.id,{...confirmed,classId:'class',targetUuid:target.uuid}),/update failed/);
  assert.equal(actor.system.attributes.hp.value,sourceHP);assert.equal(target.system.attributes.hp.value,targetHP);assert.equal(actor.items.get('class').system.hd.spent,1);assert.equal(p.system.uses.spent,1);
});

test('Devour Essence validates an unconscious zero-HP target, stores the essence and records wish-only revival',async()=>{
  const {actor,target,api}=setup(),p=power(actor,'devourEssence');
  await assert.rejects(api.useOriginPower(actor,p.id,{...confirmed,targetUuid:target.uuid}),/EssenceTarget/);
  target.system.attributes.hp.value=0;target.statuses.add('unconscious');
  await api.useOriginPower(actor,p.id,{...confirmed,targetUuid:target.uuid,store:true});
  assert.ok(target.statuses.has('dead'));assert.equal(target.getFlag('runarcana','essenceConsumed').revival,'wish-only');assert.equal(actor.getFlag('runarcana','originPowerState').essences.length,1);assert.equal(actor.system.attributes.hp.value,20);assert.equal(p.system.uses.spent,1);
});

test('temporary self buffs charge once and use V14 start/duration fields',async()=>{
  const {actor,api}=setup('Construct','Brutal'),p=power(actor,'selfEffect');
  await api.useOriginPower(actor,p.id,confirmed);assert.equal(p.system.uses.spent,1);assert.equal(actor.effects.length,1);
  const effect=actor.effects[0];assert.equal(effect.start.time,100);assert.deepEqual(effect.duration,{value:18,units:'seconds',expiry:null});assert.equal(effect.system.changes[0].value,'40');assert.equal(effect.getFlag('runarcana','followup').rounds,2);
});
