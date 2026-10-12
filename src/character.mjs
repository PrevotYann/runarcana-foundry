import {applyRegionalChoices,REGIONAL_RULES} from './regional.mjs';
import {ooviLanguages} from './languages.mjs';
export const ABILITIES=['str','dex','con','int','wis','cha'];
export const SKILLS=['acr','ani','arc','ath','dec','his','ins','itm','inv','med','nat','prc','prf','per','rel','slt','ste','sur','tec'];
export const MARTIAL_WEAPONS=['battleaxe','blowgun','flail','glaive','greataxe','greatsword','halberd','handcrossbow','heavycrossbow','lance','longbow','longsword','maul','morningstar','pike','rapier','scimitar','shortsword','trident','warpick','warhammer','whip'];
export const WEAPONS=[...MARTIAL_WEAPONS,'club','dagger','dart','greatclub','handaxe','javelin','lightcrossbow','lighthammer','mace','musket','pistol','quarterstaff','sickle','spear','shortbow','sling'];
export const REGIONS={'Bilgewater':['Bilgewatrian','Buhru'],'Demacia':['Demacian'],'Freljord':['Freljordian'],'Ionia':['Ionian'],'Ixtal':['Ixtali'],'Kumungu':['Ixtali'],'Noxus':['Noxian'],'Piltover':['Zaunite'],'Shurima':['Shuriman','Noxian'],'Targon':['Targonian','Rakkor'],'Zaun':['Zaunite'],'Bandle City':['Yordle'],'Nazumah':['Nazumite'],'Shadow Isles':['Helian','Spiritual']};
const fail=()=>{throw new Error('RUNARCANA.Error.Choices');};
const array=x=>Array.isArray(x)?x:[];
export function originHeritageBudget(plan,level,pool='origin') {
  if(!['origin','region'].includes(pool)||!Number.isInteger(level)||level<0)fail();
  if(pool==='region')return plan.regionPoints;
  return plan.heritagePoints+(plan.heritagePoints>0?[5,9,13,17].filter(n=>level>=n).length:0);
}
export function validateAbilityGeneration(abilities,method='manual',rolled=[]) {
  const values=Object.values(abilities),costs={8:0,9:1,10:2,11:3,12:4,13:5,14:7,15:9};
  if(method==='pointBuy'){
    if(values.some(v=>costs[v]===undefined))fail();const spent=values.reduce((n,v)=>n+costs[v],0);if(spent>27)throw new Error('RUNARCANA.Error.Budget');return {method,spent,remaining:27-spent};
  }
  const sorted=a=>[...a].sort((a,b)=>a-b).join(',');
  if(method==='standard'&&sorted(values)!=='8,10,12,13,14,15')fail();
  if(method==='rolling'&&(rolled.length!==6||rolled.some(v=>!Number.isInteger(v)||v<3||v>18)||sorted(values)!==sorted(rolled)))fail();
  if(!['manual','standard','rolling','pointBuy'].includes(method))fail();return {method};
}

