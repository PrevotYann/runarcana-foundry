import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';

test('legacy tables preserve fractional CR and split traits without treating unrelated tables as monsters',()=>{
  const script=String.raw`import sys
sys.path.insert(0,'scripts')
from bs4 import BeautifulSoup
from legacy_creatures import legacy_creatures
from creatures import attack_fields,number
row=dict(id='/test/',url='https://wiki.runarcana.org/en/test/')
source='''<div><table><caption><strong>Ignore</strong><em>Price</em></caption><tr><td>10</td></tr></table>
<table><caption><strong>Test</strong><em>Fiend (Umbrinata) Small, Chaotic Evil</em></caption>
<tr><th><strong>Armor Class:</strong>13<strong>Hit Points:</strong>24 (8d6)<strong>Speed:</strong>30 feet, fly 60 feet</th></tr>
<tr><td><strong>STR</strong>8 (-1)</td><td><strong>DEX</strong>13 (+1)</td><td><strong>CON</strong>10 (0)</td><td><strong>INT</strong>10 (0)</td><td><strong>WIS</strong>8 (-1)</td><td><strong>CHA</strong>9 (-1)</td></tr>
<tr><td><strong>Challenge Rating:</strong>&frac14; (50 XP)<strong>Senses:</strong>Darkvision 60 feet</td></tr>
<tr><td><strong>Escape.</strong>Can hide.<strong>Split (Recharge 5-6).</strong>Creates a copy.</td></tr>
<tr><td><strong>Actions</strong></td></tr>
<tr><td><strong>Claws.</strong>Melee Weapon Attack: +3 to hit, 5 ft. reach. Hit: 4 (1d6 + 1) Slashing damage. On a hit, pushes the target.<strong>Dart.</strong>Ranged Weapon Attack: +3 to hit, range 80/250 ft., one target. Hit: 4 (1d6 + 1) Shadow damage.</td></tr></table></div>'''
creatures=legacy_creatures(BeautifulSoup(source,'html.parser'),row,lambda n,u:str(n))
assert len(creatures)==1
c=creatures[0]
assert number(c['tags']['CR'])==0.25 and c['abilities']['str']==8
assert c['extra']['Speed']=='30 feet walking, 60 feet flying'
assert c['extra']['Published Speed']=='30 feet, fly 60 feet'
assert [f['name'] for f in c['features']]==['Escape','Split (Recharge 5-6)','Claws','Dart']
assert c['features'][1]['category']=='Traits'
claws=attack_fields(c['features'][2]);dart=attack_fields(c['features'][3])
assert claws['damageFormula']=='1d6+1' and claws['manualRiders']
assert dart['range']['value']=='80' and '250' in dart['range']['special']
assert dart['damageType']=='shadow'
`;
  const result=spawnSync('python',['-c',script],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});

test('Garden of Shadows generates all eight published monsters with their exact statistics and separate attacks',async()=>{
  const index=JSON.parse(await fs.readFile('data/build-index.json','utf8'));
  const expected={Argoi:[152,14,4,'lg',40],Doombeast:[144,13,3,'lg',40],Duskrider:[176,13,5,'lg',60],Megaera:[434,14,12,'med',45],Nyxie:[24,13,0.25,'sm',30],Archnyx:[45,18,0.5,'med',30],Tyranyx:[70,16,1,'med',30],Stygian:[84,13,2,'sm',20]};
  const rows=index.documents.filter(d=>d.pack==='bestiary'&&d.sourceId.includes('/garden-of-shadows/creatures/'));
  assert.equal(rows.length,8);
  for(const row of rows){
    const actor=JSON.parse(await fs.readFile(`packs-src/release/bestiary/${row.id}.json`,'utf8'));
    const [hp,ac,cr,size,walk]=expected[actor.name];
    assert.equal(actor.system.attributes.hp.max,hp);
    assert.equal(actor.system.attributes.ac.override,ac);
    assert.equal(actor.system.details.cr,cr);
    assert.equal(actor.system.traits.size,size);
    assert.equal(Number(actor.system.attributes.movement.speeds.walk),walk);
    assert.equal(actor.system.details.type.value,'fiend');
    assert.equal(actor.system.details.type.subtype,'Umbrinata');
    assert.equal(actor.flags.runarcana.legacyStatBlock,true);
    assert.equal(actor.flags.runarcana.manualDefenses,true);
    assert.ok(actor.items.some(i=>Object.values(i.system.activities).some(a=>a.type==='attack')),`Missing attack: ${actor.name}`);
    assert.ok(actor.items.every(i=>i.flags.runarcana.manualEffects));
    if(actor.name==='Duskrider')assert.equal(Number(actor.system.attributes.movement.speeds.fly),90);
    if(actor.name==='Megaera')assert.equal(actor.system.abilities.cha.value,18);
  }
});

test('creature conversion preserves flat attacks and leaves conditional riders manual',()=>{
  const script=String.raw`import sys
sys.path.insert(0,'scripts')
from creatures import attack_fields, senses, saving_throws, number
def feature(text,category='Attacks',name='Bite'):return dict(text=text,category=category,name=name)
cat=attack_fields(feature('Melee Natural Weapon Attack, +0 to hit, 5 ft. reach, one target. On a hit, deals 1 (2d2-2) Piercing damage.'))
assert cat['attack']['bonus']=='+0' and cat['attack']['flat']
assert cat['damageFormula']=='2d2-2' and cat['range']['value']=='5'
assert not cat['manualRiders'] and not cat['manualRange']
reverse=attack_fields(feature('Natural Weapon Attack, Melee, +4 to hit, 5 ft. reach. On a hit, deals 6 (1d8+2) Piercing damage.'))
assert reverse['attack']['bonus']=='+4'
firearm=attack_fields(feature('Ranged Firearm Attack, +13 to hit, 60 ft. range. On a hit, deals 20 (3d8+7) Runic damage. This attack has Burst 9.'))
assert firearm['damageType']=='runic' and firearm['manualRiders']
assert attack_fields(feature('Melee Weapon Attack, +4 to hit. On a failed DC 12 saving throw, the target takes 7 (2d6) Poison damage.')) is None
owl=attack_fields(feature('Melee Natural Weapon Attack, +3 to hit, one target. On a hit, deals 2 (1d2+1) Slashing damage.'))
assert owl['manualRange'] and owl['range']['units']=='spec'
conditional=attack_fields(feature('Melee Weapon Attack, +4 to hit, 5 ft. reach. On a hit, deals 6 (1d8+2) Piercing damage. If the target fails a DC 12 save, it takes 7 (2d6) Poison damage.'))
assert conditional['manualRiders'] and conditional['damageFormula']=='1d8+2'
assert attack_fields(feature('Melee Weapon Attack, +4 to hit, 5 ft. reach. On a hit, deals 6 (1d8+2) Unknown damage.')) is None
assert attack_fields(feature('Melee Weapon Attack, +4 to hit. On a hit, deals 6 (1d8+2) Piercing damage.','Characteristics')) is None
reaction=attack_fields(feature('Ranged Spell Attack, +6 to hit, 60/120 ft. range. On a hit, deals 7 (2d6) Fire damage.','Reactions'))
assert reaction['activation']['type']=='reaction' and reaction['attack']['type']['classification']=='spell'
assert reaction['range']['value']=='60' and '120' in reaction['range']['special']
assert senses('120 feet of darkvision. Blindsight 30 feet. Passive perception 12')['ranges']==dict(darkvision=120,blindsight=30)
assert number('1/4')==0.25
creature=dict(abilities=dict(str=14,dex=12),features=[feature('Saving Throws: Strength +4, Dexterity +3','Defenses','Saving Throws'),feature('DC 15 Wisdom saving throw','Attacks')])
abilities=dict(str=dict(value=14),dex=dict(value=12))
saving_throws(creature,abilities)
assert abilities['str']['save']['roll']['bonus']=='2' and abilities['dex']['save']['roll']['bonus']=='2'
assert 'wis' not in abilities
print('Creature source fields verified')`;
  const result=spawnSync('python',['-c',script],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});

test('generated NPCs use the dnd5e 6 roll fields and preserve published statistics',async()=>{
  const index=JSON.parse(await fs.readFile('data/build-index.json','utf8'));
  const coverage=JSON.parse(await fs.readFile('sources/coverage.json','utf8'));
  for(const row of index.documents.filter(d=>d.pack==='bestiary')){
    const actor=JSON.parse(await fs.readFile(`packs-src/release/bestiary/${row.id}.json`,'utf8'));
    assert.equal(actor.type,'npc');
    assert.equal(actor.system.attributes.ac.override,actor.system.attributes.ac.flat);
    const source=actor.flags.runarcana;
    assert.ok(coverage.entries.some(e=>e.id===row.sourceId&&e.documents.includes(`Compendium.runarcana.bestiary.Actor.${row.id}`)),`Untracked creature variant: ${row.sourceId}`);
    assert.equal(actor.system.attributes.ac.override,Number(/\d+/.exec(source.sourceVitals.AC)[0]));
    assert.equal(actor.system.attributes.hp.max,Number(/\d+/.exec(source.sourceVitals.HP)[0]));
    const dexMod=Math.floor((actor.system.abilities.dex.value-10)/2);
    if(source.sourceVitals.Initiative)assert.equal(dexMod+Number(actor.system.attributes.init.roll.bonus),Number(/[+-]?\d+/.exec(source.sourceVitals.Initiative)[0]));
    const passive=/passive\s+perception\s+(\d+)/i.exec(source.sourceExtra.Senses??'');
    if(passive){
      const perception=actor.system.skills.prc;
      const wisMod=Math.floor((actor.system.abilities.wis.value-10)/2);
      assert.equal(10+wisMod+Number(perception.roll.bonus)+Number(perception.bonuses.passive),Number(passive[1]));
    }
    assert.ok(!('bonus' in actor.system.attributes.init));
    for(const skill of Object.values(actor.system.skills))assert.ok(!('check' in (skill.bonuses??{})));
    for(const item of actor.items)for(const activity of Object.values(item.system.activities??{})){
      assert.equal(activity.attack.flat,true);
      assert.equal(activity.attack.ability,'none');
      assert.ok(activity.damage.parts.length>0);
    }
  }
});

test('the summoned Snowman armor supports native summon bonuses',async()=>{
  const index=JSON.parse(await fs.readFile('data/build-index.json','utf8'));
  const row=index.documents.find(d=>d.pack==='companions'&&d.name==='Abominable Snowman');
  assert.ok(row);
  const actor=JSON.parse(await fs.readFile(`packs-src/release/companions/${row.id}.json`,'utf8'));
  assert.equal(actor.system.attributes.ac.flat,19);
  assert.deepEqual(actor.system.attributes.ac.calcs,['natural']);
  assert.equal(actor.system.attributes.ac.override,undefined,'An AC override would discard native summon AC bonus effects.');
});
