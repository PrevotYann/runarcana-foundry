import test from 'node:test';
import assert from 'node:assert/strict';
import {createApi} from '../src/api.mjs';
function writePath(object,path,value){const parts=path.split('.');let target=object;for(const k of parts.slice(0,-1))target=target[k]??={};target[parts.at(-1)]=structuredClone(value);}
function setup() {
  globalThis.game={settings:{get:()=>true},user:{id:'gm',isGM:true},users:{activeGM:{id:'gm'}},time:{worldTime:0},i18n:{localize:k=>k}};
  const actor={uuid:'Actor.test',isOwner:true,flags:{runarcana:{enabled:true,resources:{mana:{value:4,max:10,recovery:'full'},ki:{value:1,max:5,recovery:'short'}}}},system:{details:{level:4},attributes:{hp:{value:12,max:30},exhaustion:3},abilities:{con:{value:14,mod:2}}},items:[{id:'class',type:'class',system:{levels:4,hd:{denomination:'d8',spent:4}}}],
    getFlag(scope,key){return this.flags[scope]?.[key];},
    async update(updates){for(const [key,value]of Object.entries(updates))writePath(this,key,value);},
    async updateEmbeddedDocuments(type,updates){for(const u of updates){const item=this.items.find(i=>i.id===u._id);for(const [key,value]of Object.entries(u))if(key!=='_id')writePath(item,key,value);}},
    getRollData(){return {abilities:{con:{mod:2}}};}};
  return {actor,api:createApi()};
}
test('resource mutations are idempotent on the primary GM and cannot overspend',async()=>{
  const {actor,api}=setup();
  await Promise.all([api.spendResource(actor,'mana',3,{operationId:'same-operation'}),api.spendResource(actor,'mana',3,{operationId:'same-operation'})]);
  assert.equal(actor.flags.runarcana.resources.mana.value,1);
  await assert.rejects(api.spendResource(actor,'mana',2),/InsufficientResource/);
  assert.equal(actor.flags.runarcana.resources.mana.value,1);
});
test('unmarked actors, secondary GMs and players cannot invoke shared mutations',async()=>{
  const {actor,api}=setup();actor.flags.runarcana.enabled=false;
  await assert.rejects(api.spendResource(actor,'mana',1),/NotMarked/);actor.flags.runarcana.enabled=true;
  game.user.id='secondary';await assert.rejects(api.spendResource(actor,'mana',1),/PrimaryGM/);
  game.user={id:'player',isGM:false};await assert.rejects(api.setResource(actor,'mana',{value:0,max:0}),/PrimaryGM/);
});
test('full rest requires two long rests, time intervals and positive starting HP',async()=>{
  const {actor,api}=setup();
  await assert.rejects(api.rest(actor,'full'),/FullRest/);
  await api.rest(actor,'long',{operationId:'long-one'});
  assert.equal(actor.system.attributes.hp.value,12);assert.equal(actor.system.attributes.exhaustion,1);
  await assert.rejects(api.rest(actor,'long'),/RestTime/);
  game.time.worldTime=86400;await api.rest(actor,'long',{operationId:'long-two'});
  game.time.worldTime=172800;actor.system.attributes.hp.value=0;
  await assert.rejects(api.rest(actor,'full'),/RestHP/);actor.system.attributes.hp.value=1;
  await api.rest(actor,'full',{operationId:'full-three'});
  assert.equal(actor.system.attributes.hp.value,30);assert.equal(actor.system.attributes.exhaustion,0);
  assert.equal(actor.items[0].system.hd.spent,2);assert.equal(actor.flags.runarcana.resources.mana.value,10);
  assert.equal(actor.flags.runarcana.rest.longCount,0);
  await api.rest(actor,'full',{operationId:'full-three'});assert.equal(actor.items[0].system.hd.spent,2);
});
test('short-rest resource recovery does not grant native long-rest HP or mana',async()=>{
  const {actor,api}=setup();await api.rest(actor,'short');
  assert.equal(actor.flags.runarcana.resources.ki.value,5);assert.equal(actor.flags.runarcana.resources.mana.value,4);
  assert.equal(actor.system.attributes.hp.value,12);
});
test('an update failure during hit-die spending restores the class die',async()=>{
  const {actor,api}=setup();actor.items[0].system.hd.spent=0;
  globalThis.Roll=class{constructor(){this.total=6;}async evaluate(){return this;}async toMessage(){}};
  actor.update=async()=>{throw Error('update failed');};
  await assert.rejects(api.spendHitDie(actor,'short','d8'),/update failed/);
  assert.equal(actor.items[0].system.hd.spent,0);
});
test('a second short-rest hit die is refused until a long rest',async()=>{
  const {actor,api}=setup();actor.items[0].system.hd.spent=0;
  globalThis.Roll=class{constructor(){this.total=6;}async evaluate(){return this;}async toMessage(){}};
  globalThis.ChatMessage={getSpeaker:()=>({})};
  await api.spendHitDie(actor,'short','d8');assert.equal(actor.system.attributes.hp.value,18);
  await assert.rejects(api.spendHitDie(actor,'short','d8'),/ShortHitDie/);
  await api.rest(actor,'long');await api.spendHitDie(actor,'short','d8');assert.equal(actor.system.attributes.hp.value,24);
});