/** Pure, source-backed creation preview. Submitted mechanics are never accepted from the client. */
export function characterPlan(profile,selection,{knownSkills={},knownCrafts=[]}={}) {
  if(profile?.schema!==1)throw new Error('RUNARCANA.Error.Source');
  const {abilities,plusTwo,plusOne,size,region,regionLanguage,choices={}}=selection;
  if(Object.keys(abilities??{}).sort().join(',')!=='cha,con,dex,int,str,wis'||Object.values(abilities).some(v=>!Number.isInteger(v)||v<1||v>30)||!ABILITIES.includes(plusTwo)||!ABILITIES.includes(plusOne)||plusTwo===plusOne)fail();
  const generation=validateAbilityGeneration(abilities,selection.method,selection.rolled);
  const variant=profile.variants.find(v=>v.id===selection.variant);
  if(profile.variants.length&&!variant||!profile.variants.length&&selection.variant)fail();
  if(!(variant?.sizes??profile.sizes).includes(size)||!REGIONS[region]||(variant?.region??profile.region)&&region!==(variant?.region??profile.region))fail();
  const p={origin:profile.origin,variant:variant?.name,size,region,abilities:{...abilities},boosts:Object.fromEntries(ABILITIES.map(k=>[k,k===plusTwo?2:k===plusOne?1:0])),movement:{...profile.movement,...variant?.movement},senses:{...profile.senses,...variant?.senses},skills:{...profile.skills,...variant?.skills},languages:[...array(profile.languages),...array(variant?.languages)],customProficiencies:[...array(variant?.customProficiencies)],resistance:[...array(profile.resistance),...array(variant?.resistance)],immunity:array(variant?.immunity),conditionImmunity:array(variant?.conditionImmunity),heritagePoints:profile.heritagePoints,regionPoints:profile.regionPoints,ac:variant?.ac,hpPerLevel:profile.hpPerLevel,acBonus:variant?.acBonus,selectedOptions:[],notes:[profile.notes,variant?.notes].filter(Boolean),variantUuid:variant?.uuid};
  if(profile.origin!=='Runeborn'&&profile.origin!=='Chireans'&&!REGIONAL_RULES[region]) {
    if(!REGIONS[region].includes(regionLanguage))fail();p.languages.push(regionLanguage);
  }
  if(profile.origin!=='Runeborn')applyRegionalChoices(p,selection.regional);
  function choice(c,value) {
    if((value===undefined||value==='')&&c.optional)return;
    if(c.type==='skill') {if(!(c.options??SKILLS).includes(value))fail();p.skills[value]=c.expertiseIfKnown&&(Number(knownSkills[value])>=1||p.skills[value]>=1)?2:Math.max(p.skills[value]??0,1);}
    else if(c.type==='ability') {if(!c.options.includes(value))fail();p.castingAbility=value;}
    else if(c.type==='damage') {if(!c.options.includes(value))fail();p.resistance.push(value);}
    else if(c.type==='option') {const o=c.options.find(o=>o.id===value);if(!o)fail();p.selectedOptions.push(o);}
    else if(c.type==='languages') {const v=ooviLanguages(value,p.languages);if(!v)fail();p.languages.push(...v);}
    else if(c.type==='proficiency') {
      if(typeof value!=='string')fail();
      const [kind,...parts]=value.split(':');const key=parts.join(':');
      if(kind==='skill')choice({type:'skill'},key);
      else if(kind==='craft')choice({type:'craft'},key);
      else if(kind==='weapon'&&MARTIAL_WEAPONS.includes(key)) {p.weapons??=[];p.weapons.push(key);}
      else fail();
    }
    else if(c.type==='craft') {if(typeof value!=='string'||!value.trim()||value.length>100)fail();p.customProficiencies.push(value.trim());}
    else fail();
  }
  for(const c of [...profile.choices,...array(variant?.choices)])choice(c,choices[c.id]);
  if(profile.origin==='Construct') {
    const mode=selection.armorMode;if(!profile.armorModes.includes(mode)||mode==='heavy'&&!['Brutal','Envoy'].includes(variant.name))fail();
    if(mode==='medium'&&!selection.armorProficiencies?.includes('medium')||mode==='heavy'&&!selection.armorProficiencies?.includes('heavy'))throw new Error('RUNARCANA.Error.Prerequisite');
    p.ac={null:null,light:'13 + @abilities.dex.mod',medium:'16 + min(2, @abilities.dex.mod)',heavy:'19'}[mode];p.acBonus=mode==='null'?'1':null;p.damageReduction={null:0,light:0,medium:1,heavy:2}[mode];
  }
  p.hpOverall=profile.hpOverall;
  p.underwaterVision=variant?.underwaterVision;p.heavyWeaponSpeed=variant?.heavyWeaponSpeed;
  p.naturalWeapons=[...array(profile.naturalWeapons),...array(variant?.naturalWeapons)].map(w=>({...w}));
  p.actions=[...array(profile.actions),...array(variant?.actions)].map(a=>({...a}));
  p.actionsReviewRequired=Boolean(profile.actionsReviewRequired||variant?.actionsReviewRequired);
  p.generation=generation;
  p.elementalDefense=variant?.elementalDefense;p.initiativeAdvantage=variant?.initiativeAdvantage;p.strengthReduction=variant?.strengthReduction;
  if(profile.origin==='Runeborn')runebornPlan(profile,selection,p,choice,knownSkills,knownCrafts);
  if(profile.origin==='Runeborn'&&p.selectedOptions.some(o=>o.name==='Native'))applyRegionalChoices(p,selection.regional,{native:true});
  for(const k of ABILITIES){p.abilities[k]+=p.boosts[k];if(p.abilities[k]>30)fail();}
  p.languages=[...new Set(p.languages)];return p;
}

