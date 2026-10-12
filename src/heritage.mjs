import {trainingOptions} from './crafts.mjs';
import {heritageWeaponSelection,hasFirearmProficiency} from './heritage-weapons.mjs';
import {languageChoices} from './languages.mjs';
/** Universal heritage cost, pool restrictions and conservative prerequisite checks. */
const norm=value=>String(value).normalize('NFKD').replaceAll('æ','ae').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const origins={antroplant:'Antroplantae',antroplantae:'Antroplantae',chirean:'Chireans',chireans:'Chireans',chireano:'Chireans',chireanos:'Chireans',construct:'Construct',constructs:'Construct',human:'Human',humans:'Human',minotaur:'Minotaur',minotaurs:'Minotaur','half dragon':'Half-Dragon',troll:'Troll',vastaya:'Vastaya',vastayas:'Vastaya',yordle:'Yordle'};
const regions={bilgewater:'Bilgewater',bilgewatrian:'Bilgewater',bandlecity:'Bandle City',bandopolitense:'Bandle City',demacian:'Demacia',freljordan:'Freljord',freljordian:'Freljord',ionian:'Ionia',ixtali:'Ixtal',nazumite:'Nazumah',noxian:'Noxus',piltovan:'Piltover',shuriman:'Shurima',targonian:'Targon',zaunite:'Zaun'};
const variants={floral:'Floral',shimon:'Shimon',vesani:'Vesani',marai:'Marai',ottrani:'Ottrani',fauhwoon:'Fauhwoon',lhotlan:'Lhotlan',kiilash:'Kiilash',kiilashi:'Kiilash','aurochs minotaur':'Aurochs','auroch minotaur':'Aurochs','aelus minotaur':'Aelus','alnuk minotaur':'Alnuk','ocean half dragon':'Ocean Elemental','glacial half dragon':'Glacial Elemental','infernal half dragon':'Infernal Elemental','mountain half dragon':'Mountain Elemental','clouds half dragon':'Cloud Elemental','brutal construct':'Brutal','envoy construct':'Envoy','nimble construct':'Nimble','ice troll':'Ice Troll','sand troll':'Sand Troll','jungle troll':'Jungle Troll','aquatic yordle':'Aquatic','fuzzy yordle':'Fluffy'};
export function heritageEligibility(rules,{origin,variant,region,level,initial,classes=[],abilities={},pool='origin',count=0,existingNames=[],weaponProficiencies=[]}) {
  const errors=[],manual=[];
  if(rules?.schema!==1)return {valid:false,errors:['RUNARCANA.Error.Source'],manual:[]};
  if(rules.maxCount!==null&&count>=rules.maxCount)errors.push('RUNARCANA.Error.DuplicateChoice');
  if(count>0&&rules.repeatReviewRequired)manual.push('A different tribal form is required; form selection and transformation require GM review.');
  if((rules.initial||rules.repeatInitial&&count>0||pool==='region')&&!initial)errors.push('RUNARCANA.Error.InitialHeritage');
  if(pool==='origin'&&!rules.general&&!rules.origins.length&&!rules.unlisted||pool==='region'&&!rules.general&&!rules.regions.length&&!rules.unlisted)errors.push('RUNARCANA.Error.HeritagePool');
  if(rules.unlisted)manual.push('Not classified by the source heritage index.');
  if(!rules.general&&!rules.unlisted){
    if(pool==='origin'&&rules.origins.length&&!rules.origins.some(name=>origins[norm(name)]===origin))errors.push('RUNARCANA.Error.Prerequisite');
    if(pool==='region'&&rules.regions.length&&!rules.regions.some(name=>(regions[norm(name)]??name)===region))errors.push('RUNARCANA.Error.Prerequisite');
  }
  const identity=raw=>{
    const n=norm(raw);if(origins[n])return origins[n]===origin;if(regions[n])return regions[n]===region;
    const v=n.replace(/^vastaya /,'').replace(/ antroplantae$/,'');if(variants[v])return variants[v]===variant;
    if(['acolyte','arcanist','bodhisattva','brute','combatant','hunter','marksman','mercurial','shaman'].includes(n))return classes.some(c=>norm(c)===n);
    if(['initial','starter'].includes(n))return initial;
    if(n==='proficiency with a firearm')return hasFirearmProficiency(weaponProficiencies);
    return null;
  };
  const req=rules.requirement;
  if(req){
    const alternatives=req.split(/,|\s+or\s+/i).map(s=>s.trim()),values=alternatives.map(identity);
    if(/\bor\b/i.test(req)&&values.every(v=>v!==null)){if(!values.some(Boolean))errors.push('RUNARCANA.Error.Prerequisite');}
    else for(const part of req.split(',').map(s=>s.trim())){
      const result=identity(part);
      if(result===false)errors.push('RUNARCANA.Error.Prerequisite');
      else if(result===null){
        const m=part.match(/^(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+(\d+)(.*)$/i);
        if(m){const key={strength:'str',dexterity:'dex',constitution:'con',intelligence:'int',wisdom:'wis',charisma:'cha'}[m[1].toLowerCase()];if((abilities[key]??0)<Number(m[2]))errors.push('RUNARCANA.Error.Prerequisite');if(m[3].trim())manual.push(m[3].replace(/^\s*and\s*/i,''));}
        else if(/^not having /i.test(part)) {const excluded=part.replace(/^not having /i,'').replace(/ Heritage$/i,'').split(/\s+or\s+/i);if(existingNames.some(n=>excluded.some(e=>norm(n)===norm(e))))errors.push('RUNARCANA.Error.Prerequisite');}
        else manual.push(part);
      }
    }
  }
  if(manual.length)errors.push('RUNARCANA.Error.ManualPrerequisite');
  return {valid:errors.length===0,errors:[...new Set(errors)],manual};
}
export function heritageOptions(rules,options={},context={}) {
  if(!options||typeof options!=='object')return {valid:false,errors:['RUNARCANA.Error.Choices'],options:{skills:[]}};
  const choice=rules.mechanics?.skillChoice,skills=options.skills??[];
  const resistance=rules.mechanics?.resistanceChoice;
  const training=trainingOptions(rules,options,context);
  const weapon=heritageWeaponSelection(rules,options,context);
  const languageRule=rules.mechanics?.languageChoice,languages=languageChoices(options.languages??[],{count:languageRule?.count??0,category:languageRule?.category,known:context.languages??[]});
  const valid=!!languages&&weapon.valid&&training.valid&&Array.isArray(skills)&&(!choice?skills.length===0:skills.length===choice.count&&new Set(skills).size===skills.length&&skills.every(s=>choice.options.includes(s)))&&(!resistance?!options.damage:resistance.includes(options.damage)&&!context.resistance?.includes(options.damage));
  return {valid,errors:valid?[]:['RUNARCANA.Error.Choices'],options:{skills:valid?[...skills]:[],...(valid&&resistance?{damage:options.damage}:{}),...(valid&&rules.mechanics?.trainingChoice?{training:training.rows}:{}),...(valid&&weapon.weapon?{weapon:weapon.weapon}:{}),...(valid&&languageRule?{languages}:{})}};
}
export function heritageEffects(rules,{skills={},options={},context={}}={}) {
  const m=rules.mechanics;if(!m)return [];
  const selection=heritageOptions(rules,options,context);if(!selection.valid)throw new Error('RUNARCANA.Error.Choices');
  const changes=[];const add=(key,value,type='add')=>changes.push({_id:'rcHeritage'+String(changes.length).padStart(6,'0'),key,value:String(value),type,phase:'initial',priority:30});
  for(const [key,value]of Object.entries(m.skills??{}))add('system.skills.'+key+'.value',m.expertiseIfKnown?.includes(key)&&skills[key]>=1?2:value,'upgrade');
  for(const key of selection.options.skills){
    add('system.skills.'+key+'.value',m.skillChoice.expertiseIfKnown&&skills[key]>=1?2:1,'upgrade');
    if(m.skillChoice.advantageIfKnown&&skills[key]>=1)add('system.skills.'+key+'.roll.mode',1,'upgrade');
  }
  for(const row of selection.options.training??[])if(row.kind==='skill')add('system.skills.'+row.id+'.value',1,'upgrade');
  for(const key of m.weapons??[])add('system.traits.weaponProf.value',key);
  if(selection.options.weapon)add('system.traits.weaponProf.value',selection.options.weapon);
  if(selection.options.languages?.length)add('system.traits.languages.custom','; '+selection.options.languages.join('; '));
  if(m.resistanceChoice)add('system.traits.dr.value',selection.options.damage);
  for(const [key,value]of Object.entries(m.sensesAdd??{}))add('system.attributes.senses.ranges.'+key,value);
  for(const [key,value]of Object.entries(m.sensesMinimum??{}))add('system.attributes.senses.ranges.'+key,value,'upgrade');
  if(m.sensesAdd||m.sensesMinimum)add('system.attributes.senses.units','ft','override');
  if(m.passivePerception)add('system.skills.prc.bonuses.passive',m.passivePerception);
  return changes.length?[{name:rules.name,type:'base',transfer:true,system:{changes},flags:{runarcana:{heritageManaged:true}}}]:[];
}
