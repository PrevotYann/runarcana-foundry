/** Reviewed origin actions; equipment decisions and conditional riders remain manual. */
export function originAction(definition,{canonicalId,sourceUrl,spent=0}={}) {
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
function escapeHtml(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');}