function runebornPlan(profile,selection,p,choice,knownSkills,knownCrafts) {
  const allowances={controlled:[3,2],moderate:[4,3],strong:[6,4]}[selection.runebornPower];if(!allowances)fail();
  const rows=array(selection.traits),seen=new Map(),counts={'Minor Traits':0,'Major Traits':0,'Superior Traits':0};let credit=0;
  const conversions=selection.conversions??{};
  if(![0,1].includes(conversions.minor??0)||![0,1].includes(conversions.major??0))fail();
  const named=new Set(rows.map(r=>profile.runeborn.find(t=>t.id===r.id)?.name));
  for(const row of [...rows].sort((a,b)=>Number(profile.runeborn.find(t=>t.id===a.id)?.category==='Disadvantages')-Number(profile.runeborn.find(t=>t.id===b.id)?.category==='Disadvantages'))) {
    const trait=profile.runeborn.find(t=>t.id===row.id);if(!trait)fail();const n=(seen.get(row.id)??0)+1;seen.set(row.id,n);
    const d=trait.description,name=trait.name,disadvantage=trait.category==='Disadvantages';
    const repeatable=/each time|more than once|15[,. ]+15|additional Sense/i.test(d)||['Climber','Winged','Burrowing','Skillfull'].includes(name);
    if(n>1&&(!disadvantage&&!repeatable||disadvantage&&trait.group.includes('Magic'))||name==='Skillfull'&&n>2)fail();
    const prerequisites={'Spider Climbing':'Climber','Float':'Winged','Telepathic Reunion':'Telepathic Communication','Magic Resistance':'Natural Resistance','Legendary Resistance':'Magic Resistance','Absorption':'Legendary Resistance'};
    if(prerequisites[name]&&!named.has(prerequisites[name]))throw new Error('RUNARCANA.Error.Prerequisite');
    p.selectedOptions.push({name,description:d+(row.value?'\nChoice: '+row.value:'')});
    if(disadvantage){credit+=trait.points;
      if(trait.group==='Speed')for(const k of Object.keys(p.movement))p.movement[k]-=5;
      if(trait.group==='Attribute Reduction'){if(!ABILITIES.includes(row.value)||p.boosts[row.value]<1)fail();p.boosts[row.value]--;}
      continue;
    }
    counts[trait.category]++;
    if(['Aquatic','Climber','Winged','Burrowing'].includes(name)){const mode={Aquatic:'swim',Climber:'climb',Winged:'fly',Burrowing:'burrow'}[name];p.movement[mode]=(p.movement[mode]??0)+(n<=2?15:10);}
    if(name==='Fast Walker')p.movement.walk+=10;
    if(name==='Little Keychain'){p.size='tiny';p.movement.walk-=5;}
    if(name==='Night Vision'){if(n>4)fail();p.senses.darkvision=n*30;}
    if(name==='Telepathic Communication')p.senses.special=`Telepathy ${60+(n-1)*10} ft`;
    if(name==='Heritage')p.heritagePoints=2;
    if(name==='Skill'){if(!SKILLS.includes(row.value))fail();p.skills[row.value]=Math.max(p.skills[row.value]??0,1);}
    if(name==='Specialist'){
      if(!SKILLS.includes(row.value))fail();
      const granted=rows.some(r=>r.value===row.value&&profile.runeborn.find(t=>t.id===r.id)?.name==='Skill');
      if(!granted&&!(knownSkills[row.value]>=1))throw new Error('RUNARCANA.Error.Prerequisite');p.skills[row.value]=2;
    }
    if(name==='Skillfull'){
      if(typeof row.value!=='string')fail();const [kind,...parts]=row.value.split(':'),key=parts.join(':');
      if(kind==='skill'){
        if(!SKILLS.includes(key))fail();const granted=rows.some(r=>r.value===key&&profile.runeborn.find(t=>t.id===r.id)?.name==='Skill');
        if(!granted&&!(knownSkills[key]>=1))throw new Error('RUNARCANA.Error.Prerequisite');p.skillAdvantages??=[];p.skillAdvantages.push(key);
      }else if(kind==='craft'&&key.trim()){
        const granted=rows.some(r=>r.value===key&&profile.runeborn.find(t=>t.id===r.id)?.name==='Artisan');
        if(!granted&&!knownCrafts.includes(key))throw new Error('RUNARCANA.Error.Prerequisite');p.craftAdvantages??=[];p.craftAdvantages.push(key);
      }else fail();
    }
    if(['Communication','Ancestral Communication'].includes(name)){if(typeof row.value!=='string'||!row.value.trim())fail();p.languages.push(row.value.trim());}
    if(name==='Artisan')choice({type:'craft'},row.value);
    if(name==='Military'){if(!WEAPONS.includes(row.value))fail();p.weapons??=[];p.weapons.push(row.value);}
    if(['Tail','Horns','Claws','Fangs','Poisonous Stinger'].includes(name)){
      const options=name==='Claws'?['slashing','piercing']:['Tail','Horns'].includes(name)?['bludgeoning','piercing']:['piercing'];
      const damage=options.length===1?options[0]:row.value;if(!options.includes(damage))fail();
      p.naturalWeapons.push({id:name.toLowerCase().replaceAll(' ','-'),name,number:1,denomination:name==='Horns'?6:4,damageType:damage,ability:name==='Claws'?'':'str',bonus:'',bonusAction:name!=='Poisonous Stinger',reach:name==='Tail'?10:5,noDamageAbility:name==='Poisonous Stinger'});
    }
    if(name==='Natural Resistance')choice({type:'damage',options:['acid','lightning','fire','cold','thunder','poison','force','necrotic','psychic','radiant','bludgeoning','slashing','piercing']},row.value);
    if(name==='Natural Armor'){if(!ABILITIES.filter(k=>k!=='dex').includes(row.value))fail();p.ac=`10 + @abilities.dex.mod + @abilities.${row.value}.mod`;}
    if(name==='Special Senses'){if(!['blindsight','tremorsense'].includes(row.value))fail();p.senses[row.value]=10;}
    if(name==='Constructed')p.resistance.push('poison');
    if(['Breath Weapon','Sharp Senses','Innate Spellcasting','Improved Innate Spellcasting'].includes(name)){
      const options={ 'Breath Weapon':['acid','lightning','cold','fire','thunder','poison'],'Sharp Senses':['hearing','smell','sight'],'Innate Spellcasting':['str','dex','con','int','wis','cha'],'Improved Innate Spellcasting':['int','wis','cha']}[name];if(!options.includes(row.value))fail();
      if(name.includes('Spellcasting'))p.castingAbility=row.value;
    }
  }
  credit+=(conversions.minor??0)+2*(conversions.major??0);
  const spent=Math.max(0,counts['Minor Traits']-(allowances[0]-(conversions.minor??0)))+3*Math.max(0,counts['Major Traits']-(allowances[1]-(conversions.major??0)))+6*counts['Superior Traits'];
  if(spent>credit)throw new Error('RUNARCANA.Error.Budget');
  if(Object.values(p.movement).some(v=>v<0))fail();
  p.runebornBudget={spent,credit,remaining:credit-spent};
}

