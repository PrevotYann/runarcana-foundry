import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {heritageEligibility,heritageEffects} from '../src/heritage.mjs';
import {createApi} from '../src/api.mjs';
const rows=(await Promise.all((await fs.readdir('packs-src/release/heritages')).map(async f=>JSON.parse(await fs.readFile('packs-src/release/heritages/'+f,'utf8'))))).filter(d=>d.flags?.runarcana?.heritageRules);
const find=name=>rows.find(d=>d.name===name),rule=name=>find(name).flags.runarcana.heritageRules;
const context={origin:'Human',region:'Noxus',level:1,initial:true,classes:['Acolyte'],abilities:{str:14,cha:14},pool:'origin'};
test('all selectable heritage descriptions use the published one-point cost and omit index headings',()=>{
  assert.equal(rows.length,207);assert.ok(rows.every(d=>d.flags.runarcana.heritageRules.cost===1));assert.ok(!rows.some(d=>['General','Heritages by Origin','List of Heritages'].includes(d.name)));
});
test('heritage eligibility respects source region, origin, class, pool and creation-only restrictions',()=>{
  assert.equal(heritageEligibility(rule('Magic Spark'),context).valid,true);
  assert.equal(heritageEligibility(rule('Perceptive'),context).valid,true);
  assert.ok(heritageEligibility(rule('Perceptive'),{...context,origin:'Troll'}).errors.includes('RUNARCANA.Error.Prerequisite'));
  assert.ok(heritageEligibility(rule('Artificer'),context).errors.includes('RUNARCANA.Error.HeritagePool'));
  assert.equal(heritageEligibility(rule('Artificer'),{...context,pool:'region'}).valid,true);
  assert.ok(heritageEligibility(rule('Artificer'),{...context,pool:'region',region:'Demacia'}).errors.includes('RUNARCANA.Error.Prerequisite'));
  assert.ok(heritageEligibility(rule('Artificer'),{...context,pool:'region',initial:false}).errors.includes('RUNARCANA.Error.InitialHeritage'));
  assert.ok(heritageEligibility(rule('Ferromancer'),{...context,initial:false}).errors.includes('RUNARCANA.Error.InitialHeritage'));
  assert.ok(heritageEligibility(rule('Arcanist Acolyte'),{...context,classes:['Combatant']}).errors.includes('RUNARCANA.Error.Prerequisite'));
});
test('Colossus allows its published second choice only at creation and never a third choice',()=>{
  const r=rule('Variant: Colossus');assert.equal(r.maxCount,2);
  assert.equal(heritageEligibility(r,{...context,count:1}).valid,true);
  assert.ok(heritageEligibility(r,{...context,count:1,initial:false}).errors.includes('RUNARCANA.Error.InitialHeritage'));
  assert.ok(heritageEligibility(r,{...context,count:2}).errors.includes('RUNARCANA.Error.DuplicateChoice'));
  assert.equal(heritageEligibility(r,{...context,count:0,level:5,initial:false}).valid,true);
});
test('unresolved prerequisites remain visible and numeric requirements cannot silently pass',()=>{
  const result=heritageEligibility(rule('Cleave'),context);assert.ok(result.errors.includes('RUNARCANA.Error.Prerequisite'));assert.ok(result.manual.some(t=>t.includes('weapon')));
  const lunar=heritageEligibility(rule('Lunar Sight'),{...context,region:'Targon',pool:'region',existingNames:['Solar Core']});assert.ok(lunar.errors.includes('RUNARCANA.Error.Prerequisite'));assert.ok(lunar.manual.some(t=>t.includes('Born and raised')));
});
test('reviewed permanent heritage effects preserve expertise, additive vision and minimum senses',()=>{
  const sight=heritageEffects(rule('Lunar Sight'),{skills:{ins:1}})[0].system.changes;
  assert.ok(sight.some(c=>c.key==='system.skills.ins.value'&&c.value==='2'&&c.type==='upgrade'));
  assert.ok(sight.some(c=>c.key==='system.attributes.senses.ranges.darkvision'&&c.value==='15'&&c.type==='add'));
  const perceptive=heritageEffects(rule('Perceptive'))[0].system.changes;
  assert.ok(perceptive.some(c=>c.key==='system.attributes.senses.ranges.blindsight'&&c.value==='10'&&c.type==='upgrade'));
  assert.ok(perceptive.some(c=>c.key==='system.skills.prc.bonuses.passive'&&c.value==='floor(@prof / 2)'));
  assert.ok(perceptive.every(c=>c._id.length===16));
});
test('heritage application ignores submitted costs, enforces eligibility and restores failed item creation',async()=>{
  globalThis.game={settings:{get:()=>true},user:{isGM:true,id:'gm'},users:{activeGM:{id:'gm'}},time:{worldTime:0},modules:new Map()};
  const document=d=>({...structuredClone(d),documentName:'Item',getFlag(scope,k){return this.flags?.[scope]?.[k];},toObject(){return structuredClone(d);}});
  const sources=new Map(rows.map(d=>['Compendium.runarcana.heritages.Item.'+d._id,document(d)]));globalThis.fromUuid=async uuid=>sources.get(uuid);
  const flags={enabled:true,creationDraft:{classUuid:'class'},originSelection:{plan:{origin:'Human',region:'Noxus',heritagePoints:3,regionPoints:2}}};
  let nextItem=0;
  const actor={uuid:'Actor.heritage',isOwner:true,system:{details:{level:1},abilities:{str:{value:14},cha:{value:14}},skills:{}},items:[{id:'class',name:'Acolyte',type:'class'}],getFlag:(_,k)=>flags[k],setFlag:async(scope,k,v)=>{flags[k]=v;},update:async u=>{for(const [k,v]of Object.entries(u))flags[k.split('.').at(-1)]=structuredClone(v);},createEmbeddedDocuments:async(type,docs)=>{const made=docs.map((d,i)=>({...d,id:'feat'+(++nextItem)}));actor.items.push(...made);return made;},deleteEmbeddedDocuments:async(type,ids)=>{actor.items=actor.items.filter(i=>!ids.includes(i.id));}};
  const api=createApi(),choice=name=>({uuid:'Compendium.runarcana.heritages.Item.'+find(name)._id,cost:0});
  const plan={pool:'origin',budget:999,choices:[choice('Magic Spark')]};const preview=await api.previewHeritages(actor,plan);assert.equal(preview.spent,1);assert.equal(preview.budget,3);
  actor.items[0].name='Acolyte traduit';actor.items[0].system={identifier:'acolyte'};assert.equal((await api.previewHeritages(actor,{pool:'origin',choices:[choice('Arcanist Acolyte')]})).valid,true);
  await api.applyHeritages(actor,plan);assert.equal(flags.choices.choices[0].cost,1);
  await assert.rejects(api.applyHeritages(actor,plan),/DuplicateChoice/);
  sources.set('Item.world-copy',document(find('Magic Spark')));await assert.rejects(api.applyHeritages(actor,{pool:'origin',choices:[{uuid:'Item.world-copy'}]}),/DuplicateChoice/);
  const update=actor.update;actor.update=async()=>{throw Error('persist failed');};const before=actor.items.length;
  await assert.rejects(api.applyHeritages(actor,{pool:'origin',choices:[choice('Perceptive')]}),/persist failed/);assert.equal(actor.items.length,before);actor.update=update;
  await api.finishCharacter(actor);assert.equal(flags.creationComplete,true);
  await assert.rejects(api.applyHeritages(actor,{pool:'origin',choices:[choice('Ferromancer')]}),/InitialHeritage/);
});
