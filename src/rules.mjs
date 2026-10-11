/** Pure rules with no Foundry dependencies. Source links are in docs/rule-differences.md. */
export const MANA_COST = Object.freeze([0, 2, 3, 5, 6, 7, 9, 12, 16, 21]);
export function manaCost(level) {
  if (!Number.isInteger(level) || level < 0 || level > 9) throw new RangeError('RUNARCANA.Error.SpellLevel');
  return MANA_COST[level];
}
export function resourceValue(resource, delta) {
  if (!resource || !Number.isFinite(resource.value) || !Number.isFinite(resource.max) || resource.max < 0
    || resource.value < 0 || resource.value > resource.max || !Number.isFinite(delta)) throw new Error('RUNARCANA.Error.Resource');
  if (resource.value + delta < 0) throw new Error('RUNARCANA.Error.InsufficientResource');
  return Math.min(resource.max, resource.value + delta);
}
export function scaleDice(number, denomination, steps=1) {
  const ladder=[1,2,3,4,6,8,10,12];
  if (!Number.isInteger(number) || number < 1 || !ladder.includes(denomination) || !Number.isInteger(steps) || steps < 0)
    throw new RangeError('RUNARCANA.Error.Dice');
  let index=ladder.indexOf(denomination)+steps;
  if(index<ladder.length) return ladder[index]===1 ? String(number) : `${number}d${ladder[index]}`;
  index-=ladder.length;
  const extra=[4,6,8,10,12];
  const whole=Math.floor(index/extra.length), last=extra[index%extra.length];
  return [`${number}d12`, ...Array(whole).fill('1d12'), `1d${last}`].join(' + ');
}
export const MAGIC_BASE = Object.freeze({antimonic:'acid',plasma:'lightning',runic:'force',glacial:'cold',incinerating:'fire',luminary:'radiant',lunar:'radiant',noctiferous:'shadow',vibrational:'thunder',intoxicating:'poison',lacerating:'slashing',incisive:'piercing',crushing:'bludgeoning',disruptive:'force',gravitational:'bludgeoning',cronal:'force'});
export function traitApplies(types, type, kind) {
  const set=new Set(types ?? []);
  if(set.has(type)) return true;
  // Resistance/immunity/absorption to a magic variant applies to its simple base.
  if(['resistance','immunity','absorption'].includes(kind)) return [...set].some(t=>MAGIC_BASE[t]===type);
  // Vulnerability to a base applies to its magic variant, not conversely.
  return kind==='vulnerability' && set.has(MAGIC_BASE[type]);
}
export function damageComponents(parts, defenses={}, context={}) {
  return parts.map(part=>{
    if(!Number.isFinite(part.value) || part.value<0) throw new Error('RUNARCANA.Error.Damage');
    const out={...part,value:part.value,applied:[]};
    const reduction=defenses.reduction?.[part.type] ?? 0;
    if(!Number.isFinite(reduction) || reduction<0) throw new Error('RUNARCANA.Error.Damage');
    out.value=Math.max(0,out.value-reduction);
    if(reduction) out.applied.push('reduction');
    if(traitApplies(defenses.absorption,part.type,'absorption')) {
      const eligible=typeof context.sourceActorUuid==='string' && context.sourceActorUuid.length>0 && context.sourceActorUuid!==context.targetActorUuid && (!context.isSpell || context.spellLevel>=1) && !context.continuous;
      out.value=eligible ? -Math.floor(out.value/2) : 0; out.applied.push(eligible?'absorption':'immunity');
    } else if(traitApplies(defenses.immunity,part.type,'immunity')) {out.value=0;out.applied.push('immunity');}
    else {
      if(traitApplies(defenses.resistance,part.type,'resistance')) {out.value=Math.floor(out.value/2);out.applied.push('resistance');}
      if(traitApplies(defenses.vulnerability,part.type,'vulnerability')) {out.value*=2;out.applied.push('vulnerability');}
    }
    return out;
  });
}
export function validateChoices({budget, choices, actor={}}) {
  if(!Number.isFinite(budget) || budget<0 || !Array.isArray(choices)) throw new Error('RUNARCANA.Error.Choices');
  const errors=[], seen=new Set(); let spent=0;
  for(const choice of choices) {
    if(!choice.id || seen.has(choice.id)) errors.push('RUNARCANA.Error.DuplicateChoice');
    seen.add(choice.id);
    if(!Number.isFinite(choice.cost) || choice.cost<0) errors.push('RUNARCANA.Error.Cost');
    else spent+=choice.cost;
    for(const req of choice.prerequisites ?? []) {
      if(req.type==='choice' && !choices.some(c=>c.id===req.id)) errors.push('RUNARCANA.Error.Prerequisite');
      else if(req.type==='level' && (actor.level??0)<req.min) errors.push('RUNARCANA.Error.Prerequisite');
      else if(req.type==='ability' && (actor.abilities?.[req.ability]??0)<req.min) errors.push('RUNARCANA.Error.Prerequisite');
      else if(!['choice','level','ability'].includes(req.type)) errors.push('RUNARCANA.Error.ManualPrerequisite');
    }
  }
  if(spent>budget) errors.push('RUNARCANA.Error.Budget');
  return {valid:errors.length===0,errors:[...new Set(errors)],spent,remaining:budget-spent};
}
export function creatureStatistics({cr,role,size,constitution=10,threatLevel,minionDice=1}) {
  if(!Number.isInteger(cr) || cr<1 || cr>30 || !Number.isInteger(constitution) || constitution<1) throw new Error('RUNARCANA.Error.Creature');
  const die={diminutive:2,tiny:4,small:6,medium:8,large:10,huge:12,gargantuan:20,colossal:20}[size];
  const roleMultiplier={grunt:1,soldier:2,elite:3,paragon:threatLevel}[role];
  if(!die || (!roleMultiplier && role!=='minion') || (role==='paragon' && (!Number.isFinite(threatLevel) || threatLevel<=0)) || ![1,2].includes(minionDice)) throw new Error('RUNARCANA.Error.Creature');
  const proficiency=2+Math.floor((cr-1)/4), conMod=Math.floor((constitution-10)/2);
  const dice=role==='minion' ? minionDice : roleMultiplier*(cr+proficiency);
  if(!Number.isInteger(dice)) throw new Error('RUNARCANA.Error.Creature');
  // The published size table uses floor((die+1)/2), not the D&D expected average.
  const hp=Math.max(1,dice*Math.floor((die+1)/2)+proficiency*conMod);
  return {proficiency,hitDice:`${dice}d${die} + ${proficiency*conMod}`,hp,initiativeBonus:role==='elite'?proficiency/2:role==='paragon'?proficiency:0,
    runeLevels:[1,2,6,10,14,18,22,26,30].filter(n=>n<=cr)};
}
