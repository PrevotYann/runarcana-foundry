import {damageComponents,MAGIC_BASE,manaCost,resourceValue} from '../rules.mjs';
import {isMarked} from '../api.mjs';
import {originEffects} from '../character.mjs';

export function installDnd5eAdapter() {
  const refreshOrigin=async item=>{
    const actor=item.parent;if(item.type!=='class'||!isMarked(actor)||!game.user.isGM||game.users.activeGM?.id!==game.user.id)return;
    const plan=actor.getFlag('runarcana','originSelection')?.plan;if(!plan)return;
    const effect=actor.items.find(i=>i.type==='race'&&i.getFlag('runarcana','originManaged'))?.effects.find(e=>e.getFlag('runarcana','originManaged'));
    if(effect)await effect.update({'system.changes':originEffects(plan,{level:actor.system.details.level})[0].system.changes});
  };
  for(const event of ['createItem','updateItem','deleteItem'])Hooks.on(event,item=>{refreshOrigin(item).catch(e=>console.error('Runarcana origin progression',e));});
  CONFIG.DND5E.activityConsumptionTypes.runarcanaResource={
    label:'RUNARCANA.Resources',targetRequiresEmbedded:true,
    validTargets(){return Object.entries(this.actor?.getFlag('runarcana','resources')??{}).map(([value,r])=>({value,label:r.label??value}));},
    consumptionLabels(config){
      const resource=this.actor?.getFlag('runarcana','resources')?.[this.target];
      const cost=this.target==='mana'&&this.item.type==='spell'?manaCost(this.item.system.level+Number(config.scaling??0)):this._resolveHintCost(config).simplifiedCost;
      return {label:resource?.label??this.target,hint:game.i18n.format('RUNARCANA.ResourceCost',{cost,value:resource?.value??0}),warn:cost>(resource?.value??0)};
    },
    async consume(config,updates) {
      if(!isMarked(this.actor)||!this.actor.isOwner)throw new Error(game.i18n.localize('RUNARCANA.Error.NotMarked'));
      if(!/^[a-z][a-z0-9-]*$/.test(this.target))throw new Error(game.i18n.localize('RUNARCANA.Error.Resource'));
      const path=`flags.runarcana.resources.${this.target}.value`;
      const resource=this.actor.getFlag('runarcana','resources')?.[this.target];
      let cost;
      if(this.target==='mana'&&this.item.type==='spell')cost=manaCost(this.item.system.level+Number(config.scaling??0));
      else cost=(await this.resolveCost({config,rolls:updates.rolls,delta:{keyPath:path}})).total;
      const current=updates.actor[path]??resource?.value;
      try{updates.actor[path]=resourceValue({...resource,value:current},-cost);}
      catch(error){
        // Use the native ConsumptionError so the activity returns a normal insufficient-resource warning.
        const ErrorClass=game.dnd5e?.dataModels?.activity?.ConsumptionError;
        if(ErrorClass)throw new ErrorClass(game.i18n.localize(error.message));
        throw new Error(game.i18n.localize(error.message));
      }
    }
  };
  // New types are available to marked source items; native definitions are never replaced.
  if(game.settings.get('runarcana','enabled'))for(const type of ['shadow',...Object.keys(MAGIC_BASE)]) {
    CONFIG.DND5E.damageTypes[type]??={label:'RUNARCANA.Damage.'+type,isPhysical:['lacerating','incisive','crushing'].includes(type)};
  }
  Hooks.on('dnd5e.preUseActivity',(activity,usage)=>{
    const targets=activity.consumption.targets;
    if(targets.some(t=>t.type==='runarcanaResource')) {
      if(!isMarked(activity.actor)){ui.notifications.warn(game.i18n.localize('RUNARCANA.Error.NotMarked'));return false;}
      activity.consumption.spellSlot=false;
      if(usage.consume && typeof usage.consume==='object')usage.consume.spellSlot=false;
    }
  });
  for(const type of ['Short','Long'])Hooks.on(`dnd5e.pre${type}Rest`,actor=>{
    if(!isMarked(actor))return;
    ui.notifications.info(game.i18n.localize('RUNARCANA.UseRestWorkbench'));return false;
  });
  Hooks.on('dnd5e.preRollDamage',(config)=>{
    const activity=config.subject;
    if(!isMarked(activity?.actor))return;
    const multiplier=activity.item?.getFlag('runarcana','criticalMultiplier');
    if(Number.isInteger(multiplier)&&multiplier>=2){config.critical??={};config.critical.multiplier=multiplier;}
  });
  Hooks.on('dnd5e.preCalculateDamage',(actor,parts,options)=>{
    if(!isMarked(actor))return;
    const plan=actor.getFlag('runarcana','originSelection')?.plan;
    if(plan?.strengthReduction&&!options.runarcana?.ignoreOriginReduction&&options.ignore!==true){
      const reduction=Math.max(0,actor.system.abilities.str.mod),multiplier=options.multiplier??1;
      if(multiplier>0)for(const part of parts)if(part.value>0&&part.type!=='true'&&!(part.type in CONFIG.DND5E.healingTypes))part.value=Math.max(0,part.value*multiplier-reduction)/multiplier;
    }
    const defense=actor.getFlag('runarcana','defenses');
    if(!defense?.reviewed || options.ignore===true)return;
    const damageParts=parts.filter(p=>p.value>=0 && !(p.type in CONFIG.DND5E.healingTypes));
    const result=damageComponents(damageParts.map(p=>({...p,value:p.value*(options.multiplier??1)})),defense,{...options.runarcana,targetActorUuid:actor.uuid});
    result.forEach((r,i)=>{damageParts[i].value=r.value;damageParts[i].active??={};damageParts[i].active.runarcana=r.applied;});
    options.multiplier=1;
    options.ignore={...options.ignore,immunity:true,resistance:true,vulnerability:true,modification:true};
    // Threshold and HP/temp-HP application stay in the native damage workflow.
  });
}
