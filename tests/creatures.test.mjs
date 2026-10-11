import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';

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
