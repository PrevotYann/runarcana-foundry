/** Published Troll recovery; acid/fire wounds remain separate from regenerable HP. */
import {MAGIC_BASE} from './rules.mjs';
export function originWeaknessTypes(plan){
  const types=[];
  if(plan.origin==='Antroplantae')types.push('fire');
  if(plan.elementalDefense)types.push(plan.elementalDefense[2]);
  for(const type of [...types])for(const [magic,base]of Object.entries(MAGIC_BASE))if(base===type)types.push(magic);
  for(const weakness of plan.weaknesses??[])if(weakness.type)types.push(weakness.type);
  return [...new Set(types)];
}
export function regenerationAvailable(hp,blocked=0){return Math.max(0,hp.max-hp.value-Math.max(0,blocked));}
export function damageRecoveryFacts(plan,parts,{amount,hpBefore,hpAfter,hpMax,material,unregenerableHP,treatment=false}={}){
  const lost=Math.max(0,hpBefore-hpAfter),elemental=parts.filter(p=>['fire','acid','incinerating','antimonic'].includes(p.type)&&p.value>0).reduce((n,p)=>n+p.value,0);
  if(unregenerableHP!==undefined&&(!Number.isInteger(unregenerableHP)||unregenerableHP<0||unregenerableHP>lost))throw Error('RUNARCANA.Error.Choices');
  const weak=parts.filter(p=>originWeaknessTypes(plan).includes(p.type)&&p.value>0);
  const materialWeakness=typeof material==='string'&&(plan.weaknesses??[]).some(w=>w.material===material);
  return {blocked:plan.origin==='Troll'?Math.min(lost,unregenerableHP??elemental):0,treated:plan.origin==='Troll'&&treatment?Math.max(0,hpAfter-hpBefore):0,weaknessDamage:weak.length||materialWeakness?Math.max(0,amount):0,weaknessType:weak[0]?.type??(materialWeakness?'material:'+material:null),deferTrollDowned:plan.origin==='Troll'&&hpBefore>0&&hpAfter===0&&amount<hpBefore+hpMax};
}
export async function processRecoveryDamage(actor,job){
  if(!job||job.actor!==actor.uuid||typeof job.id!=='string'||!Number.isFinite(job.blocked)||job.blocked<0||!Number.isFinite(job.treated)||job.treated<0)throw Error('RUNARCANA.Error.Source');
  const state=structuredClone(actor.getFlag('runarcana','originLife')??{blocked:0,turns:0,lastTime:game.time.worldTime,processed:[]});
  if(state.processed.includes(job.id))return state;
  state.blocked=Math.max(0,state.blocked+job.blocked-job.treated);
  state.blocked=Math.max(0,Math.min(actor.system.attributes.hp.max-actor.system.attributes.hp.value,state.blocked));
  if(job.deferTrollDowned)state.awaitingTurn=true;
  state.processed=[...state.processed,job.id].slice(-100);
  await actor.update({'flags.runarcana.originLife':state,...(actor.getFlag('runarcana','pendingOriginDamage')?.id===job.id?{'flags.runarcana.pendingOriginDamage':null}:{})});
  return state;
}
export async function advanceTrollRecovery(actor,{turnKey,combatId,now=game.time.worldTime}={}){
  const plan=actor.getFlag('runarcana','originSelection')?.plan;if(plan?.origin!=='Troll')return;
  const previous=actor.getFlag('runarcana','originLife');
  const state=structuredClone(previous??{blocked:0,turns:0,lastTime:now,processed:[]});
  if(!previous&&!turnKey){await actor.update({'flags.runarcana.originLife':state});return {healed:0,state};}
  const hp=actor.system.attributes.hp,prof=actor.system.attributes.prof,updates={};let heal=0;
  if(actor.statuses?.has('dead'))return;
  if(turnKey){
    if(state.lastTurnKey===turnKey)return;
    if(state.combatId!==combatId){state.turns=0;state.combatId=combatId;}
    state.lastTurnKey=turnKey;state.turns++;
    if(state.turns>=Math.max(1,10-prof)){heal=prof;state.turns=0;}
    state.lastTime=now;
  }else if(!actor.inCombat){
    const hours=Math.max(0,Math.floor((now-state.lastTime)/3600));if(!hours)return;
    state.lastTime+=hours*3600;heal=hours*Math.max(0,actor.system.abilities.con.mod);
  }else return;
  const actual=Math.min(regenerationAvailable(hp,state.blocked),heal);
  if(actual>0)updates['system.attributes.hp.value']=hp.value+actual;
  state.awaitingTurn=false;updates['flags.runarcana.originLife']=state;
  await actor.update(updates);
  if(turnKey&&hp.value+actual===0){const effect=await actor.toggleStatusEffect('unconscious',{active:true});if(effect?.setFlag)await effect.setFlag('dnd5e','autoDowned',true);}
  return {healed:actual,state};
}
