import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {EQUIPMENT_WEAPONS} from '../src/regional.mjs';
import {regionalWeaponAllowed} from '../src/regional.mjs';
import {heritageEligibility,heritageOptions,heritageEffects} from '../src/heritage.mjs';
import {heritageWeaponOptions,explicitWeaponProficiencies} from '../src/heritage-weapons.mjs';
import {createApi} from '../src/api.mjs';
import {installDnd5eAdapter} from '../src/adapters/dnd5e-6.mjs';
const documents=(await Promise.all((await fs.readdir('packs-src/release/heritages')).map(async f=>JSON.parse(await fs.readFile('packs-src/release/heritages/'+f,'utf8'))))).filter(d=>d.flags?.runarcana?.heritageRules);
const source=name=>documents.find(d=>d.name===name),rules=name=>source(name).flags.runarcana.heritageRules;
const context={origin:'Human',region:'Noxus',level:1,initial:true,pool:'region'};
const weapon=name=>EQUIPMENT_WEAPONS.find(w=>w.name===name);

test('regional weapon properties and ranged simple classifications follow the published table',async()=>{
  assert.deepEqual(weapon('Small Chakram').regions,['Targon']);assert.equal(weapon('Shortbow').category,'simple');
  assert.deepEqual(weapon('Katar').regions,['Ionia','Noxus','Shurima']);
  const group={weapons:[],categories:['martial']};
  assert.equal(regionalWeaponAllowed(weapon('Small Chakram'),group,'Targon'),true);assert.equal(regionalWeaponAllowed(weapon('Small Chakram'),group,'Noxus'),false);
  const files=await fs.readdir('packs-src/release/equipment');const docs=await Promise.all(files.map(async f=>JSON.parse(await fs.readFile('packs-src/release/equipment/'+f,'utf8'))));
  for(const name of ['Shortbow','Light Crossbow','Dart','Sling'])assert.equal(docs.find(d=>d.type==='weapon'&&d.name===name).system.type.value,'simpleR');
});

test('weapon heritage options constrain regional martial weapons, regional weapons and firearms',()=>{
  const ferro=rules('Ferromancer'),scholar=rules('Weapon Scholar'),firearms=rules('Sulfur, Saltpeter and Charcoal');
  assert.ok(heritageWeaponOptions(ferro,{region:'Targon'}).some(w=>w.name==='Small Chakram'));
  assert.ok(!heritageWeaponOptions(ferro,{region:'Noxus'}).some(w=>w.name==='Small Chakram'));
  assert.ok(!heritageWeaponOptions(ferro,{region:'Noxus'}).some(w=>w.name==='Shortbow'||w.category==='firearm'));
  assert.equal(heritageWeaponOptions(ferro,{region:'Unknown'}).length,0);
  assert.ok(heritageWeaponOptions(scholar).every(w=>w.regions.length));assert.ok(!heritageWeaponOptions(scholar).some(w=>w.id==='longsword'));
  assert.ok(heritageWeaponOptions(firearms).every(w=>w.category==='firearm'));
  assert.equal(heritageOptions(ferro,{weapon:weapon('Small Chakram').id},{region:'Noxus'}).valid,false);
  assert.equal(heritageOptions(scholar,{weapon:'unknown'}).valid,false);
  const effects=heritageEffects(ferro,{options:{weapon:weapon('Small Chakram').id},context:{region:'Targon'}})[0].system.changes;
  assert.deepEqual(effects.map(c=>[c.key,c.value]),[['system.traits.weaponProf.value',weapon('Small Chakram').id]]);
});

test('explicit repeat rules retain limits and firearm prerequisites require an actual firearm proficiency',()=>{
  const discipline=rules('Discipline is Strength');assert.equal(discipline.maxCount,null);assert.equal(heritageEligibility(discipline,{...context,count:20}).valid,true);
  assert.equal(heritageOptions(discipline,{weapon:'longsword'},{previousWeapons:['longsword']}).valid,false);
  const form=documents.find(d=>d.flags.runarcana.heritageRules.repeatReviewRequired).flags.runarcana.heritageRules;
  assert.ok(heritageEligibility(form,{...context,origin:'Vastaya',pool:'origin',count:1}).manual.some(m=>m.includes('different tribal form')));
  const sulfur=rules('Sulfur, Saltpeter and Charcoal');
  assert.equal(heritageEligibility(sulfur,{...context,pool:'origin',weaponProficiencies:['mar']}).valid,false);
  assert.equal(heritageEligibility(sulfur,{...context,pool:'origin',weaponProficiencies:['pistol']}).valid,true);
  assert.ok(explicitWeaponProficiencies({system:{traits:{}},items:[{type:'weapon',system:{proficient:1,type:{baseItem:'pistol'}}}]},{weapons:[]}).has('pistol'));
});