/** Native transferable effects disappear when the managed origin is replaced. */
export function originEffects(plan,{level=1,underwater=false,heavyWeapon=false}={}) {
  const changes=[];const add=(key,value,mode=2)=>changes.push({_id:'rcOrigin'+String(changes.length).padStart(8,'0'),key,value:String(value),type:{2:'add',4:'upgrade',5:'override'}[mode],phase:'initial',priority:20});
  add('system.traits.size',plan.size,5);
  for(const [k,v]of Object.entries(plan.movement))add('system.attributes.movement.speeds.'+k,k==='walk'&&heavyWeapon&&plan.heavyWeaponSpeed?plan.heavyWeaponSpeed:v,5);
  add('system.attributes.movement.units','ft',5);
  const senses={...plan.senses};if(underwater&&plan.underwaterVision)senses.darkvision=plan.underwaterVision;
  if(Object.keys(senses).length)add('system.attributes.senses.units','ft',5);
  for(const [k,v]of Object.entries(senses))add('system.attributes.senses.'+(k==='special'?'special':'ranges.'+k),v,5);
  for(const [k,v]of Object.entries(plan.skills))add('system.skills.'+k+'.value',v,4);
  if(plan.customProficiencies?.length)add('system.tools.runarcanaCraft.value','0.5',4);
  for(const k of new Set(plan.skillAdvantages??[]))add('system.skills.'+k+'.roll.mode','1');
  const resistance=[...plan.resistance];
  if(plan.elementalDefense&&level>=15)resistance.push(plan.elementalDefense[1]);
  for(const type of new Set(resistance))add('system.traits.dr.value',type);
  for(const type of plan.immunity)add('system.traits.di.value',type);
  for(const type of plan.conditionImmunity)add('system.traits.ci.value',type);
  if(plan.languages.length)add('system.traits.languages.custom','; '+plan.languages.join('; '));
  if(plan.hpOverall)add('system.attributes.hp.bonuses.overall',plan.hpOverall);
  for(const key of plan.weapons??[])add('system.traits.weaponProf.value',key);
  if(plan.acBonus)add('system.attributes.ac.bonus',plan.acBonus);
  if(plan.initiativeAdvantage)add('system.attributes.init.roll.mode','1');
  return [{name:'Runarcana — '+plan.origin+(plan.variant?' / '+plan.variant:''),type:'base',transfer:true,disabled:false,system:{changes},flags:{runarcana:{originManaged:true}}}];
}
