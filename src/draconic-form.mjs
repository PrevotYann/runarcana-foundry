import {scaleDice} from './rules.mjs';

const formEffect=e=>e.getFlag?.('runarcana','draconicForm')===true;
const copy=value=>structuredClone(value);
const sizes=['tiny','sm','med','lg','huge','grg'];

export function draconicChanges(definition,{size='med',proficiency=3}={}) {
  const index=sizes.indexOf(size);if(index<0)throw Error('RUNARCANA.Error.Choices');
  const grown=sizes[index>=4?index:index+1];
  return [
    ['system.abilities.'+definition.ability+'.value',Math.floor(proficiency/2),'add'],
    ['system.traits.size',grown,'override'],
    ['system.attributes.movement.speeds.fly',definition.fly,'upgrade'],
    ['system.attributes.movement.units','ft','override']
  ].map(([key,value,type],i)=>({_id:'rcDragon'+String(i).padStart(8,'0'),key,value:String(value),type,phase:'initial',priority:40}));
}

/** Temporary breath uses are spent first; ordinary expenditure survives returning to base form. */
export function remainingBreathSpent(current,baseline,extra) {
  return Math.min(current,baseline)+Math.max(0,current-baseline-extra);
}

export async function transformDragon(actor,active,{equipmentConfirmed=false}={}) {
  if(typeof active!=='boolean')throw Error('RUNARCANA.Error.Choices');
  const before=copy(actor.getFlag('runarcana','draconicForm')??null);
  if(Boolean(before?.active)===active)return before;
  let state=null,updates=[],effect;
  if(active){
    const plan=actor.getFlag('runarcana','originSelection')?.plan;
    const form=actor.items.find(i=>i.getFlag?.('runarcana','originManaged')&&i.getFlag('runarcana','originForm'));
    const race=actor.items.find(i=>i.type==='race'&&i.getFlag?.('runarcana','originManaged')&&i.getFlag('runarcana','creation')?.origin==='Half-Dragon');
    if(plan?.origin!=='Half-Dragon'||!form||!race)throw Error('RUNARCANA.Error.Source');
    if(actor.system.details.level<8)throw Error('RUNARCANA.OriginActionLevel8');
    if(equipmentConfirmed!==true)throw Error('RUNARCANA.Dragon.EquipmentRequired');
    if(actor.system.attributes.hp.value<1)throw Error('RUNARCANA.Error.RestHP');
    const proficiency=Number(actor.system.attributes.prof),extra=Math.floor(proficiency/2);
    if(!Number.isInteger(proficiency)||proficiency<2||proficiency>6)throw Error('RUNARCANA.Error.Choices');
    if(form.system.uses.spent>=extra)throw Error('RUNARCANA.Error.InsufficientResource');
    const definition=form.getFlag('runarcana','originForm');
    if(!['str','dex','con'].includes(definition.ability)||![60,70].includes(definition.fly))throw Error('RUNARCANA.Error.Source');
    state={active:true,started:game.time.worldTime,expires:game.time.worldTime+10800,extraBreath:extra,snapshots:[]};
    effect={name:'Draconic Form',type:'base',disabled:false,duration:{startTime:game.time.worldTime,seconds:10800},system:{changes:draconicChanges(definition,{size:actor.system.traits.size,proficiency})},flags:{runarcana:{draconicForm:true}}};
    updates.push({_id:form.id,'system.uses.spent':form.system.uses.spent+1});
    for(const item of actor.items.filter(i=>i.getFlag?.('runarcana','originManaged'))){
      const raw=item.toObject(),update={_id:item.id},snapshot={_id:item.id};
      if(item.getFlag('runarcana','weaponDefinition')){
        const damage=raw.system.damage.base,next=scaleDice(damage.number,damage.denomination,1),dice=/^(\d+)d(\d+)$/.exec(next);
        if(!dice)throw Error('RUNARCANA.Error.Dice');
        snapshot['system.damage.base']=copy(damage);
        update['system.damage.base']={...damage,number:Number(dice[1]),denomination:Number(dice[2])};
        if(definition.bonusClaws&&item.getFlag('runarcana','weaponDefinition').id==='claws'){
          snapshot['system.activities']=copy(raw.system.activities);
          if(!raw.system.activities.rcDragonClaws001)snapshot['system.activities.-=rcDragonClaws001']=null;
          const attack=Object.values(raw.system.activities).find(a=>a.type==='attack');
          if(attack)update['system.activities']={...raw.system.activities,rcDragonClaws001:{...copy(attack),_id:'rcDragonClaws001',name:'Claws (bonus action)',activation:{type:'bonus',value:1}}};
        }
      }
      if(item.getFlag('runarcana','originAction')==='draconic-breath'){
        snapshot['system.uses.max']=raw.system.uses.max;
        state.breath={id:item.id,baseline:item.system.uses.spent};
        update['system.uses.max']='@prof + floor(@prof / 2)';
        for(const [id,a]of Object.entries(raw.system.activities))if(a.type==='save'){
          const path=`system.activities.${id}.damage.parts`;
          snapshot[path]=copy(a.damage.parts);update[path]=copy(a.damage.parts);
          update[path][0].custom={enabled:true,formula:definition.extraBreathDie?'(@prof + 1)d8':'(@prof)d8'};
        }
      }
      if(Object.keys(snapshot).length>1){state.snapshots.push(snapshot);updates.push(update);}
    }
    if(!state.breath)throw Error('RUNARCANA.Error.Source');
  }else{
    updates=before.snapshots.filter(s=>actor.items.get(s._id)).map(copy);
    const breath=actor.items.get(before.breath?.id);
    if(breath){const update=updates.find(u=>u._id===breath.id);update['system.uses.spent']=remainingBreathSpent(breath.system.uses.spent,before.breath.baseline,before.extraBreath);}
  }
  const rollback=updates.map(update=>{
    const item=actor.items.get(update._id),raw=item.toObject();
    const restored=Object.fromEntries(Object.keys(update).map(path=>{
      const actual=path.replace('.-=','.');
      return [actual,path==='_id'?item.id:copy(actual.split('.').reduce((v,k)=>v?.[k],raw))];
    }));
    for(const id of Object.keys(update['system.activities']??{}))if(!raw.system.activities?.[id])restored[`system.activities.-=${id}`]=null;
    return restored;
  });
  const oldEffects=[...actor.effects].filter(formEffect).map(e=>e.toObject());
  try{
    if(active){const created=await actor.createEmbeddedDocuments('ActiveEffect',[effect]);if(created.length!==1)throw Error('RUNARCANA.Error.Source');}
    else if(oldEffects.length)await actor.deleteEmbeddedDocuments('ActiveEffect',oldEffects.map(e=>e._id));
    await actor.updateEmbeddedDocuments('Item',updates);
    await actor.update({'flags.runarcana.draconicForm':state});
  }catch(error){
    await actor.updateEmbeddedDocuments('Item',rollback);
    const current=[...actor.effects].filter(formEffect);
    if(current.length)await actor.deleteEmbeddedDocuments('ActiveEffect',current.map(e=>e.id));
    if(oldEffects.length)await actor.createEmbeddedDocuments('ActiveEffect',oldEffects,{keepId:true});
    await actor.update({'flags.runarcana.draconicForm':before});
    throw error;
  }
  return state;
}