test('live repeated weapon selections charge each acquisition and limit damage bonuses to two distinct weapons',async()=>{
  globalThis.game={settings:{get:()=>true},user:{isGM:true,id:'gm'},users:{activeGM:{id:'gm'}},time:{worldTime:0},modules:new Map()};
  globalThis.fromUuid=async uuid=>{const d=documents.find(d=>d._id===uuid);return d?{...d,getFlag:(scope,k)=>d.flags?.[scope]?.[k],toObject:()=>structuredClone(d)}:null;};
  const flags={enabled:true,creationDraft:{classUuid:'class'},originSelection:{plan:{origin:'Human',region:'Noxus',heritagePoints:3,regionPoints:2,weapons:[]}}};let sequence=0;
  const actor={uuid:'Actor.weapon-test',isOwner:true,system:{details:{level:1},attributes:{prof:2},abilities:{},skills:{}},items:[],getFlag:(_,key)=>flags[key],update:async updates=>{for(const [k,v]of Object.entries(updates))flags[k.split('.').at(-1)]=structuredClone(v);},createEmbeddedDocuments:async(type,rows)=>{const made=rows.map(d=>({...d,id:'item'+(++sequence)}));actor.items.push(...made);return made;},deleteEmbeddedDocuments:async(type,ids)=>{actor.items=actor.items.filter(i=>!ids.includes(i.id));}};
  const api=createApi(),choice=weapon=>({uuid:source('Discipline is Strength')._id,options:{weapon}}),plan={pool:'region',choices:[choice('longsword'),choice('greataxe')]};
  const result=await api.applyHeritages(actor,plan);assert.equal(result.spent,2);assert.ok(actor.items.every(i=>i.flags.runarcana.heritageWeaponDamage));
  await assert.rejects(api.applyHeritages(actor,{pool:'region',choices:[choice('longsword')]},{overrideReason:'Extra acquisition'}),/Choices/);
  await api.applyHeritages(actor,{pool:'region',choices:[choice('dagger')]},{overrideReason:'Extra regional point'});
  assert.equal(flags.choices.choices.at(-1).weaponDamageBonus,false);assert.equal(actor.items.at(-1).flags.runarcana.heritageWeaponDamage,undefined);
  assert.deepEqual(flags.choices.choices.map(c=>c.options.weapon),['longsword','greataxe','dagger']);
  const hooks=new Map();globalThis.Hooks={on:(name,fn)=>hooks.set(name,fn)};globalThis.CONFIG={DND5E:{activityConsumptionTypes:{},damageTypes:{},healingTypes:{}}};installDnd5eAdapter();
  const activity={actor,type:'attack',item:{type:'weapon',system:{type:{baseItem:'longsword'}},getFlag:()=>3}},config={subject:activity,rolls:[{parts:['1d8','@mod']},{parts:['1d6']}]};
  hooks.get('dnd5e.preRollDamage')(config);hooks.get('dnd5e.preRollDamage')(config);assert.deepEqual(config.rolls.map(r=>r.parts),[['1d8','@mod','2'],['1d6']]);assert.equal(config.critical.multiplier,3);
  actor.system.attributes.prof=4;const later={subject:activity,rolls:[{parts:['1d8']}]};hooks.get('dnd5e.preRollDamage')(later);assert.deepEqual(later.rolls[0].parts,['1d8','4']);
  actor.items=actor.items.filter(i=>i.flags.runarcana.heritageWeaponDamage!=='longsword');const removed={subject:activity,rolls:[{parts:['1d8']}]};hooks.get('dnd5e.preRollDamage')(removed);assert.deepEqual(removed.rolls[0].parts,['1d8']);
});
