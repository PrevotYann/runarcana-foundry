import test from 'node:test';
import assert from 'node:assert/strict';
import {manaCost,resourceValue,scaleDice,traitApplies,damageComponents,validateChoices,creatureStatistics} from '../src/rules.mjs';

test('official mana table; never silently coerce spell levels',()=>{
  assert.deepEqual(Array.from({length:10},(_,n)=>manaCost(n)),[0,2,3,5,6,7,9,12,16,21]);
  for(const value of [-1,10,1.5,'1',NaN])assert.throws(()=>manaCost(value));
});
test('resource bounds, consumption and recovery',()=>{
  assert.equal(resourceValue({value:4,max:10},-3),1);
  assert.equal(resourceValue({value:4,max:10},20),10);
  assert.throws(()=>resourceValue({value:4,max:10},-5));
  assert.throws(()=>resourceValue({value:20,max:10},0));
});
test('damage scale follows published multiple-die example beyond d12',()=>{
  assert.equal(scaleDice(6,6,1),'6d8');
  assert.equal(scaleDice(6,6,4),'6d12 + 1d4');
  assert.equal(scaleDice(6,6,5),'6d12 + 1d6');
  assert.equal(scaleDice(2,12,6),'2d12 + 1d12 + 1d4');
});
test('magical defenses inherit only in the official direction',()=>{
  assert.equal(traitApplies(['glacial'],'cold','resistance'),true);
  assert.equal(traitApplies(['cold'],'glacial','resistance'),false);
  assert.equal(traitApplies(['cold'],'glacial','vulnerability'),true);
  assert.equal(traitApplies(['glacial'],'cold','vulnerability'),false);
});
test('source example: reduction before resistance; independent components',()=>{
  const parts=damageComponents([{type:'bludgeoning',value:25},{type:'fire',value:9}],{reduction:{bludgeoning:5},resistance:['bludgeoning']});
  assert.deepEqual(parts.map(p=>p.value),[10,9]);
});
test('absorption rejects self damage, cantrips and continuous effects',()=>{
  const defense={absorption:['incinerating']},part=[{type:'fire',value:11}];
  const ctx={sourceActorUuid:'Actor.source',targetActorUuid:'Actor.target'};
  assert.equal(damageComponents(part,defense,ctx)[0].value,-5);
  assert.equal(damageComponents(part,defense,{...ctx,sourceActorUuid:ctx.targetActorUuid})[0].value,0);
  assert.equal(damageComponents(part,defense,{...ctx,isSpell:true,spellLevel:0})[0].value,0);
  assert.equal(damageComponents(part,defense,{...ctx,isSpell:true,spellLevel:1})[0].value,-5);
  assert.equal(damageComponents(part,defense,{...ctx,continuous:true})[0].value,0);
});
test('heritage duplicate, budget and prerequisite validation',()=>{
  assert.equal(validateChoices({budget:2,choices:[{id:'a',cost:2}]}).valid,true);
  assert.equal(validateChoices({budget:1,choices:[{id:'a',cost:2}]}).valid,false);
  assert.equal(validateChoices({budget:3,choices:[{id:'a',cost:1},{id:'a',cost:1}]}).valid,false);
  assert.equal(validateChoices({budget:2,choices:[{id:'a',cost:1,prerequisites:[{type:'level',min:5}]}],actor:{level:4}}).valid,false);
});
test('official Elite CR7 huge example: 30d12 plus 3 times Con modifier',()=>{
  const result=creatureStatistics({cr:7,role:'elite',size:'huge',constitution:16});
  assert.equal(result.hitDice,'30d12 + 9');assert.equal(result.hp,189);assert.equal(result.proficiency,3);
  assert.equal(creatureStatistics({cr:2,role:'soldier',size:'large',constitution:12}).hitDice,'8d10 + 2');
});
