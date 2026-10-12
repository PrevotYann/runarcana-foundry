import {CRAFTS} from './generated/character-options.mjs';
export {CRAFTS};
const normalized=value=>String(value??'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function craftIdentity(row){return row.id+':'+normalized(row.specialty);}
export function craftFromName(name){
  const value=String(name).replace(/^(?:Minor craft|Craft):\s*/i,'');
  for(const craft of CRAFTS){
    if(normalized(craft.name)===normalized(value))return {craft,specialty:''};
    if(value.toLowerCase().startsWith(craft.name.toLowerCase()+': '))return {craft,specialty:value.slice(craft.name.length+2).trim()};
    const suffix=value.match(/^(.*) \(([^)]+)\)$/);if(suffix&&normalized(craft.name)===normalized(suffix[1]))return {craft,specialty:suffix[2]};
  }
  return null;
}
export function knownCrafts(items){
  return items.filter(i=>i.type==='tool'&&(i.system.proficiencyMultiplier??i.system.proficient)>0).map(i=>{
    const flags=i.flags?.runarcana??{};
    const match=craftFromName(i.name),craft=CRAFTS.find(c=>c.id===flags.craftId)??match?.craft;
    return craft?{id:craft.id,specialty:flags.craftSpecialty??match?.specialty??'',multiplier:i.system.proficiencyMultiplier??i.system.proficient}:null;
  }).filter(Boolean);
}
export function trainingOptions(rules,options={},context={}){
  const choice=rules.mechanics?.trainingChoice,rows=options.training??[];
  if(!Array.isArray(rows)||rows.length!==(choice?.count??0))return {valid:false,rows:[]};
  const selected=[],seen=new Set();
  for(const row of rows){
    if(!row||!['skill','craft'].includes(row.kind))return {valid:false,rows:[]};
    if(row.kind==='skill'){
      if(!choice.skills.includes(row.id)||choice.newOnly&&(context.skills?.[row.id]??0)>=1)return {valid:false,rows:[]};
      const key='skill:'+row.id;if(seen.has(key))return {valid:false,rows:[]};seen.add(key);selected.push({kind:'skill',id:row.id});
    }else{
      const c=CRAFTS.find(c=>c.id===row.id);if(!c||!(choice.crafts==='all'||choice.crafts==='guide'&&c.craft==='Guide'||Array.isArray(choice.crafts)&&choice.crafts.includes(c.id)))return {valid:false,rows:[]};
      const specialty=typeof row.specialty==='string'?row.specialty.trim():'';
      if(c.specialtyRequired?(!specialty||specialty.length>100):!!specialty)return {valid:false,rows:[]};
      if(choice.specialtyOptions?.[c.id]&&!choice.specialtyOptions[c.id].includes(specialty))return {valid:false,rows:[]};
      const result={kind:'craft',id:c.id,...(specialty?{specialty}:{})},key=craftIdentity(result);
      if(seen.has(key)||choice.newOnly&&context.crafts?.some(c=>craftIdentity(c)===key))return {valid:false,rows:[]};
      seen.add(key);selected.push(result);
    }
  }
  return {valid:true,rows:selected};
}
export function heritageTools(rules,options,{known=[],choiceId}={}){
  const rows=[...(options.training??[]).filter(r=>r.kind==='craft'),...(rules.mechanics?.fixedCrafts??[]).map(id=>({id}))];
  return rows.map(row=>{
    const c=CRAFTS.find(c=>c.id===row.id);if(!c)throw Error('RUNARCANA.Error.Source');
    const previous=known.filter(k=>craftIdentity(k)===craftIdentity(row)),expert=!!rules.mechanics.trainingChoice?.expert||!!rules.mechanics.craftExpertiseIfKnown&&previous.some(k=>k.multiplier>0);
    const proficient=Math.max(expert?1:0.5,...previous.map(k=>k.multiplier));
    const name=c.name+(row.specialty?' ('+row.specialty+')':'');
    const esc=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
    return {name,type:'tool',system:{type:{value:'',baseItem:'runarcanaCraft'},proficient,ability:c.ability,bonus:expert&&previous.some(k=>k.multiplier>=1)?'1':'',description:{value:`<p>${esc(name)}</p><p><a href="${esc(c.sourceUrl)}">${esc(c.craft)}</a></p>`},activities:{rcHeritageCheck1:{_id:'rcHeritageCheck1',type:'check',name,activation:{type:'action',value:1},check:{ability:c.ability,associated:['runarcanaCraft'],dc:{calculation:'',formula:''}}}}},flags:{runarcana:{heritageManaged:true,heritageChoice:choiceId,craftId:c.id,craftSpecialty:row.specialty??'',craftExpert:expert||previous.some(k=>k.multiplier>=1),creationProficiency:true,sourceUrl:c.sourceUrl,sourceHash:c.sourceHash,mechanicalCoverage:'partial'}}};
  });
}
