/** Translate only text fields; never merge translation objects into mechanics. */
const TEXT_PATHS=['name','system.description.value','system.description.chat','system.details.biography.value','system.details.biography.public','description','text.content','description.value','description.chatFlavor','label','title','hint'];
const get=(obj,path)=>path.split('.').reduce((o,k)=>o?.[k],obj);
const set=(obj,path,value)=>{const keys=path.split('.');let current=obj;for(const k of keys.slice(0,-1))current=current[k]??={};current[keys.at(-1)]=value;};
function stableReferences(source,translation) {
  const refs=s=>[...s.matchAll(/@UUID\[([^\]]+)\]|href=["']([^"']+)["']/g)].map(m=>m[1]??m[2]).sort();
  return JSON.stringify(refs(source))===JSON.stringify(refs(translation));
}
export function translateText(source,translation={}) {
  const copy=structuredClone(source);
  for(const path of TEXT_PATHS) {
    const value=get(translation,path);
    if(typeof value==='string' && typeof get(copy,path)==='string' && stableReferences(get(copy,path),value))set(copy,path,value);
  }
  for(const collection of ['pages','items','effects','results','system.activities','system.advancement']) {
    const values=get(copy,collection), translated=get(translation,collection);
    if(!values || !translated)continue;
    if(Array.isArray(values))set(copy,collection,values.map(v=>translateText(v,translated[v._id]??{})));
    else if(typeof values==='object')set(copy,collection,Object.fromEntries(Object.entries(values).map(([id,v])=>[id,translateText(v,translated[id]??{})])));
  }
  return copy;
}
export function textTemplate(source) {
  const result={};
  for(const path of TEXT_PATHS)if(typeof get(source,path)==='string')set(result,path,get(source,path));
  for(const collection of ['pages','items','effects','results','system.activities','system.advancement']) {
    const values=get(source,collection);
    if(!values)continue;
    const entries=Array.isArray(values)?values:Object.values(values);
    if(entries.length)set(result,collection,Object.fromEntries(entries.map(v=>[v._id,textTemplate(v)])));
  }
  return result;
}
export function babeleConverters() {
  const nested=(value,translation)=>Array.isArray(value)?value.map(v=>translateText(v,translation?.[v._id])):
    Object.fromEntries(Object.entries(value??{}).map(([id,v])=>[id,translateText(v,translation?.[id])]));
  return {runarcanaNested:nested,runarcanaSystem:(value,translation)=>translateText({system:value},{system:translation}).system};
}
export function registerBabele(babele) {
  babele.registerConverters(babeleConverters());
  // Actual translations belong to runarcana-fr; the core only provides mappings and templates.
}
