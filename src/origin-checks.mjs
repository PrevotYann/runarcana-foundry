/** Situational origin modifiers apply to a declared circumstance, never to unrelated rolls. */
export const ORIGIN_CIRCUMSTANCES=['ordinary','forcedMovement','brightLight','respiratoryPoison','extremeCold','extremeHeat','mundaneDisease','magicalSleep','poisonFormula','sandyRegion','hearing','smell','sight','surprise','rootedDisguise','weakness'];
export function originRollModifiers(plan,kind,key,{circumstance='ordinary',proficiency=0,poisonLevel,properEquipment=false,alreadyAdvantage=false,saveMultiplier=0}={}){
  if(!ORIGIN_CIRCUMSTANCES.includes(circumstance)||!['save','skill','check'].includes(kind))throw Error('RUNARCANA.Error.Choices');
  const result={advantage:false,disadvantage:false,bonus:0,immune:false};
  const construct=plan.origin==='Construct'||plan.constructed;
  if(kind==='save'){
    if((construct&&['mundaneDisease','magicalSleep'].includes(circumstance))||(plan.origin==='Yordle'&&plan.variant==='Faeric'&&circumstance==='magicalSleep'))result.immune=true;
    if(plan.origin==='Troll'&&((plan.variant==='Sand Troll'&&circumstance==='extremeHeat')||(plan.variant==='Ice Troll'&&circumstance==='extremeCold')))result.immune=true;
    if(plan.origin==='Chireans'&&plan.variant==='Nocti'&&['brightLight','respiratoryPoison'].includes(circumstance))result.disadvantage=true;
    if(plan.origin==='Minotaur'&&plan.variant==='Alnuk'&&circumstance==='extremeCold')result.advantage=true;
    if(construct&&['extremeCold','extremeHeat'].includes(circumstance)){if(!properEquipment)result.disadvantage=true;if(plan.variant==='Envoy')result.advantage=true;}
    if(plan.selectedOptions?.some(o=>o.name==='Oak')&&circumstance==='forcedMovement')result.advantage=true;
    if(circumstance==='weakness'&&plan.weaknessProficiency===2)result.bonus+=proficiency*saveMultiplier;
    if(circumstance==='poisonFormula'){
      if(!Number.isInteger(poisonLevel)||poisonLevel<0)throw Error('RUNARCANA.Error.Choices');
      const resistance=construct,immunity=plan.origin==='Troll'&&plan.variant==='Jungle Troll';
      if(immunity&&poisonLevel<=proficiency)result.immune=true;
      else if(resistance&&poisonLevel<=proficiency){result.advantage=true;if(alreadyAdvantage)result.bonus+=1;}
      if(plan.immunity?.includes('poison'))result.bonus+=2*proficiency;
      else if(plan.resistance?.includes('poison'))result.bonus+=proficiency;
    }
  }
  if(kind==='skill'){
    if(key==='ste'&&plan.origin==='Troll'&&plan.variant==='Sand Troll'&&circumstance==='sandyRegion')result.advantage=true;
    if(key==='prc'&&plan.origin==='Vastaya'&&plan.variant==='Kiilash'&&['hearing','smell'].includes(circumstance))result.advantage=true;
    if(key==='prc'&&plan.origin==='Minotaur'&&plan.variant==='Aelus'&&circumstance==='surprise')result.advantage=true;
    if(key==='prc'&&plan.sharpSenses?.includes(circumstance))result.advantage=true;
    if(key==='dec'&&plan.origin==='Antroplantae'&&circumstance==='rootedDisguise')result.advantage=true;
  }
  return result;
}
