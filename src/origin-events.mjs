/** Origin lifetime events use the primary GM for cross-client document mutations. */
export function installOriginEvents(){
  const primary=()=>game.user?.isGM&&game.users.activeGM?.id===game.user.id;
  const api=()=>game.modules?.get('runarcana')?.api;
  const actors=()=>{
    const rows=new Map([...(game.actors??[])].map(a=>[a.uuid,a]));
    for(const scene of game.scenes??[])for(const token of scene.tokens??[])if(token.actor)rows.set(token.actor.uuid,token.actor);
    return [...rows.values()];
  };
  const sweep=(event='updateWorldTime',context={})=>{
    if(!primary())return;
    for(const actor of actors()){
      api()?.expireOriginArtifacts(actor,{event,context}).catch(e=>console.error('Runarcana origin lifetime',e));
      if(actor.getFlag('runarcana','enabled')&&actor.getFlag('runarcana','originSelection')?.plan.origin==='Troll')api()?.advanceTrollRecovery(actor).catch(e=>console.error('Runarcana Troll recovery',e));
    }
  };
  Hooks.on('ready',()=>sweep());
  Hooks.on('updateWorldTime',()=>sweep());
  Hooks.on('updateCombat',(combat,changed)=>{
    if(changed.round===undefined&&changed.turn===undefined)return;
    sweep('turnEnd',{combat,round:combat.previous?.round,turn:combat.previous?.turn});
    sweep('turnStart',{combat,round:combat.round,turn:combat.turn});
    if(primary()&&combat.combatant?.actor?.getFlag('runarcana','originSelection')?.plan.origin==='Troll')api()?.advanceTrollRecovery(combat.combatant.actor,{combatId:combat.id,turnKey:`${combat.id}:${combat.round}:${combat.turn}`}).catch(e=>console.error('Runarcana Troll turn',e));
  });
  Hooks.on('updateActor',(actor,changed)=>{
    if(!primary())return;
    const job=changed.flags?.runarcana?.pendingOriginDamage??changed['flags.runarcana.pendingOriginDamage'];
    if(job)api()?.processOriginDamage(actor,job).catch(e=>console.error('Runarcana origin damage',e));
  });
  Hooks.on('createActiveEffect',effect=>{
    if(!primary()||!effect.getFlag('dnd5e','autoDowned'))return;
    const actor=effect.actor??effect.parent;
    if(actor.getFlag('runarcana','originSelection')?.plan.origin==='Troll'&&actor.system.attributes.hp.value===0&&(actor.getFlag('runarcana','originLife')?.awaitingTurn||actor.getFlag('runarcana','pendingOriginDamage')?.deferTrollDowned))effect.delete().catch(e=>console.error('Runarcana Troll downed timing',e));
  });
  Hooks.on('updateActiveEffect',(effect,changed)=>{
    if(!primary()||!(changed.duration?.expired||changed['duration.expired']))return;
    const actor=effect.actor??effect.parent;if(actor.documentName!=='Actor')return;
    if(effect.getFlag('runarcana','originTemporary'))api()?.expireOriginArtifacts(actor).catch(e=>console.error('Runarcana effect expiry',e));
    if(effect.getFlag('runarcana','draconicForm')&&actor.getFlag('runarcana','draconicForm')?.active)api()?.setDraconicForm(actor,false).catch(e=>console.error('Runarcana form expiry',e));
  });
  Hooks.on('deleteActiveEffect',(effect,options)=>{
    if(!primary())return;
    const actor=effect.actor??effect.parent;if(actor.documentName!=='Actor')return;
    if(effect.getFlag('runarcana','originTemporary')&&!options.runarcanaExpiryHandled&&effect.getFlag('runarcana','followup')&&(effect.duration?.expired||effect.duration?.remaining<=0))api()?.expireOriginArtifacts(actor,{deletedEffect:effect}).catch(e=>console.error('Runarcana effect followup',e));
    if(effect.getFlag('runarcana','draconicForm')&&!options.runarcanaFormTransition&&actor.getFlag('runarcana','draconicForm')?.active)api()?.setDraconicForm(actor,false).catch(e=>console.error('Runarcana form removal',e));
  });
}
