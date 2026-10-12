import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {LANGUAGES,ooviLanguages,languageChoices} from '../src/languages.mjs';
import {heritageOptions,heritageEffects} from '../src/heritage.mjs';
import {heritageTools} from '../src/crafts.mjs';
import {createApi} from '../src/api.mjs';
const rows=(await Promise.all((await fs.readdir('packs-src/release/heritages')).map(async f=>JSON.parse(await fs.readFile('packs-src/release/heritages/'+f,'utf8'))))).filter(d=>d.flags?.runarcana?.heritageRules);
const find=name=>rows.find(d=>d.name===name),rule=name=>find(name).flags.runarcana.heritageRules;
const shepherd=rows.find(d=>d.name.startsWith('Mountain')&&d.name.includes('Shepherd')).flags.runarcana.heritageRules;

test('published ritual cantrip keeps level zero, ritual property and its one-hour casting time',async()=>{
  const spells=await Promise.all((await fs.readdir('packs-src/release/spells')).map(async f=>JSON.parse(await fs.readFile('packs-src/release/spells/'+f,'utf8'))));
  const familiar=spells.find(d=>d.name==='Summon Familiar');assert.equal(familiar.system.level,0);
  assert.ok(familiar.system.properties.includes('ritual'));assert.equal(familiar.system.activation.type,'hour');assert.equal(familiar.system.activation.value,1);
});

test('language catalog preserves the three published tables and Oovi-Kat language alternatives',()=>{
  assert.deepEqual(['common','exotic','dead'].map(category=>LANGUAGES.filter(l=>l.category===category).length),[13,14,7]);
  assert.deepEqual(ooviLanguages(['Celestial']),['Celestial']);assert.deepEqual(ooviLanguages(['Buhru','Minotauric']),['Buhru','Minotauric']);
  for(const values of [['Buhru'],['Celestial','Draconic'],['Buhru','Celestial'],['Buhru','Buhru'],['Old Ionian'],['invented']])assert.equal(ooviLanguages(values),null);
  assert.equal(ooviLanguages(['Minotauric','Buhru'],['Minotaur']),null);
  assert.equal(languageChoices(['Zaunite'],{count:1,category:'common',known:['Piltovan']}),null);
});

test('Extrovert requires a new common language while retaining its History expertise',()=>{
  const r=rule('Extrovert');assert.equal(heritageOptions(r).valid,false);
  assert.equal(heritageOptions(r,{languages:['Celestial']}).valid,false);
  assert.equal(heritageOptions(r,{languages:['Yordle']},{languages:['Yordle']}).valid,false);
  const options={languages:['Buhru']};assert.equal(heritageOptions(r,options,{languages:['Yordle']}).valid,true);
  const changes=heritageEffects(r,{skills:{his:1},options})[0].system.changes;
  assert.ok(changes.some(c=>c.key==='system.skills.his.value'&&c.value==='2'));
  assert.ok(changes.some(c=>c.key==='system.traits.languages.custom'&&c.value==='; Buhru'&&c.type==='add'));
});

test('Shepherd restricts training to Apothecary or published land-pilot examples; Musician expertise is conditional',()=>{
  const pilot={training:[{kind:'craft',id:'guide-pilot',specialty:'Cart'}]},apothecary={training:[{kind:'craft',id:'apothecary'}]};
  assert.equal(heritageOptions(shepherd,pilot).valid,true);assert.equal(heritageOptions(shepherd,apothecary).valid,true);
  assert.equal(heritageOptions(shepherd,{training:[{kind:'craft',id:'guide-pilot',specialty:'Boat'}]}).valid,false);
  assert.equal(heritageOptions(shepherd,{training:[{kind:'craft',id:'cook'}]}).valid,false);
  assert.ok(heritageEffects(shepherd,{skills:{ani:1},options:pilot})[0].system.changes.some(c=>c.key==='system.skills.ani.value'&&c.value==='2'));
  const r=rule('Prodigy Musician');assert.equal(heritageTools(r,{})[0].system.proficient,0.5);
  assert.equal(heritageTools(r,{}, {known:[{id:'artist-musician',multiplier:0.5}]})[0].system.proficient,1);
  assert.equal(heritageTools(r,{}, {known:[{id:'artist-musician',multiplier:1}]})[0].system.bonus,'1');
  assert.equal(heritageTools(r,{})[0].system.ability,'cha');
});

test('live language acquisition revalidates known dialects and rolls back failed combined grants',async()=>{
  globalThis.game={settings:{get:()=>true},user:{isGM:true,id:'gm'},users:{activeGM:{id:'gm'}},time:{worldTime:0},modules:new Map()};
  globalThis.fromUuid=async uuid=>{const d=rows.find(d=>d._id===uuid);return d?{...d,getFlag:(scope,k)=>d.flags?.[scope]?.[k],toObject:()=>structuredClone(d)}:null;};
  const flags={enabled:true,originSelection:{plan:{origin:'Yordle',region:'Noxus',heritagePoints:3,regionPoints:2,languages:['Yordle']}}};let sequence=0;
  const actor={uuid:'Actor.language-test',isOwner:true,system:{details:{level:1},abilities:{},skills:{his:{value:1}},traits:{languages:{value:new Set(),custom:'Piltovan'}}},items:[],getFlag:(_,key)=>flags[key],update:async updates=>{for(const [k,v]of Object.entries(updates))flags[k.split('.').at(-1)]=structuredClone(v);},createEmbeddedDocuments:async(type,rows)=>{const made=rows.map(d=>({...d,id:'item'+(++sequence)}));actor.items.push(...made);return made;},deleteEmbeddedDocuments:async(type,ids)=>{actor.items=actor.items.filter(i=>!ids.includes(i.id));}};
  const api=createApi(),choice={uuid:find('Extrovert')._id,options:{languages:['Zaunite']}},plan={pool:'origin',choices:[choice]};
  await assert.rejects(api.applyHeritages(actor,plan,{overrideReason:'GM ruling'}),/Choices/);
  choice.options.languages=['Buhru'];plan.choices.push({uuid:find('Prodigy Musician')._id});
  const persist=actor.update;actor.update=async()=>{throw Error('persist failed');};await assert.rejects(api.applyHeritages(actor,plan),/persist failed/);assert.equal(actor.items.length,0);assert.equal(flags.choices,undefined);actor.update=persist;
  await api.applyHeritages(actor,plan);assert.deepEqual(flags.choices.choices[0].options.languages,['Buhru']);assert.equal(actor.items.filter(i=>i.type==='tool').length,1);
  assert.ok(actor.items[0].effects[0].system.changes.some(c=>c.key==='system.traits.languages.custom'&&c.value==='; Buhru'));
});
