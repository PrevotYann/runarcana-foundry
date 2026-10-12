import {ABILITIES,SKILLS,REGIONS,MARTIAL_WEAPONS,WEAPONS} from './character.mjs';

export async function renderCharacterForm(root,{actor,onCreated}={}) {
  const api=game.modules.get('runarcana').api,t=k=>game.i18n.localize('RUNARCANA.'+k);
  const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
  const input=(type,value)=>{const e=node('input');e.type=type;e.value=value??'';return e;};
  const select=(options,value)=>{const e=node('select');for(const [v,label]of options){const o=node('option',label);o.value=v;e.append(o);}if(value!==undefined&&options.some(([v])=>v===value))e.value=value;return e;};
  const label=(parent,text,control)=>{const e=node('label',text);e.append(control);parent.append(e);return control;};
  const saved=actor?.getFlag('runarcana','originSelection'),initial=saved?.selection??{};
  const form=node('div');form.className='runarcana-form';root.append(node('p',t('Creation.Hint')),form);
  const name=label(form,t('Creature.Name'),input('text',actor?.name??''));name.disabled=!!actor;
  const origin=label(form,t('Creation.Origin'),select([['',t('Creation.Select')]],initial.originUuid));
  const origins=game.packs.get('runarcana.origins');
  for(const r of await origins.getIndex()){const o=node('option',r.name);o.value=`Compendium.runarcana.origins.Item.${r._id}`;origin.append(o);}origin.value=initial.originUuid??'';
  let cls;
  if(!actor){cls=label(form,t('Creation.Class'),select([['',t('Creation.Select')]]));for(const r of await game.packs.get('runarcana.classes').getIndex()){const o=node('option',r.name);o.value=`Compendium.runarcana.classes.Item.${r._id}`;cls.append(o);}}
  const scores={};
  for(const [i,k]of ABILITIES.entries()){scores[k]=label(form,t('Creation.'+k),input('number',actor?actor._source.system.abilities[k].value-(saved?.plan.boosts[k]??0):[15,14,13,12,10,8][i]));scores[k].min=1;scores[k].max=30;scores[k].disabled=!!actor;}
  const method=label(form,t('Creation.MethodLabel'),select((actor?['manual']:['standard','pointBuy','rolling','manual']).map(k=>[k,t('Creation.Method.'+k)])));method.disabled=!!actor;let rolled=[];
  method.addEventListener('change',()=>{for(const [i,k]of ABILITIES.entries())scores[k].value=method.value==='standard'?[15,14,13,12,10,8][i]:method.value==='pointBuy'?8:10;});
  if(!actor){const roll=node('button',t('Creation.Roll'));roll.type='button';roll.addEventListener('click',async()=>{roll.disabled=true;try{if(!game.user.isGM)throw new Error('RUNARCANA.Error.PrimaryGM');const values=[];for(let i=0;i<6;i++){const r=await new Roll('4d6kh3').evaluate();values.push(r.total);await r.toMessage({flavor:t('Creation.Roll')});}rolled=values;method.value='rolling';for(const [i,k]of ABILITIES.entries())scores[k].value=rolled[i];invalidate();}catch(e){ui.notifications.error(game.i18n.localize(e.message));}finally{roll.disabled=false;}});form.append(roll);}
  const abilityOptions=ABILITIES.map(k=>[k,t('Creation.'+k)]);
  const two=label(form,t('Creation.PlusTwo'),select(abilityOptions,initial.plusTwo??'str')),one=label(form,t('Creation.PlusOne'),select(abilityOptions,initial.plusOne??'con'));
  const area=node('section'),output=node('pre'),actions=node('div');root.append(area,output,actions);
  let readExtras=()=>({}),preview,revision=0;
  const invalidate=()=>{preview=null;output.textContent='';};form.addEventListener('input',invalidate);area.addEventListener('input',invalidate);form.addEventListener('change',invalidate);area.addEventListener('change',invalidate);
  const skillOptions=(keys=SKILLS)=>keys.map(k=>[k,game.i18n.localize(CONFIG.DND5E.skills[k]?.label??k)]);
  const controlFor=(parent,c,value)=>{
    let e;
    if(c.type==='skill')e=select(skillOptions(c.options),value);
    else if(['ability','damage'].includes(c.type))e=select(c.options.map(k=>[k,c.type==='ability'?t('Creation.'+k):game.i18n.localize(CONFIG.DND5E.damageTypes[k]?.label??k)]),value);
    else if(c.type==='option')e=select([...(c.optional?[['',t('Creation.None')]]:[]),...c.options.map(o=>[o.id,o.name])],value);
    else if(c.type==='proficiency'){
      const group=node('span'),kind=select([['skill','Skill'],['craft','Craft'],['weapon','Martial weapon']].filter(([k])=>!c.kinds||c.kinds.includes(k)),value?.split(':')[0]??'skill'),area=node('span');let detail;
      const update=()=>{detail=kind.value==='skill'?select(skillOptions(),value?.split(':').slice(1).join(':')):kind.value==='weapon'?select(MARTIAL_WEAPONS.map(k=>[k,k]),value?.split(':').slice(1).join(':')):input('text',value?.split(':').slice(1).join(':'));area.replaceChildren(detail);};kind.addEventListener('change',update);update();group.append(kind,area);label(parent,t('Creation.Choice.'+c.id),group);return ()=>kind.value+':'+detail.value;
    }
    else e=input('text',Array.isArray(value)?value.join('; '):value);
    label(parent,t('Creation.Choice.'+c.id),e);
    return ()=>c.type==='languages'?e.value.split(';').map(s=>s.trim()).filter(Boolean):e.value;
  };
  async function loadOrigin() {
    invalidate();const rev=++revision;area.replaceChildren();readExtras=()=>({});if(!origin.value)return;
    const document=await fromUuid(origin.value);if(rev!==revision)return;
    const p=document.getFlag('runarcana','creation');if(!p){output.textContent=t('Error.Source');return;}
    const variant=label(area,t('Creation.Variant'),select(p.variants.length?p.variants.map(v=>[v.id,v.name]):[['',t('Creation.None')]],initial.originUuid===origin.value?initial.variant:undefined));
    const details=node('section');area.append(details);
    const update=()=>{
      invalidate();details.replaceChildren();const v=p.variants.find(v=>v.id===variant.value);
      const size=label(details,t('Creature.Size'),select((v?.sizes??p.sizes).map(k=>[k,game.i18n.localize(CONFIG.DND5E.actorSizes[k]?.label??CONFIG.DND5E.actorSizes[k]??k)]),initial.size));
      const fixed=v?.region??p.region;
      const region=label(details,t('Creation.Region'),select((fixed?[fixed]:Object.keys(REGIONS)).map(k=>[k,k]),initial.region));
      const language=label(details,t('Creation.RegionLanguage'),select([]));
      const languageUpdate=()=>{language.replaceChildren(...REGIONS[region.value].map(l=>{const o=node('option',l);o.value=l;return o;}));if(REGIONS[region.value].includes(initial.regionLanguage))language.value=initial.regionLanguage;};region.addEventListener('change',languageUpdate);languageUpdate();language.disabled=p.origin==='Runeborn'||p.origin==='Chireans';
      const choices={};for(const c of [...p.choices,...(v?.choices??[])])choices[c.id]=controlFor(details,c,initial.choices?.[c.id]);
      let armorMode,armorProficiencies=[];
      if(p.armorModes){armorMode=label(details,t('Creation.ArmorMode'),select(p.armorModes.filter(m=>m!=='heavy'||['Brutal','Envoy'].includes(v.name)).map(m=>[m,t('Creation.Armor.'+m)]),initial.armorMode??'light'));
        for(const k of ['medium','heavy']){const e=label(details,t('Creation.Proficient.'+k),input('checkbox'));e.checked=initial.armorProficiencies?.includes(k)??false;armorProficiencies.push([k,e]);}}
      let power,minor,major;const traitReaders=[];
      if(p.runeborn){
        power=label(details,t('Creation.RunebornPower'),select(['controlled','moderate','strong'].map(k=>[k,t('Creation.Power.'+k)]),initial.runebornPower??'controlled'));
        minor=label(details,t('Creation.ConvertMinor'),input('checkbox'));major=label(details,t('Creation.ConvertMajor'),input('checkbox'));minor.checked=!!initial.conversions?.minor;major.checked=!!initial.conversions?.major;
        const selected=node('div');details.append(selected);
        const addTrait=(row={})=>{
          const line=node('div'),pick=select(p.runeborn.map(r=>[r.id,`${r.category} — ${r.name}`]),row.id),valueArea=node('span'),description=node('p'),remove=node('button',t('Creation.Remove'));remove.type='button';let value,readChoice;
          const updateTrait=()=>{const trait=p.runeborn.find(r=>r.id===pick.value),name=trait.name;description.textContent=trait.description;
            const options=['Skill','Specialist'].includes(name)?skillOptions():name==='Natural Armor'?abilityOptions.filter(([k])=>k!=='dex'):name==='Natural Resistance'?Object.entries(CONFIG.DND5E.damageTypes).map(([k,v])=>[k,game.i18n.localize(v.label)]):name==='Breath Weapon'?['acid','lightning','cold','fire','thunder','poison'].map(k=>[k,k]):name==='Special Senses'?['blindsight','tremorsense'].map(k=>[k,k]):name==='Sharp Senses'?['hearing','smell','sight'].map(k=>[k,k]):name.includes('Spellcasting')?abilityOptions.filter(([k])=>name==='Innate Spellcasting'||['int','wis','cha'].includes(k)):trait.group==='Attribute Reduction'?abilityOptions:null;
            const weaponOptions=name==='Military'?WEAPONS.map(k=>[k,k]):['Tail','Horns','Claws'].includes(name)?(name==='Claws'?['slashing','piercing']:['bludgeoning','piercing']).map(k=>[k,game.i18n.localize(CONFIG.DND5E.damageTypes[k]?.label??k)]):null;
            if(name==='Skillfull'){valueArea.replaceChildren();readChoice=controlFor(valueArea,{id:'skillfull',type:'proficiency',kinds:['skill','craft']},row.value);}
            else{value=weaponOptions?select(weaponOptions,row.value):options?select(options,row.value):input('text',row.value);value.placeholder=t('Creation.TraitValue');valueArea.replaceChildren(value);readChoice=()=>value.value;}
          };updateTrait();pick.addEventListener('change',updateTrait);
          line.append(pick,valueArea,remove,description);selected.append(line);
          const read=()=>({id:pick.value,value:readChoice()});traitReaders.push(read);remove.addEventListener('click',()=>{traitReaders.splice(traitReaders.indexOf(read),1);line.remove();invalidate();});
        };
        for(const row of initial.traits??[])addTrait(row);
        const add=node('button',t('Creation.AddTrait'));add.type='button';add.addEventListener('click',()=>{addTrait();invalidate();});details.append(add,node('p',t('Creation.RunebornHint')));
      }
      const rules=node('details');rules.append(node('summary',t('Creation.SourceRules')),node('p',p.notes),node('p',v?.notes??''));details.append(rules);
      readExtras=()=>({variant:variant.value,size:size.value,region:region.value,regionLanguage:language.value,choices:Object.fromEntries(Object.entries(choices).map(([k,read])=>[k,read()])),...(armorMode?{armorMode:armorMode.value,armorProficiencies:armorProficiencies.filter(([,e])=>e.checked).map(([k])=>k)}:{}),...(power?{runebornPower:power.value,conversions:{minor:Number(minor.checked),major:Number(major.checked)},traits:traitReaders.map(read=>read())}:{})});
    };
    variant.addEventListener('change',update);update();
  }
  origin.addEventListener('change',()=>loadOrigin().catch(e=>ui.notifications.error(e.message)));await loadOrigin();
  const current=()=>({name:name.value,originUuid:origin.value,classUuid:cls?.value,method:method.value,rolled,abilities:Object.fromEntries(ABILITIES.map(k=>[k,Number(scores[k].value)])),plusTwo:two.value,plusOne:one.value,...readExtras()});
  const action=(text,fn)=>{const b=node('button',text);b.type='button';b.addEventListener('click',async()=>{b.disabled=true;try{await fn();}catch(e){ui.notifications.error(game.i18n.has(e.message)?game.i18n.localize(e.message):e.message);}finally{b.disabled=false;}});actions.append(b);};
  action(t('Preview'),async()=>{const s=current(),fingerprint=JSON.stringify(s);preview=null;const p=await api.previewCharacter(s,actor);if(JSON.stringify(current())!==fingerprint)return;preview={selection:s,fingerprint};output.textContent=[Object.entries(p.abilities).map(([k,v])=>`${t('Creation.'+k)}: ${v}`).join(', '),`${p.variant??p.origin} — ${p.size}; ${p.region}`,JSON.stringify(p.movement),JSON.stringify(p.senses),`${t('Creation.Languages')}: ${p.languages.join(', ')}`,`${t('Creation.Proficiencies')}: ${Object.keys(p.skills).join(', ')} ${p.customProficiencies.join(', ')}`,`${t('Creation.Heritage')}: ${p.heritagePoints} / ${p.regionPoints}`,`${t('Creation.Defenses')}: ${p.resistance.join(', ')} / ${p.immunity.join(', ')}`,p.ac?`AC: ${p.ac}`:'',p.hpOverall?`${t('Creation.BonusHP')}: ${p.hpOverall}`:'',p.castingAbility?`${t('Creation.Choice.castingAbility')}: ${t('Creation.'+p.castingAbility)}`:'',p.generation.method==='pointBuy'?`${t('Creation.PointsRemaining')}: ${p.generation.remaining}`:'',p.runebornBudget?JSON.stringify(p.runebornBudget):'',...p.selectedOptions.map(o=>o.name)].filter(Boolean).join('\n');});
  action(t(actor?'Creation.Customize':'Creation.Create'),async()=>{if(!preview||preview.fingerprint!==JSON.stringify(current()))throw new Error('RUNARCANA.Error.Preview');const s=preview.selection;preview=null;if(actor){await api.customizeOrigin(actor,s);actor.sheet.render(true);}else await onCreated(await api.beginCharacter(s));});
}
