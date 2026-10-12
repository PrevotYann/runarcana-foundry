import {REGIONAL_RULES,EQUIPMENT_WEAPONS} from './generated/character-options.mjs';
export {REGIONAL_RULES,EQUIPMENT_WEAPONS};
export function regionalWeaponAllowed(weapon,group,region){
  return (group.weapons.includes(weapon.id)||group.categories.includes(weapon.category))&&(!weapon.regions?.length||weapon.regions.includes(region));
}

export function applyRegionalChoices(plan,selection,{native=false}={}) {
  const rules=REGIONAL_RULES[plan.region];
  if(!rules){plan.regionalReviewRequired=true;return;}
  const fail=()=>{throw new Error('RUNARCANA.Error.Choices');};
  if(!selection||!rules.skills.includes(selection.skill))fail();
  const prior=plan.skills[selection.skill]??0;
  plan.skills[selection.skill]=Math.max(prior,1);
  if(!native){
    plan.languages.push(...rules.languages.fixed);
    if(rules.languages.choices.length){if(!rules.languages.choices.includes(selection.language))fail();plan.languages.push(selection.language);}
  }
  const selected=new Set();
  for(const group of rules.groups){
    const choices=selection.activities?.[group.id];if(!Array.isArray(choices)||choices.length!==group.count)fail();
    for(const c of choices){
      if(c.kind==='weapon'){
        const weapon=EQUIPMENT_WEAPONS.find(w=>w.id===c.id);
        if(!weapon||!regionalWeaponAllowed(weapon,group,plan.region))fail();
        if(selected.has('weapon:'+c.id))throw new Error('RUNARCANA.Error.DuplicateChoice');selected.add('weapon:'+c.id);
        plan.weapons??=[];plan.weapons.push(c.id);
      }else if(c.kind==='craft'){
        if(!group.crafts.includes(c.id))fail();
        const needsDetail=['Minor craft','Craft','Forger discipline'].includes(c.id)||c.id.includes(':');
        if(needsDetail&&(typeof c.specialty!=='string'||!c.specialty.trim()||c.specialty.length>100))fail();
        const name=needsDetail?`${c.id}: ${c.specialty.trim()}`:c.id;
        if(selected.has('craft:'+name))throw new Error('RUNARCANA.Error.DuplicateChoice');selected.add('craft:'+name);
        plan.customProficiencies.push(name);
      }else fail();
    }
  }
  plan.regionalRules={sourceUrl:rules.sourceUrl,sourceHash:rules.sourceHash,selection};
}
