/** Native dnd5e 6 natural weapons derived only from the reviewed origin profile. */
export function naturalWeapon(definition,{level=1,canonicalId,sourceUrl,sourceHash}={}) {
  const d={...definition,...(definition.upgrade&&level>=definition.upgrade.level?definition.upgrade:{})};
  const base={number:d.number,denomination:d.denomination,types:[d.damageType],bonus:d.bonus??'',custom:{enabled:false},scaling:{number:1}};
  // Native weapon damage adds @mod. An explicit zero coefficient keeps a no-modifier formula literal.
  if(d.noDamageAbility)base.bonus=[base.bonus,'0 * @mod'].filter(Boolean).join(' + ');
  const activities={};
  for(const type of d.bonusAction?['action','bonus']:['action']){
    const id=type==='action'?'rcNaturalAttack1':'rcNaturalAttack2';
    activities[id]={_id:id,name:d.name+(type==='bonus'?' (bonus action)':''),type:'attack',activation:{type,value:1,condition:type==='bonus'?d.bonusCondition??'':''},attack:{ability:d.ability??'str',flat:false,type:{value:'melee',classification:'weapon'},critical:{threshold:d.criticalThreshold??20}},damage:{includeBase:true,parts:[]},range:{override:true,units:'ft',value:String(d.reach??5)},target:{override:true,affects:{type:'creature',count:'1'},template:{type:''},prompt:true}};
  }
  const flags={originManaged:true,originWeapon:definition.id,originWeaponMagical:Boolean(d.magical),weaponDefinition:definition,canonicalId:canonicalId?canonicalId+'#natural-weapon-'+definition.id:undefined,sourceUrl,sourceHash};
  if(d.criticalMultiplier)flags.criticalMultiplier=d.criticalMultiplier;
  return {name:d.name,type:'weapon',img:'icons/svg/sword.svg',system:{type:{value:'natural'},equipped:true,proficient:1,range:{reach:d.reach??5,units:'ft'},properties:d.magical?['mgc']:[],damage:{base},activities},flags:{runarcana:flags}};
}
