import {originEffectStart} from './origin-lifecycle.mjs';
export function weaknessRounds(constitutionModifier,proficiency){return Math.max(0,10-Math.floor(constitutionModifier/2)-proficiency);}
export async function resolveOriginWeakness(actor,job,rollCheck){
  if(!Number.isFinite(job.weaknessDamage)||job.weaknessDamage<=0)return;
  const rounds=weaknessRounds(actor.system.abilities.con.mod,actor.system.attributes.prof);if(!rounds)return;
  const existing=actor.effects.find(e=>e.getFlag?.('runarcana','originWeakness')&&e.getFlag('runarcana','weaknessType')===job.weaknessType&&!e.disabled&&!e.duration?.expired&&(e.duration?.remaining??Infinity)>0);
  if(existing&&job.continuous){await existing.update({start:originEffectStart(),duration:{value:rounds,units:'rounds',expiry:null}});return {refreshed:true};}
  const dc=Math.max(10,Math.floor(job.weaknessDamage/2));
  const rolls=await rollCheck(actor,{kind:'save',key:'con',target:dc,circumstance:'weakness',configure:false});
  const roll=Array.isArray(rolls)?rolls[0]:rolls;if(!roll||!Number.isFinite(roll.total))throw Error('RUNARCANA.Recovery.WeaknessCancelled');
  if(roll.total>=dc)return {success:true,dc};
  const changes=['system.rolls.attack.mode','system.rolls.ability.check.mode','system.rolls.ability.skill.mode','system.rolls.ability.tool.mode'].map((key,i)=>({_id:'rcWeakC'+String(i).padStart(9,'0'),key,value:'-1',type:'add',phase:'initial',priority:30}));
  if(existing)await existing.update({start:originEffectStart(),duration:{value:rounds,units:'rounds',expiry:null},'system.changes':changes});
  else await actor.createEmbeddedDocuments('ActiveEffect',[{name:'Origin Weakness',type:'base',transfer:false,disabled:false,start:originEffectStart(),duration:{value:rounds,units:'rounds',expiry:null},system:{changes},flags:{runarcana:{originTemporary:true,originWeakness:true,weaknessType:job.weaknessType}}}]);
  return {success:false,dc,rounds};
}
