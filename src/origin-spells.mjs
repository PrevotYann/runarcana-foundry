/** Native innate spell grants; general spell automation remains a separate phase. */
export function originSpellLevel(definition,level,originalLevel){
  return (definition.castLevels??[]).filter(([minimum])=>level>=minimum).at(-1)?.[1]??originalLevel;
}
export function originSpellGrant(source,definition,{castingAbility,level=1,spent=0}={}){
  if(source.type!=='spell'||source.getFlag('runarcana','canonicalId')!==definition.canonicalId)throw Error('RUNARCANA.Error.Source');
  const doc=source.toObject(),originalLevel=definition.originalLevel??doc.system.level;
  delete doc._id;delete doc._key;delete doc.folder;
  doc.system.ability=definition.ability==='selected'?castingAbility:definition.ability??'';
  if(definition.ability==='selected'&&!['cha','wis'].includes(castingAbility))throw Error('RUNARCANA.Error.Choices');
  doc.system.method='innate';doc.system.prepared=1;doc.system.level=originSpellLevel(definition,level,originalLevel);
  for(const activity of Object.values(doc.system.activities??{}))activity.consumption={spellSlot:false,targets:definition.max?[{type:'itemUses',target:'',value:'1'}]:[]};
  if(definition.max)doc.system.uses={max:definition.max,spent,recovery:[]};
  const flags=doc.flags.runarcana;Object.assign(flags,{originManaged:true,originAction:'innate-'+definition.spell,originSpellGrant:{...definition,originalLevel},originRecovery:definition.recovery??'none'});
  if(definition.spell==='arcane-shot'&&flags.sourceHash==='ab570af3e88b24adb2702689fd750fd28e22b03963554ba0602d3da6866b4e11'){
    const id='rcOriginCast0001';
    doc.system.activities={[id]:{_id:id,name:doc.name,type:'save',activation:{type:'action',value:1},consumption:{spellSlot:false,targets:[]},range:{override:true,units:'self',value:''},target:{override:true,template:{type:'line',size:'20',width:'5',units:'ft'},affects:{type:'creature',count:'1',special:'First creature hit only'},prompt:true},save:{ability:['dex'],dc:{calculation:'spellcasting',formula:''}},damage:{onSave:'none',parts:[{custom:{enabled:true,formula:'(1 + floor((@details.level + 1) / 6))d10'},types:[level>=11?'runic':'force'],scaling:{mode:'',number:1,formula:''}}]}}};
    flags.reviewedInnateActivity=true;
  }
  if(definition.cedar&&flags.sourceHash==='c7e96c91e112a37869beba795911f57b68e1c583662257a1af542da49ab734f9'){
    const id='rcSaplingBurst01',radius=doc.system.level===1?5:10,dice=doc.system.level===1?2:4+2*Math.max(0,doc.system.level-3);
    doc.system.activities[id]={_id:id,name:'Sapling explosion',type:'save',activation:{type:'special',value:1,condition:'When the sapling explodes; one explosion per casting.'},consumption:{spellSlot:false,targets:[]},range:{override:true,units:'self',value:''},target:{override:true,template:{type:'sphere',size:String(radius),units:'ft'},affects:{type:'creature',count:''},prompt:true},save:{ability:['dex'],dc:{calculation:'spellcasting',formula:''}},damage:{onSave:'none',parts:[{number:dice,denomination:6,types:['force'],custom:{enabled:false},scaling:{mode:'',number:1,formula:''}}]}};
  }
  if(definition.cedar&&flags.sourceHash!=='c7e96c91e112a37869beba795911f57b68e1c583662257a1af542da49ab734f9')flags.innateSourceReviewRequired=true;
  return doc;
}
