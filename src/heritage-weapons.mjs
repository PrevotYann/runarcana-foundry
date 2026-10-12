import {EQUIPMENT_WEAPONS,REGIONAL_RULES} from './generated/character-options.mjs';
export function heritageWeaponOptions(rules,{region}={}){
  const kind=rules.mechanics?.weaponChoice?.kind;
  return EQUIPMENT_WEAPONS.filter(w=>{
    if(kind==='any')return true;
    if(kind==='firearm')return w.category==='firearm';
    if(kind==='regional')return w.regions?.length>0;
    if(kind==='regionalMartial')return (REGIONAL_RULES[region]||region==='Kumungu')&&w.category==='martial'&&(!w.regions?.length||w.regions.includes(region));
    return false;
  });
}
export function heritageWeaponSelection(rules,options,context={}){
  const choice=rules.mechanics?.weaponChoice;
  if(!choice)return {valid:!options.weapon};
  const weapon=heritageWeaponOptions(rules,context).find(w=>w.id===options.weapon);
  return {valid:!!weapon&&(!choice.distinct||!context.previousWeapons?.includes(weapon.id)),weapon:weapon?.id};
}
export function explicitWeaponProficiencies(actor,origin){
  const ids=new Set([...(actor.system.traits?.weaponProf?.value??[]),...(origin.weapons??[])]);
  for(const item of actor.items)if(item.type==='weapon'&&item.system.proficient>=1&&item.system.type?.baseItem)ids.add(item.system.type.baseItem);
  return ids;
}
export function hasFirearmProficiency(ids){return EQUIPMENT_WEAPONS.some(w=>w.category==='firearm'&&ids?.includes(w.id));}
export function disciplineDamageBonus(actor,item){
  const weapon=item?.system.type?.baseItem;if(!weapon)return 0;
  // Read owned granted Items so removing the heritage also removes its damage benefit.
  return actor.items.some(i=>i.getFlag?.('runarcana','heritageWeaponDamage')===weapon||i.flags?.runarcana?.heritageWeaponDamage===weapon)?Math.max(0,actor.system.attributes?.prof??0):0;
}
