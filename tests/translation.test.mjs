import test from 'node:test';
import assert from 'node:assert/strict';
import {translateText,babeleConverters} from '../src/translation.mjs';
const source={_id:'fixedDocument001',name:'Validation fixture',type:'spell',system:{level:1,description:{value:'<p>Full English description. @UUID[Compendium.runarcana.spells.Item.fixedDocument001]{Fixture}</p>'},activities:{fixedActivity001:{_id:'fixedActivity001',name:'Cast',description:{value:'Full activity body'},damage:{parts:[{custom:{formula:'1d6'}}]}}},advancement:[{_id:'fixedAdvance0001',title:'Choice',configuration:{identifier:'mechanical-id'}}]},effects:[{_id:'fixedEffect00001',name:'Effect',changes:[{key:'system.attributes.ac.bonus',value:'1'}]}]};
test('spell text and activity names translate; formulas, IDs, UUID targets are protected',()=>{
  const translated=translateText(source,{name:'Validation',_id:'evil',system:{level:9,description:{value:'<p>Description française. @UUID[Compendium.runarcana.spells.Item.fixedDocument001]{Validation}</p>'},activities:{fixedActivity001:{name:'Lancer',description:{value:'Corps complet'},damage:{parts:[]}}}},effects:{fixedEffect00001:{name:'Effet',changes:[]}}});
  assert.equal(translated._id,source._id);assert.equal(translated.system.level,1);
  assert.equal(translated.system.activities.fixedActivity001.name,'Lancer');
  assert.deepEqual(translated.system.activities.fixedActivity001.damage,source.system.activities.fixedActivity001.damage);
  assert.equal(translated.effects[0].name,'Effet');assert.deepEqual(translated.effects[0].changes,source.effects[0].changes);
  assert.match(translated.system.description.value,/Compendium.runarcana.spells.Item.fixedDocument001/);
});
test('class advancement labels translate without changing identifiers',()=>{
  const result=translateText({...source,type:'class'},{system:{advancement:{fixedAdvance0001:{title:'Choix',configuration:{identifier:'translated-id'}}}}});
  assert.equal(result.system.advancement[0].title,'Choix');assert.equal(result.system.advancement[0].configuration.identifier,'mechanical-id');
});
test('NPC embedded items and biography use ID lookup and English fallback',()=>{
  const npc={_id:'npc',name:'NPC',system:{details:{biography:{value:'Biography'}}},items:[source,{_id:'other',name:'English fallback',system:{description:{value:'Full fallback'}}}]};
  const result=translateText(npc,{system:{details:{biography:{value:'Biographie'}}},items:{fixedDocument001:{name:'Capacité',system:{description:{value:'Description complète'}}}}});
  assert.equal(result.items[0].name,'Capacité');assert.equal(result.items[1].name,'English fallback');assert.equal(result.system.details.biography.value,'Biographie');
});
test('multipage journal titles and full bodies; table result descriptions',()=>{
  const journal={pages:[{_id:'one',name:'One',text:{content:'Complete page one',format:1}},{_id:'two',name:'Two',text:{content:'Complete page two',format:1}}]};
  const result=translateText(journal,{pages:{one:{name:'Un',text:{content:'Page complète un',format:99}}}});
  assert.equal(result.pages[0].text.content,'Page complète un');assert.equal(result.pages[0].text.format,1);assert.equal(result.pages[1].text.content,'Complete page two');
  const table=translateText({formula:'1d20',results:[{_id:'row',description:'English',range:[1,5]}]},{formula:'1d100',results:{row:{description:'Français',range:[1,100]}}});
  assert.equal(table.results[0].description,'Français');assert.deepEqual(table.results[0].range,[1,5]);assert.equal(table.formula,'1d20');
});
test('Babele converter signature preserves nested arrays and sparse translations',()=>{
  const converted=babeleConverters().runarcanaNested([source],{fixedDocument001:{name:'Validation'}});
  assert.equal(converted[0].name,'Validation');assert.equal(converted[0].system.description.value,source.system.description.value);
});
test('a translation that changes or removes UUID targets falls back to the English field',()=>{
  const result=translateText(source,{system:{description:{value:'<p>@UUID[Compendium.runarcana.spells.Item.wrongId]{Wrong}</p>'}}});
  assert.equal(result.system.description.value,source.system.description.value);
});
