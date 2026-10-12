/** V14 duration data and origin-only temporary effects/items. */
export function originEffectStart(){const combat=game.combat;return {time:game.time.worldTime,combat:combat?.id??null,round:combat?.round??null,turn:combat?.turn??null,combatant:combat?.combatant?.id??null,initiative:combat?.combatant?.initiative??null};}
export function originDuration(definition,actor){
  if(definition.seconds)return {value:definition.seconds,units:'seconds',expiry:null};
  const combat=game.combat,combatant=combat?.getCombatantsByActor?.(actor)?.[0];
  if(!combatant)return {value:(definition.rounds??2)*6,units:'seconds',expiry:null};
  if(definition.turns)return {value:0,units:'rounds',expiry:'sourceTurnEnd'};
  const index=combat.turns.findIndex(c=>c.id===combatant.id);
  return {value:Math.max(0,(definition.rounds??1)-1+(combat.turn>index?1:0)),units:'rounds',expiry:'sourceTurnEnd'};
}
export function originTemporaryEffect(power,actor){
  const template=power.effects?.contents?.[0]??power.effects?.[0];
  if(!template)throw Error('RUNARCANA.Error.Source');
  const data=template.toObject?template.toObject():structuredClone(template);
  delete data._id;delete data._key;
  data.origin=power.uuid;data.start=originEffectStart();data.duration=originDuration(power.getFlag('runarcana','originPower'),actor);
  data.system.origin={actor:actor.uuid,item:power.uuid};
  data.flags.runarcana.sourceActorUuid=actor.uuid;
  return data;
}
export async function expireOriginArtifacts(actor,{deletedEffect,event='updateWorldTime',context={}}={}){
  const expired=deletedEffect?[deletedEffect]:[...actor.effects].filter(e=>e.getFlag?.('runarcana','originTemporary')&&(e.duration?.expired||Number.isFinite(e.duration?.remaining)&&e.duration.remaining<=0&&(!e.duration.expiry||e.isExpiryEvent?.(event,context))));
  for(const effect of expired){
    const followup=effect.getFlag('runarcana','followup'),powerId=effect.getFlag('runarcana','originPower');
    const power=actor.items.find(i=>i.getFlag?.('runarcana','originPower')?.id===powerId);
    if(!deletedEffect)await actor.deleteEmbeddedDocuments('ActiveEffect',[effect.id],{runarcanaExpiryHandled:true});
    if(followup&&power){
      const data={name:power.name+' - Overheated',type:'base',origin:power.uuid,transfer:false,start:originEffectStart(),duration:originDuration(followup,actor),system:{origin:{actor:actor.uuid,item:power.uuid},changes:followup.changes.map(([key,value,type],i)=>({_id:'rcAfterC'+String(i).padStart(8,'0'),key,value:String(value),type,phase:'initial',priority:30}))},flags:{runarcana:{originTemporary:true,originPower:powerId,sourceActorUuid:actor.uuid}}};
      await actor.createEmbeddedDocuments('ActiveEffect',[data]);
    }
  }
  const items=actor.items.filter(i=>i.getFlag?.('runarcana','originExpires')!==undefined&&i.getFlag('runarcana','originExpires')<=game.time.worldTime);
  if(items.length)await actor.deleteEmbeddedDocuments('Item',items.map(i=>i.id));
}
