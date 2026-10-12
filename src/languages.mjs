import {LANGUAGES} from './generated/character-options.mjs';
export {LANGUAGES};
const normalize=value=>String(value).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const aliases={minotaur:'minotauric',bilgewatrian:'bilgewateran',bilgewatrianes:'bilgewateran',shurimane:'shuriman',freljordian:'freljordan',piltovan:'zaunite',piltovian:'zaunite','zaunite piltovian':'zaunite','va noxian':'noxian',fey:'faeric'};
export function languageIdentity(value){const n=normalize(value);return aliases[n]??n;}
export function languageChoices(values,{count,category,known=[]}={}){
  if(!Array.isArray(values)||values.length!==count)return null;
  const selected=[],seen=new Set(known.map(languageIdentity));
  for(const value of values){
    const language=LANGUAGES.find(l=>l.name===value&&l.category===category),id=languageIdentity(value);
    if(!language||seen.has(id))return null;seen.add(id);selected.push(language.name);
  }
  return selected;
}
export function ooviLanguages(values,known=[]){
  return languageChoices(values,{count:1,category:'exotic',known})??languageChoices(values,{count:2,category:'common',known});
}
