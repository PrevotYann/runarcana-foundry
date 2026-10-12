/** Primary-GM origin powers that need coordinated document changes. */
import {originTemporaryEffect} from './origin-lifecycle.mjs';
export function healingAmount(actor,amount,{repair=false}={}){
  const plan=actor.getFlag?.('runarcana','originSelection')?.plan;
  return Math.max(0,Math.floor(amount*(actor.getFlag?.('runarcana','enabled')&&(plan?.origin==='Construct'||plan?.constructed)&&!repair?0.5:1)));
}
const damage=formula=>({custom:{enabled:true,formula},types:['force'],scaling:{mode:'',number:1,formula:''}});
export async function performOriginPower(actor,power,target,options={}){
  const definition=power?.getFlag('runarcana','originPower'),kind=definition?.managed;
  if(!['foxFire','plumdaggers','floralBranch','selfsacrifice','devourEssence','comfort','selfEffect'].includes(kind))throw Error('RUNARCANA.Error.Source');
  if(options.prerequisitesConfirmed!==true)throw Error('RUNARCANA.Powers.Requirements');
  const maximum=Number(power.system.uses.max),spent=Number(power.system.uses.spent);
  let cost=1;if(kind==='floralBranch')cost=options.whip?6:Number(options.length);
  if(!Number.isInteger(cost)||cost<1||!Number.isFinite(maximum)||spent+cost>maximum)throw Error('RUNARCANA.Error.InsufficientResource');
  if(['selfsacrifice','devourEssence','comfort'].includes(kind)&&(!target||target.documentName!=='Actor'||!target.isOwner))throw Error('RUNARCANA.Error.Source');
  const sourceHP=actor.system.attributes.hp;
  if(sourceHP.value<=0||actor.statuses?.has('unconscious')||actor.statuses?.has('dead'))throw Error('RUNARCANA.Powers.Unavailable');
  const before=new Map([[actor,{hp:sourceHP.value,state:structuredClone(actor.getFlag('runarcana','originPowerState')??{}),spent}]]);
  if(target&&target!==actor)before.set(target,{hp:target.system.attributes.hp.value,essence:structuredClone(target.getFlag('runarcana','essenceConsumed')??null)});
  let created=[],createdEffects=[],deleted=[],conditionBefore=[],result={kind};
  const documents=[];
  if(kind==='foxFire'){
    const count=options.count??3;if(!Number.isInteger(count)||count<1||count>3)throw Error('RUNARCANA.Error.Choices');
    const spell=actor.items.find(i=>i.type==='spell'&&i.getFlag('runarcana','originSpellGrant')?.spell==='arcane-shot');
    const original=spell?.system.activities?.get?.('rcOriginCast0001')??spell?.system.activities?.rcOriginCast0001;
    if(!original)throw Error('RUNARCANA.Error.Source');
    const ability=actor.getFlag('runarcana','originSelection')?.plan.castingAbility;if(!['cha','wis'].includes(ability))throw Error('RUNARCANA.Error.Choices');
    const native=original.toObject?original.toObject():structuredClone(original),id='rcFoxFireOrb0001';
    native._id=id;native.name='Fire spirit orb';native.activation={type:'action',value:1};native.consumption={spellSlot:false,targets:[{type:'itemUses',target:'',value:'1'}]};native.save.dc={calculation:'',formula:`8 + @prof + @abilities.${ability}.mod`};
    documents.push({name:'Fox Fire - spirit orbs',type:'feat',system:{type:{value:'race'},description:{value:'Up to three spirit orbs from Fox Fire. Each is fired as one attack action using the granted Arcane Shot save and damage. Expires after five turns.'},uses:{max:String(count),spent:0,recovery:[]},activities:{[id]:native}},flags:{runarcana:{originManaged:true,originPowerSpawn:definition.id,originExpires:game.time.worldTime+30,foxFireOrbs:true}}});
  }
  if(kind==='plumdaggers'){
    if(!Number.isFinite(options.decayHours)||options.decayHours<=0)throw Error('RUNARCANA.Powers.DecayRequired');
    const prof=actor.system.attributes.prof,existing=actor.items.filter(i=>i.getFlag?.('runarcana','originPowerSpawn')===definition.id);
    const kept=existing.reduce((n,i)=>n+(i.system.quantity??1),0);
    if(kept+2>2*prof){if(options.discardOldest!==true)throw Error('RUNARCANA.Powers.Capacity');let remaining=kept;for(const item of existing){deleted.push(item.toObject());remaining-=item.system.quantity??1;if(remaining+2<=2*prof)break;}}
    documents.push({name:'Plumdaggers',type:'weapon',system:{type:{value:'simpleM',baseItem:'dagger'},quantity:2,equipped:true,proficient:1,properties:['fin','lgt','thr'],range:{value:20,long:60,reach:5,units:'ft'},damage:{base:{number:1,denomination:4,types:['piercing'],bonus:'@prof',custom:{enabled:false}}},activities:{rcPlumAttack0001:{_id:'rcPlumAttack0001',name:'Plumdagger',type:'attack',activation:{type:'action',value:1},attack:{ability:'',type:{value:'melee',classification:'weapon'}},damage:{includeBase:true,parts:[]},target:{override:true,affects:{type:'creature',count:'1'},template:{type:''}}}}},flags:{runarcana:{originManaged:true,originPowerSpawn:definition.id,originExpires:game.time.worldTime+options.decayHours*3600,decayRuling:{hours:options.decayHours,user:game.user.id},originExpiryReview:'The source says a few hours without a fixed duration; the GM decides the decay time.'}}});
  }
  if(kind==='floralBranch'){
    const system={quantity:1,description:{value:`Floral branch: ${cost} feet. Disintegrates after 24 hours; vulnerable to fire.`}};
    if(options.whip){Object.assign(system,{type:{value:'martialM',baseItem:'whip'},equipped:true,proficient:1,properties:['fin'],range:{reach:6,units:'ft'},damage:{base:{number:1,denomination:4,types:['slashing'],bonus:'@prof',custom:{enabled:false}}},activities:{rcBranchAttack01:{_id:'rcBranchAttack01',name:'Thorn Whip',type:'attack',activation:{type:'action',value:1},attack:{ability:'',type:{value:'melee',classification:'weapon'}},damage:{includeBase:false,parts:[{custom:{enabled:true,formula:'1d4 + @prof + @abilities.dex.mod'},types:['slashing'],scaling:{mode:'',number:1,formula:''}}]},range:{override:true,value:'6',units:'ft'},target:{override:true,affects:{type:'creature',count:'1'},template:{type:''}}}}});}
    documents.push({name:options.whip?'Floral Thorn Whip':'Floral branch',type:options.whip?'weapon':'loot',system,flags:{runarcana:{originManaged:true,originPowerSpawn:definition.id,originExpires:game.time.worldTime+86400,branchLength:cost}}});
  }
  if(kind==='selfsacrifice'){
    const cls=actor.items.get(options.classId);
    if(cls?.type!=='class'||!/^d(?:6|8|10|12)$/.test(cls.system.hd.denomination)||cls.system.hd.spent>=cls.system.levels)throw Error('RUNARCANA.Error.HitDiceAllocation');
    if(target.statuses?.has('dead'))throw Error('RUNARCANA.Powers.Unavailable');
    const roll=await new Roll(`max(0,1${cls.system.hd.denomination}+@abilities.con.mod)`,actor.getRollData()).evaluate();
    const hp=target.system.attributes.hp,healed=Math.min(hp.max-hp.value,healingAmount(target,roll.total));
    result={kind,roll,healed,selfDamage:Math.floor(healed/2),classId:cls.id,classSpent:cls.system.hd.spent};
  }
  if(kind==='devourEssence'){
    if(target===actor||target.system.attributes.hp.value!==0||!target.statuses?.has('unconscious')||target.statuses?.has('dead')||target.getFlag('runarcana','essenceConsumed'))throw Error('RUNARCANA.Powers.EssenceTarget');
    const plan=actor.getFlag('runarcana','originSelection').plan,mod=actor.system.abilities[plan.castingAbility]?.mod;
    if(!Number.isFinite(mod))throw Error('RUNARCANA.Error.Choices');
    const stored=before.get(actor).state.essences??[],cap=Math.max(0,Math.floor(actor.system.attributes.prof/2)+Math.floor(mod/2));
    if(options.store&&stored.length>=cap)throw Error('RUNARCANA.Powers.Capacity');
    conditionBefore=target.effects.filter(e=>e.type==='condition'&&e.system.type==='dead').map(e=>e.toObject());
    result={kind,healed:options.store?0:Math.min(sourceHP.max-sourceHP.value,Math.max(0,mod)),stored:options.store};
  }
  if(kind==='comfort'){
    const condition=options.condition;if(!['charmed','frightened'].includes(condition)||!target.statuses?.has(condition))throw Error('RUNARCANA.Error.Choices');
    conditionBefore=target.effects.filter(e=>e.type==='condition'&&e.system.type===condition).map(e=>e.toObject());result.condition=condition;
  }
  try{
    if(deleted.length)await actor.deleteEmbeddedDocuments('Item',deleted.map(d=>d._id));
    if(documents.length){created=await actor.createEmbeddedDocuments('Item',documents);if(created.length!==documents.length)throw Error('RUNARCANA.Error.Source');}
    if(kind==='selfEffect'){createdEffects=await actor.createEmbeddedDocuments('ActiveEffect',[originTemporaryEffect(power,actor)]);if(createdEffects.length!==1)throw Error('RUNARCANA.Error.Source');}
    await actor.updateEmbeddedDocuments('Item',[{_id:power.id,'system.uses.spent':spent+cost}]);
    if(kind==='selfsacrifice'){
      await actor.updateEmbeddedDocuments('Item',[{_id:result.classId,'system.hd.spent':result.classSpent+1}]);
      if(target===actor)await actor.update({'system.attributes.hp.value':Math.max(0,sourceHP.value+result.healed-result.selfDamage)});
      else{await target.update({'system.attributes.hp.value':before.get(target).hp+result.healed});await actor.update({'system.attributes.hp.value':Math.max(0,before.get(actor).hp-result.selfDamage)});}
    }
    if(kind==='devourEssence'){
      await target.toggleStatusEffect('dead',{active:true});
      await target.update({'flags.runarcana.essenceConsumed':{by:actor.uuid,time:game.time.worldTime,revival:'wish-only'}});
      const state=structuredClone(before.get(actor).state);if(options.store){state.essences??=[];state.essences.push({source:target.uuid,time:game.time.worldTime});}
      await actor.update({'system.attributes.hp.value':sourceHP.value+result.healed,'flags.runarcana.originPowerState':state});
    }
    if(kind==='comfort')await target.toggleStatusEffect(result.condition,{active:false});
  }catch(error){
    if(created.length)await actor.deleteEmbeddedDocuments('Item',created.map(i=>i.id));
    if(createdEffects.length)await actor.deleteEmbeddedDocuments('ActiveEffect',createdEffects.map(e=>e.id),{runarcanaExpiryHandled:true});
    if(deleted.length)await actor.createEmbeddedDocuments('Item',deleted,{keepId:true});
    await actor.updateEmbeddedDocuments('Item',[{_id:power.id,'system.uses.spent':spent}]);
    if(kind==='selfsacrifice')await actor.updateEmbeddedDocuments('Item',[{_id:result.classId,'system.hd.spent':result.classSpent}]);
    for(const [document,snapshot]of before)await document.update({'system.attributes.hp.value':snapshot.hp,...(document===actor?{'flags.runarcana.originPowerState':snapshot.state}:{'flags.runarcana.essenceConsumed':snapshot.essence})});
    if(kind==='devourEssence'){await target.toggleStatusEffect('dead',{active:false});if(conditionBefore.length)await target.createEmbeddedDocuments('ActiveEffect',conditionBefore,{keepId:true});}
    if(kind==='comfort'&&conditionBefore.length)await target.createEmbeddedDocuments('ActiveEffect',conditionBefore,{keepId:true});
    throw error;
  }
  return result;
}
