import {resourceValue,validateChoices,creatureStatistics,scaleDice,manaCost} from './rules.mjs';
import {characterPlan,originEffects,ABILITIES} from './character.mjs';

const queues=new Map();
export async function serialized(key,operation) {
  const previous=queues.get(key)??Promise.resolve();
  const next=previous.catch(()=>{}).then(operation);queues.set(key,next);
  try{return await next;}finally{if(queues.get(key)===next)queues.delete(key);}
}
export function isMarked(actor) {return game.settings.get('runarcana','enabled') && actor?.getFlag('runarcana','enabled')===true;}
export function assertOwner(actor) {
  if(!isMarked(actor))throw new Error('RUNARCANA.Error.NotMarked');
  if(!actor.isOwner)throw new Error('RUNARCANA.Error.Permission');
}
export function assertGM() {
  if(!game.user.isGM || game.users.activeGM?.id!==game.user.id)throw new Error('RUNARCANA.Error.PrimaryGM');
}
export function createApi() {
  return Object.freeze({
    version:game.modules?.get('runarcana')?.version??'0.5.0', manaCost,scaleDice,creatureStatistics,
    async enableActor(actor) {
      assertGM();
      if(!game.settings.get('runarcana','enabled'))throw new Error('RUNARCANA.Error.WorldDisabled');
      await actor.setFlag('runarcana','enabled',true);return actor;
    },
    async previewCharacter(selection,actor) {
      if(actor)assertOwner(actor);
      const origin=await fromUuid(selection.originUuid);
      if(origin?.type!=='race'||!origin.getFlag('runarcana','canonicalId'))throw new Error('RUNARCANA.Error.Source');
      const knownSkills=Object.fromEntries(Object.entries(actor?._source.system.skills??{}).map(([k,v])=>[k,v.value]));
      return characterPlan(origin.getFlag('runarcana','creation'),selection,{knownSkills});
    },
    async customizeOrigin(actor,selection) {
      assertGM();assertOwner(actor);
      return serialized(actor.uuid,async()=>{
        const plan=await this.previewCharacter(selection,actor),origin=await fromUuid(selection.originUuid);
        const old=actor.items.filter(i=>i.getFlag('runarcana','originManaged'));
        if(actor.items.some(i=>i.type==='race'&&!i.getFlag('runarcana','originManaged')))throw new Error('RUNARCANA.Error.ExistingOrigin');
        const documents=[origin.toObject()];
        for(const advancement of origin.system.advancement??[])if(advancement.type==='ItemGrant')for(const grant of advancement.configuration.items??[]) {
          const d=await fromUuid(grant.uuid);if(!d)throw new Error('RUNARCANA.Error.Source');documents.push(d.toObject());
        }
        if(plan.variantUuid){const d=await fromUuid(plan.variantUuid);if(!d)throw new Error('RUNARCANA.Error.Source');documents.push(d.toObject());}
        for(const name of plan.customProficiencies)documents.push({name,type:'tool',system:{proficient:1,ability:'int',description:{value:escapeHtml(name)},activities:{rcOriginCheck001:{_id:'rcOriginCheck001',type:'check',name,activation:{type:'action',value:1},check:{ability:'int',associated:[],dc:{calculation:'',formula:''}}}}},flags:{runarcana:{originManaged:true,creationProficiency:true}}});
        for(const o of plan.selectedOptions)documents.push({name:o.name,type:'feat',system:{description:{value:escapeHtml(o.description)},type:{value:'race'}},flags:{runarcana:{originManaged:true}}});
        for(const d of documents){delete d._id;delete d._key;delete d.folder;d.flags??={};d.flags.runarcana??={};d.flags.runarcana.originManaged=true;}
        // The workbench resolves origin choices itself, so native advancements must not grant them again.
        documents[0].system.advancement=[];delete documents[0].system.movement;delete documents[0].system.senses;
        if(plan.origin==='Antroplantae')documents[0].system.type={value:'plant'};
        for(const d of documents)if(['Inspiration','Energy','Masters of Glamour'].includes(d.name)){
          d.system.uses={max:'floor(@prof / 2)',spent:old.find(i=>i.getFlag('runarcana','canonicalId')===d.flags.runarcana.canonicalId)?.system.uses?.spent??0,recovery:[]};
          d.flags.runarcana.originRecovery=d.name==='Masters of Glamour'?'full':'long';
        }
        documents[0].effects=originEffects(plan,{level:actor.system.details?.level??1});
        const previous=actor.getFlag('runarcana','originSelection');
        const snapshot=Object.fromEntries(ABILITIES.map(k=>[`system.abilities.${k}.value`,actor._source.system.abilities[k].value]));
        snapshot['flags.runarcana.originSelection']=previous??null;
        snapshot['system.attributes.ac.formulas']=actor._source.system.attributes?.ac?.formulas??[];
        const updates={'flags.runarcana.originSelection':{selection,plan}};
        const formulas=snapshot['system.attributes.ac.formulas'].filter(f=>!(previous?.plan.ac&&f.label==='Runarcana Origin'&&f.formula===previous.plan.ac));
        updates['system.attributes.ac.formulas']=[...formulas,...(plan.ac?[{formula:plan.ac,label:'Runarcana Origin',armored:false}]:[])];
        for(const k of ABILITIES){
          // Preserve score changes made since creation; only replace this origin's recorded boosts.
          const value=actor._source.system.abilities[k].value-(previous?.plan.boosts[k]??0)+plan.boosts[k];
          if(!Number.isInteger(value)||value<1||value>30)throw new Error('RUNARCANA.Error.Choices');updates[`system.abilities.${k}.value`]=value;
        }
        const originals=old.map(i=>i.toObject());let created=[];
        try {
          // Species are singletons in dnd5e; remove the previous managed species before inserting its replacement.
          if(old.length)await actor.deleteEmbeddedDocuments('Item',old.map(i=>i.id));
          created=await actor.createEmbeddedDocuments('Item',documents);
          if(created.length!==documents.length)throw new Error('RUNARCANA.Error.Source');
          await actor.update(updates);
        }
        catch(error){if(created.length)await actor.deleteEmbeddedDocuments('Item',created.map(i=>i.id));const missing=originals.filter(d=>!actor.items.get(d._id));if(missing.length)await actor.createEmbeddedDocuments('Item',missing,{keepId:true});await actor.update(snapshot);throw error;}
        return plan;
      });
    },
    async beginCharacter(selection) {
      const {name,classUuid,abilities}=selection;
      assertGM();if(!game.settings.get('runarcana','enabled'))throw new Error('RUNARCANA.Error.WorldDisabled');
      if(!name?.trim()||Object.keys(abilities??{}).sort().join(',')!=='cha,con,dex,int,str,wis'||Object.values(abilities).some(v=>!Number.isInteger(v)||v<1||v>30))throw new Error('RUNARCANA.Error.Choices');
      await this.previewCharacter(selection);
      const cls=await fromUuid(classUuid);
      if(cls?.type!=='class'||!cls.getFlag('runarcana','canonicalId'))throw new Error('RUNARCANA.Error.Source');
      const actor=await Actor.create({name:name.trim(),type:'character',system:{abilities:Object.fromEntries(Object.entries(abilities).map(([k,value])=>[k,{value}]))},flags:{runarcana:{enabled:true,creationDraft:{classUuid}}}});
      try {await this.customizeOrigin(actor,selection);}catch(error){await actor.delete();throw error;}
      const Manager=game.dnd5e.applications.advancement.AdvancementManager;
      Manager.forNewItem(actor,cls.toObject()).render(true);actor.sheet.render(true);return actor;
    },
    async setResource(actor,id,resource) {
      assertGM();assertOwner(actor);checkResourceId(id);resourceValue(resource,0);
      if(!['none','short','long','full'].includes(resource.recovery??'none'))throw new Error('RUNARCANA.Error.Resource');
      await actor.update({[`flags.runarcana.resources.${id}`]:{...resource,recovery:resource.recovery??'none'}});
    },
    async spendResource(actor,id,amount,{operationId}={}) {
      assertGM();assertOwner(actor);checkResourceId(id);
      if(!Number.isFinite(amount)||amount<0)throw new Error('RUNARCANA.Error.Cost');
      return serialized(actor.uuid,async()=>{
        const state=actor.getFlag('runarcana','resources')??{}, resource=state[id];
        const seen=actor.getFlag('runarcana','operations')??[];
        if(operationId&&seen.includes(operationId))return resource;
        const value=resourceValue(resource,-amount);
        const updates={[`flags.runarcana.resources.${id}.value`]:value};
        if(operationId)updates['flags.runarcana.operations']=[...seen,operationId].slice(-100);
        await actor.update(updates);return {...resource,value};
      });
    },
    previewChoices(actor,plan) {
      assertOwner(actor);
      const previous=actor.getFlag('runarcana','choices')?.choices??[];
      return validateChoices({...plan,choices:[...previous,...plan.choices],actor:{level:actor.system.details.level,abilities:Object.fromEntries(Object.entries(actor.system.abilities).map(([k,v])=>[k,v.value]))}});
    },
    async applyChoices(actor,plan,{overrideReason}={}) {
      assertGM();assertOwner(actor);
      return serialized(actor.uuid,async()=>{
        const result=this.previewChoices(actor,plan);
        if(!result.valid&&!overrideReason?.trim())throw new Error(result.errors[0]);
        const existing=new Set(actor.items.map(i=>i.getFlag('runarcana','canonicalId')).filter(Boolean));
        const resolved=[];
        for(const choice of plan.choices) {
          const document=await fromUuid(choice.uuid);
          if(!document || document.documentName!=='Item' || !document.getFlag('runarcana','canonicalId'))throw new Error('RUNARCANA.Error.Source');
          if(!existing.has(document.getFlag('runarcana','canonicalId')))resolved.push(document.toObject());
        }
        const created=await actor.createEmbeddedDocuments('Item',resolved.map(d=>{delete d._id;delete d.folder;return d;}));
        try {
          await actor.update({'flags.runarcana.choices':{...plan,choices:[...(actor.getFlag('runarcana','choices')?.choices??[]),...plan.choices]},'flags.runarcana.choiceOverride':overrideReason?{reason:overrideReason,user:game.user.id,time:game.time.worldTime}:null});
        } catch(error) {await actor.deleteEmbeddedDocuments('Item',created.map(d=>d.id));throw error;}
        return {created:created.length,...result};
      });
    },
    async rest(actor,type,{operationId,hitDiceAllocation={},exhaustionRecovery=true}={}) {
      assertGM();assertOwner(actor);
      return serialized(actor.uuid,async()=>{
        if(!['short','long','full'].includes(type))throw new Error('RUNARCANA.Error.Rest');
        const state=actor.getFlag('runarcana','rest')??{longCount:0,shortDieUsed:false};
        if(operationId&&state.lastOperation===operationId)return state;
        if(type==='full'&&state.longCount<2)throw new Error('RUNARCANA.Error.FullRest');
        if(type!=='short'&&state.lastLongEnd!==undefined&&game.time.worldTime-state.lastLongEnd<86400)throw new Error('RUNARCANA.Error.RestTime');
        if(type==='full'&&actor.system.attributes.hp.value<1)throw new Error('RUNARCANA.Error.RestHP');
        const updates={},resources=actor.getFlag('runarcana','resources')??{};
        for(const [id,r]of Object.entries(resources))if(r.recovery===type)updates[`flags.runarcana.resources.${id}.value`]=r.max;
        const itemUpdates=[];
        for(const item of actor.items)if(item.getFlag?.('runarcana','originManaged')&&item.getFlag('runarcana','originRecovery')===type)itemUpdates.push({_id:item.id,'system.uses.spent':0});
        if(type==='full') {
          updates['system.attributes.hp.value']=actor.system.attributes.hp.max;
          if(exhaustionRecovery)updates['system.attributes.exhaustion']=0;
          const classes=actor.items.filter(i=>i.type==='class');
          if(classes.length===1) {
            const c=classes[0];itemUpdates.push({_id:c.id,'system.hd.spent':Math.max(0,c.system.hd.spent-Math.floor(c.system.levels/2))});
          } else if(classes.length>1) {
            const budget=Math.floor(classes.reduce((sum,c)=>sum+c.system.levels,0)/2);
            const n=Object.values(hitDiceAllocation).reduce((a,b)=>a+b,0);
            if(n>budget||!Object.keys(hitDiceAllocation).length)throw new Error('RUNARCANA.Error.HitDiceAllocation');
            for(const c of classes) {
              const amount=hitDiceAllocation[c.id]??0;
              if(!Number.isInteger(amount)||amount<0||amount>c.system.hd.spent)throw new Error('RUNARCANA.Error.HitDiceAllocation');
              itemUpdates.push({_id:c.id,'system.hd.spent':c.system.hd.spent-amount});
            }
          }
        } else if(type==='long'&&exhaustionRecovery)updates['system.attributes.exhaustion']=Math.max(0,actor.system.attributes.exhaustion-Math.max(1,actor.system.abilities.con.mod));
        updates['flags.runarcana.rest']={...state,longCount:type==='full'?0:state.longCount+(type==='long'?1:0),shortDieUsed:type==='short'?state.shortDieUsed:false,lastLongEnd:type==='short'?state.lastLongEnd:game.time.worldTime,lastOperation:operationId};
        // Rest duration/food/sleep are verified by the GM before invoking this completed-rest API.
        if(itemUpdates.length)await actor.updateEmbeddedDocuments('Item',itemUpdates);
        await actor.update(updates);return updates['flags.runarcana.rest'];
      });
    },
    async spendHitDie(actor,type,denomination) {
      assertGM();assertOwner(actor);
      return serialized(actor.uuid,async()=>{
        if(!['short','long'].includes(type)||!/^d(?:2|4|6|8|10|12|20)$/.test(denomination))throw new Error('RUNARCANA.Error.Rest');
        const state=actor.getFlag('runarcana','rest')??{longCount:0,shortDieUsed:false};
        if(type==='short'&&state.shortDieUsed)throw new Error('RUNARCANA.Error.ShortHitDie');
        const cls=actor.items.find(c=>c.type==='class'&&c.system.hd.denomination===denomination&&c.system.hd.spent<c.system.levels);
        if(!cls)throw new Error('RUNARCANA.Error.HitDiceAllocation');
        const roll=await new Roll(`max(0,1${denomination}+@abilities.con.mod)`,actor.getRollData()).evaluate();
        const hp=actor.system.attributes.hp;
        await actor.updateEmbeddedDocuments('Item',[{_id:cls.id,'system.hd.spent':cls.system.hd.spent+1}]);
        try {
          await actor.update({'system.attributes.hp.value':Math.min(hp.max,hp.value+roll.total),'flags.runarcana.rest':{...state,shortDieUsed:type==='short'?true:state.shortDieUsed}});
        } catch(error) {await actor.updateEmbeddedDocuments('Item',[{_id:cls.id,'system.hd.spent':cls.system.hd.spent-1}]);throw error;}
        await roll.toMessage({speaker:ChatMessage.getSpeaker({actor}),flavor:game.i18n.localize('RUNARCANA.Rest.SpendHitDie')});return roll;
      });
    },
    async createCreature(input) {
      assertGM();if(!game.settings.get('runarcana','enabled'))throw new Error('RUNARCANA.Error.WorldDisabled');
      const stats=creatureStatistics(input);
      const sizes={diminutive:'tiny',tiny:'tiny',small:'sm',medium:'med',large:'lg',huge:'huge',gargantuan:'grg',colossal:'grg'};
      if(!input.name?.trim()||!Number.isFinite(input.ac))throw new Error('RUNARCANA.Error.Creature');
      return Actor.create({name:input.name,type:'npc',system:{abilities:{con:{value:input.constitution??10}},attributes:{hp:{value:stats.hp,max:stats.hp,formula:stats.hitDice},ac:{calc:'flat',flat:input.ac}},details:{cr:input.cr},traits:{size:sizes[input.size]}},flags:{runarcana:{enabled:true,creation:input,statistics:stats,mechanicalCoverage:'partial'}},prototypeToken:{actorLink:false}});
    },
    async craft(actor,recipe,{operationId,overrideReason}={}) {
      assertGM();assertOwner(actor);
      if(!recipe.reviewed||!recipe.sourceUrl)throw new Error('RUNARCANA.Error.UnreviewedRecipe');
      const validation=this.previewChoices(actor,{budget:0,choices:[{id:recipe.id,cost:0,prerequisites:recipe.prerequisites??[]}]});
      if(!validation.valid&&!overrideReason?.trim())throw new Error(validation.errors[0]);
      // Use one resource debit update and compensate if output creation fails.
      return serialized(actor.uuid,async()=>{
        const operations=actor.getFlag('runarcana','operations')??[];
        if(operationId&&operations.includes(operationId))return [];
        const debit={},restore={};
        for(const [id,cost]of Object.entries(recipe.resources??{})) {
          checkResourceId(id);if(!Number.isFinite(cost)||cost<0)throw new Error('RUNARCANA.Error.Cost');
          const r=actor.getFlag('runarcana','resources')?.[id];restore[`flags.runarcana.resources.${id}.value`]=r?.value;
          debit[`flags.runarcana.resources.${id}.value`]=resourceValue(r,-cost);
        }
        const output=await fromUuid(recipe.outputUuid);
        if(!output||output.documentName!=='Item')throw new Error('RUNARCANA.Error.Source');
        const data=output.toObject();delete data._id;delete data.folder;
        await actor.update(debit);let created;
        try {
          created=await actor.createEmbeddedDocuments('Item',[data]);
          await actor.update({'flags.runarcana.operations':operationId?[...operations,operationId].slice(-100):operations,'flags.runarcana.lastCraft':{recipe:recipe.id,source:recipe.sourceUrl,overrideReason:overrideReason??null,user:game.user.id,time:game.time.worldTime}});
        } catch(error) {if(created?.length)await actor.deleteEmbeddedDocuments('Item',created.map(d=>d.id));await actor.update(restore);throw error;}
        return created;
      });
    }
  });
}
function checkResourceId(id){if(!/^[a-z][a-z0-9-]*$/.test(id))throw new Error('RUNARCANA.Error.Resource');}
function escapeHtml(text){return String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
