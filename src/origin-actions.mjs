/** Reviewed origin actions; equipment decisions and conditional riders remain manual. */
export function originAction(definition,{canonicalId,sourceUrl,spent=0}={}) {
  if(definition.kind==='activity')return originPower(definition,{canonicalId,sourceUrl,spent});
  if(definition.kind==='draconicForm')return {name:definition.name,type:'feat',img:'icons/svg/wing.svg',system:{type:{value:'race'},description:{value:'<p>From level 8, use the Character tab to enter or leave Draconic Form. Half proficiency (rounded down) uses per full rest; up to three hours. The GM reviews equipment. Consumed spell material components are prohibited in this form.</p><p>'+escapeHtml(definition.description)+'</p>'},uses:{max:'floor(@prof / 2)',spent,recovery:[]},activities:{}},flags:{runarcana:{originManaged:true,originAction:definition.id,originForm:definition,originRecovery:'full',canonicalId:canonicalId?canonicalId+'#action-'+definition.id:undefined,sourceUrl,sourceHash:definition.sourceHash}}};
  if(definition.kind==='transformation'){
    const id='rcOriginChange01';
    return {name:definition.name,type:'feat',img:'icons/svg/mystery-man.svg',system:{type:{value:'race'},
      description:{value:'<p>Minor appearance changes only: bonus action, DC 15 Transformation check (proficiency bonus + Constitution modifier). Magic-zone restrictions and advantage/disadvantage require manual adjudication; no statistics, tribe or size are changed by this activity.</p><p>'+escapeHtml(definition.description)+'</p>'},
      activities:{[id]:{_id:id,name:definition.name,type:'check',activation:{type:'bonus',value:1},
        check:{ability:'con',associated:[],bonus:'@prof',dc:{calculation:'',formula:'15'}},
        target:{override:true,affects:{type:'self'},template:{type:''},prompt:false}}}},
      flags:{runarcana:{originManaged:true,originAction:definition.id,originActionLevel:1,canonicalId:canonicalId?canonicalId+'#action-'+definition.id:undefined,sourceUrl,sourceHash:definition.sourceHash,manualMagicZone:true,cosmeticOnly:true}}};
  }
  if(definition.kind!=='breath')throw new Error('RUNARCANA.Error.Source');
  const template={type:definition.shape,size:String(definition.size),units:'ft'};
  if(definition.width)template.width=String(definition.width);
  const id='rcOriginBreath01';
  return {name:definition.name,type:'feat',img:'icons/svg/fire.svg',system:{
    type:{value:'race'},description:{value:'<p>Starting at level 2: proficiency bonus uses per full rest; Dexterity save DC 8 + Constitution modifier + proficiency bonus; proficiency bonus d6 damage, half on a success. The Character tab manages Draconic Form modifiers.</p><p>'+escapeHtml(definition.description)+'</p>'},
    uses:{max:'@prof',spent,recovery:[]},
    activities:{[id]:{_id:id,name:definition.name,type:'save',activation:{type:'action',value:1,condition:'Requires Half-Dragon level 2.'},
      consumption:{spellSlot:false,targets:[{type:'itemUses',target:'',value:'1'}]},
      save:{ability:['dex'],dc:{calculation:'',formula:'8 + @abilities.con.mod + @prof'}},
      damage:{onSave:'half',parts:[{custom:{enabled:true,formula:'(@prof)d6'},types:[definition.damageType],scaling:{mode:'',number:1,formula:''}}]},
      range:{override:true,units:'self',value:''},target:{override:true,template,affects:{type:'creature',count:''},prompt:true}}}
  },flags:{runarcana:{originManaged:true,originAction:definition.id,originActionLevel:definition.level,originRecovery:'full',canonicalId:canonicalId?canonicalId+'#action-'+definition.id:undefined,sourceUrl,sourceHash:definition.sourceHash,managedDraconicForm:true}}};
}
function originPower(d,{canonicalId,sourceUrl,spent}){
  const id='rcOriginPower001',effects=[],a={_id:id,name:d.name,type:d.activityType,activation:{type:d.activation,value:d.activationValue??1,condition:d.resolution??''},
    consumption:{spellSlot:false,targets:d.max?[{type:'itemUses',target:'',value:'1'}]:[]},
    range:{override:true,units:d.range?'ft':'self',value:d.range?String(d.range):''},
    target:{override:true,affects:{type:d.shape?'creature':d.range?'creature':'self',count:d.range?'1':''},template:d.shape?{type:d.shape,size:String(d.size),units:'ft'}:{type:''},prompt:Boolean(d.shape||d.range)}};
  const damage=(formula,type)=>({custom:{enabled:true,formula},types:[type],scaling:{mode:'',number:1,formula:''}});
  if(d.activityType==='save'){
    a.save={ability:[d.save],dc:{calculation:'',formula:d.dc}};
    a.damage={onSave:'none',parts:d.damage?[damage(d.damage,d.damageType)]:[]};
  }
  if(d.activityType==='heal')a.healing=damage(d.healing,d.healingType??'healing');
  if(d.activityType==='check')a.check={ability:d.ability,associated:[],bonus:d.bonus??'',dc:{calculation:'',formula:d.dc??''}};
  if(d.changes||d.condition){
    const eid='rcOriginEffect01';
    const duration=d.turns?{value:0,units:'rounds',expiry:'sourceTurnEnd'}:{value:d.seconds??d.rounds??null,units:d.seconds?'seconds':'rounds',expiry:null};
    effects.push({_id:eid,name:d.name,type:'base',transfer:false,disabled:false,duration,system:{rider:{statuses:d.condition?[d.condition]:[]},changes:(d.changes??[]).map(([key,value,type],i)=>({_id:'rcPowerC'+String(i).padStart(8,'0'),key,value:String(value),type,phase:'initial',priority:30}))},flags:{runarcana:{originTemporary:true,originPower:d.id,followup:d.followup??null}}});
    a.effects=[{_id:eid,...(d.activityType==='save'?{onSave:false}:{})}];
  }
  const system={type:{value:'race'},description:{value:'<p>'+escapeHtml(d.description)+'</p>'+(d.resolution?'<p>'+escapeHtml(d.resolution)+'</p>':'')+(d.freeRider?'<p>Included in '+escapeHtml(d.freeRider)+'; not an independent additional use.</p>':'')},activities:d.managed?{}:{[id]:a}};
  if(d.max)system.uses={max:d.max,spent,recovery:[]};
  return {name:d.name,type:'feat',img:'icons/svg/mystery-man.svg',system,effects,flags:{runarcana:{originManaged:true,originAction:d.id,originPower:d,originRecovery:d.recovery??'none',canonicalId:canonicalId?canonicalId+'#action-'+d.id:undefined,sourceUrl,sourceHash:d.sourceHash,freeRider:d.freeRider??null}}};
}
function escapeHtml(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');}
