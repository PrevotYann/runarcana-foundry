import {isMarked} from './api.mjs';
import {renderCharacterForm} from './character-form.mjs';
import {originHeritageBudget} from './character.mjs';
import {CRAFTS} from './crafts.mjs';
import {heritageWeaponOptions} from './heritage-weapons.mjs';
import {LANGUAGES} from './languages.mjs';

const t=key=>game.i18n.localize('RUNARCANA.'+key);
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
const button=(key,action)=>{const node=el('button',t(key));node.type='button';node.addEventListener('click',async()=>{node.disabled=true;try{await action();}catch(error){ui.notifications.error(game.i18n.has(error.message)?game.i18n.localize(error.message):error.message);}finally{node.disabled=false;}});return node;};
const input=(type,value)=>{const node=el('input');node.type=type;node.value=value??'';return node;};
const field=(parent,key,control)=>{const label=el('label',t(key));label.append(control);parent.append(label);return control;};
const select=options=>{const node=el('select');for(const [value,label]of options){const option=el('option',label);option.value=value;node.append(option);}return node;};

export class Workbench extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS={id:'runarcana-workbench',classes:['runarcana-workbench'],window:{title:'RUNARCANA.Workbench',icon:'fas fa-book-open'},position:{width:850,height:720}};
  constructor({actor,...options}={}){super(options);this.actor=actor??canvas.tokens?.controlled?.[0]?.actor;this.mode=this.actor?'actor':'catalog';}
  async _renderHTML() {
    const root=el('div',undefined,'runarcana-content');
    const nav=el('nav');
    for(const mode of ['catalog','creation','actor','import','creature'])nav.append(button('Tab.'+mode,()=>{this.mode=mode;return this.render(true);}));
    root.append(nav,el('p',t('PartialCoverage'),'runarcana-notice'));
    if(!game.modules.get('runarcana').api){root.append(el('p',t('Error.Version')));return root;}
    if(this.mode==='catalog')await this.catalog(root);
    if(this.mode==='creation')await this.creationPanel(root);
    if(this.mode==='customization')await this.creationPanel(root,this.actor);
    if(this.mode==='actor')await this.actorPanel(root);
    if(this.mode==='import')await this.importPanel(root);
    if(this.mode==='creature')await this.creaturePanel(root);
    return root;
  }
  _replaceHTML(result,content){content.replaceChildren(result);}
  async creationPanel(root,actor) {
    await renderCharacterForm(root,{actor,onCreated:async a=>{this.actor=a;this.mode='actor';await this.render(true);}});
  }
  async catalog(root) {
    const packs=[...game.packs].filter(p=>p.metadata.packageName==='runarcana');
    const picker=field(root,'Pack',select(packs.map(p=>[p.collection,p.metadata.label])));
    const search=field(root,'Search',input('search',''));
    const level=field(root,'Level',input('number',''));level.min=0;level.max=30;
    const filter=field(root,'MysteryRole',input('search',''));
    const results=el('div',undefined,'runarcana-results');root.append(results);
    let generation=0;
    const update=async()=>{
      const revision=++generation;const pack=game.packs.get(picker.value);
      const index=await pack.getIndex({fields:['system.level','system.details.cr','flags.runarcana.mysteries','flags.runarcana.role']});
      if(revision!==generation)return;
      const rows=[...index].filter(x=>x.name.toLowerCase().includes(search.value.toLowerCase()) && (level.value==='' || String(x.system?.level??x.system?.details?.cr??'')===level.value) && `${x.flags?.runarcana?.mysteries??''} ${x.flags?.runarcana?.role??''}`.toLowerCase().includes(filter.value.toLowerCase()));
      results.replaceChildren(el('p',game.i18n.format('RUNARCANA.ResultCount',{count:rows.length,shown:Math.min(rows.length,100)})));
      for(const entry of rows.slice(0,100)) {
        const row=el('button',entry.name);row.type='button';row.addEventListener('click',async()=>{const doc=await pack.getDocument(entry._id);doc.sheet.render(true);});results.append(row);
      }
    };
    picker.addEventListener('change',update);search.addEventListener('input',update);level.addEventListener('input',update);filter.addEventListener('input',update);await update();
  }
  async actorPanel(root) {
    const actors=[...game.actors].filter(a=>a.isOwner);
    const picker=field(root,'Actor',select([['',t('SelectActor')],...actors.map(a=>[a.id,a.name])]));
    if(this.actor&&!this.actor.isToken)picker.value=this.actor.id;
    picker.addEventListener('change',()=>{this.actor=game.actors.get(picker.value);this.render(true);});
    if(!this.actor){root.append(el('p',t('SelectActor')));return;}
    const actor=this.actor,api=game.modules.get('runarcana').api;
    root.append(el('h2',actor.name));
    if(!isMarked(actor)){root.append(button('EnableActor',async()=>{await api.enableActor(actor);this.render(true);}));return;}
    root.append(el('p',t('PrimaryGMHint')));
    const summary=el('dl');
    for(const type of ['race','background','class','subclass']){
      summary.append(el('dt',game.i18n.localize('TYPES.Item.'+type)),el('dd',actor.items.filter(i=>i.type===type).map(i=>`${i.name}${i.type==='class'?` (${i.system.levels})`:''}`).join(', ')));
    }
    root.append(summary,button('Creation.Customize',()=>{this.mode='customization';return this.render(true);}));
    if(actor.getFlag('runarcana','creationDraft')&&!actor.getFlag('runarcana','creationComplete'))root.append(button('Creation.Finish',async()=>{await api.finishCharacter(actor);this.render(true);}));
    if(actor.getFlag('runarcana','originSelection')?.plan.underwaterVision){
      const underwater=field(root,'Creation.Underwater',input('checkbox'));underwater.checked=actor.getFlag('runarcana','originContext')?.underwater===true;
      root.append(button('Apply',async()=>{await api.setOriginContext(actor,{underwater:underwater.checked});this.render(true);}));
    }
    const dragon=actor.items.find(i=>i.getFlag?.('runarcana','originForm'));
    if(dragon){
      const section=el('section');section.append(el('h3',t('Dragon.Title')),el('p',t('Dragon.Hint')));
      const state=actor.getFlag('runarcana','draconicForm');
      section.append(el('p',game.i18n.format('RUNARCANA.Dragon.Uses',{spent:dragon.system.uses.spent,max:Math.floor(actor.system.attributes.prof/2)})));
      if(state?.active)section.append(button('Dragon.Leave',async()=>{await api.setDraconicForm(actor,false);this.render(true);}));
      else{
        const gear=field(section,'Dragon.Gear',input('checkbox'));
        section.append(button('Dragon.Enter',async()=>{await api.setDraconicForm(actor,true,{equipmentConfirmed:gear.checked});this.render(true);}));
      }
      root.append(section);
    }
    for(const [id,r]of Object.entries(actor.getFlag('runarcana','resources')??{})) {
      const row=el('div',undefined,'runarcana-resource');row.append(el('span',`${r.label??id}: ${r.value}/${r.max}`),button('SpendOne',async()=>{await api.spendResource(actor,id,1,{operationId:crypto.randomUUID()});this.render(true);}));root.append(row);
    }
    const form=el('div',undefined,'runarcana-form');
    const id=field(form,'ResourceId',input('text','mana'));
    const label=field(form,'ResourceLabel',input('text',t('Mana')));
    const max=field(form,'Maximum',input('number',0));max.min=0;
    const value=field(form,'Value',input('number',0));value.min=0;
    const recovery=field(form,'Recovery',select(['none','short','long','full'].map(v=>[v,t('Rest.'+v)])));
    form.append(button('SaveResource',async()=>{await api.setResource(actor,id.value,{label:label.value,max:Number(max.value),value:Number(value.value),recovery:recovery.value});this.render(true);}));root.append(form);
    const rests=el('section');rests.append(el('h3',t('Rest.Title')),el('p',t('Rest.Confirmation')));
    for(const kind of ['short','long','full'])rests.append(button('Rest.'+kind,async()=>{
      const confirmed=await foundry.applications.api.DialogV2.confirm({window:{title:t('Rest.'+kind)},content:`<p>${t('Rest.Confirmation')}</p>`});
      if(confirmed){await api.rest(actor,kind,{operationId:crypto.randomUUID()});this.render(true);}
    }));
    const die=select([...new Set(actor.items.filter(i=>i.type==='class').map(i=>i.system.hd.denomination))].map(d=>[d,d]));
    rests.append(die);
    for(const kind of ['short','long'])rests.append(button('Rest.Spend'+kind,async()=>{await api.spendHitDie(actor,kind,die.value);this.render(true);}));
    root.append(rests);
    root.append(el('h3',t('Progression')),el('p',t('ProgressionHint')));
    for(const c of actor.items.filter(i=>i.type==='class'))root.append(button('AdvanceClass',()=>{
      const table=c.getFlag('runarcana','progressionTable')??[];
      const limit=Math.max(0,...table.slice(1).map(row=>parseInt(row[0],10)).filter(Number.isFinite));
      if(!limit||c.system.levels>=limit)throw new Error('RUNARCANA.Error.LevelLimit');
      const manager=game.dnd5e.applications.advancement.AdvancementManager.forLevelChange(actor,c.id,1);
      return manager?.render(true);
    }),el('span',c.name));
    const heritage=el('section');heritage.append(el('h3',t('Choices.Title')));
    const budget=field(heritage,'Choices.Budget',input('number',0));budget.min=0;
    const pool=field(heritage,'Choices.Pool',select([['origin',t('Choices.OriginPool')],['region',t('Choices.RegionPool')]]));
    const originPlan=actor.getFlag('runarcana','originSelection')?.plan;
    const updateBudget=()=>{if(originPlan){budget.value=originHeritageBudget(originPlan,actor.system.details.level,pool.value);budget.readOnly=true;}};pool.addEventListener('change',updateBudget);updateBudget();
    const choose=field(heritage,'Choices.Document',select([['',t('Choices.Select')]]));
    const hp=game.packs.get('runarcana.heritages');
    const optionArea=el('div');heritage.append(optionArea);let selectedSkills=[],selectedDamage,selectedTraining=[],selectedWeapon,selectedLanguages=[];
    const updateOptions=async()=>{
      selectedSkills=[];selectedDamage=null;selectedTraining=[];selectedWeapon=null;selectedLanguages=[];optionArea.replaceChildren();const id=choose.value;if(!id||!hp)return;
      const source=await hp.getDocument(id);if(choose.value!==id)return;
      const mechanics=source.getFlag('runarcana','heritageRules')?.mechanics,choice=mechanics?.skillChoice;
      if(choice)for(let n=0;n<choice.count;n++)selectedSkills.push(field(optionArea,'Choices.Skill',select([['',t('Choices.Select')],...choice.options.map(k=>[k,game.i18n.localize(CONFIG.DND5E.skills[k]?.label??k)])])));
      if(mechanics?.resistanceChoice)selectedDamage=field(optionArea,'Choices.Resistance',select([['',t('Choices.Select')],...mechanics.resistanceChoice.filter(k=>!originPlan?.resistance?.includes(k)).map(k=>[k,game.i18n.localize(CONFIG.DND5E.damageTypes[k]?.label??k)])]));
      if(mechanics?.weaponChoice)selectedWeapon=field(optionArea,'Choices.Weapon',select([['',t('Choices.Select')],...heritageWeaponOptions(source.getFlag('runarcana','heritageRules'),{region:originPlan?.region}).map(w=>[w.id,w.name])]));
      if(mechanics?.languageChoice)for(let n=0;n<mechanics.languageChoice.count;n++)selectedLanguages.push(field(optionArea,'Choices.Language',select([['',t('Choices.Select')],...LANGUAGES.filter(l=>l.category===mechanics.languageChoice.category).map(l=>[l.name,l.name])])));
      const training=mechanics?.trainingChoice;
      if(training)for(let n=0;n<training.count;n++){
        const row=el('div'),picker=field(row,'Choices.Training',select([['',t('Choices.Select')],...training.skills.map(k=>['skill:'+k,game.i18n.localize(CONFIG.DND5E.skills[k]?.label??k)]),...CRAFTS.filter(c=>training.crafts==='all'||training.crafts==='guide'&&c.craft==='Guide'||Array.isArray(training.crafts)&&training.crafts.includes(c.id)).map(c=>['craft:'+c.id,c.name])]));
        let detail=field(row,'Choices.Specialty',input('text'));detail.maxLength=100;detail.parentElement.hidden=true;
        picker.addEventListener('change',()=>{const id=picker.value.slice(6),values=training.specialtyOptions?.[id],next=values?select([['',t('Choices.Select')],...values.map(v=>[v,v])]):input('text');next.maxLength=100;detail.replaceWith(next);detail=next;detail.parentElement.hidden=!CRAFTS.find(c=>c.id===id)?.specialtyRequired;});
        selectedTraining.push(()=>{const [kind,id]=picker.value.split(':');return {kind,id,...(!detail.parentElement.hidden?{specialty:detail.value}:{})};});optionArea.append(row);
      }
    };
    choose.addEventListener('change',updateOptions);pool.addEventListener('change',updateOptions);
    if(hp){const ix=await hp.getIndex({fields:['flags.runarcana.heritageRules']});const updatePicker=()=>{const previous=choose.value;choose.replaceChildren();const empty=el('option',t('Choices.Select'));empty.value='';choose.append(empty);for(const e of ix){const r=e.flags?.runarcana?.heritageRules;if(!r||!r.general&&!r.unlisted&&!(pool.value==='origin'?r.origins.length:r.regions.length))continue;const o=el('option',e.name);o.value=e._id;choose.append(o);}if([...choose.options].some(o=>o.value===previous))choose.value=previous;};pool.addEventListener('change',updatePicker);updatePicker();}
    const cost=field(heritage,'Choices.Cost',input('number',1));cost.readOnly=true;
    const reason=field(heritage,'Choices.OverrideReason',input('text',''));
    const preview=el('p');heritage.append(preview);
    let plan;
    for(const event of ['input','change'])heritage.addEventListener(event,()=>{plan=null;preview.textContent='';});
    heritage.append(button('Preview',async()=>{
      if(!choose.value)throw new Error('RUNARCANA.Error.Choices');
      plan={pool:pool.value,budget:Number(budget.value),choices:[{id:choose.value,uuid:`Compendium.runarcana.heritages.Item.${choose.value}`,cost:Number(cost.value),options:{skills:selectedSkills.map(s=>s.value),...(selectedDamage?{damage:selectedDamage.value}:{}),...(selectedTraining.length?{training:selectedTraining.map(read=>read())}:{}),...(selectedWeapon?{weapon:selectedWeapon.value}:{}),...(selectedLanguages.length?{languages:selectedLanguages.map(p=>p.value)}:{})}}]};
      const result=await api.previewHeritages(actor,plan);preview.textContent=`${t('Choices.Spent')}: ${result.spent}; ${result.errors.map(k=>game.i18n.localize(k)).join(', ')} ${result.manual.join('; ')}`;
    }),button('Apply',async()=>{if(!plan)throw new Error('RUNARCANA.Error.Preview');await api.applyHeritages(actor,plan,{overrideReason:reason.value});this.render(true);}));root.append(heritage);
  }
  async importPanel(root) {
    if(!game.user.isGM){root.append(el('p',t('Error.PrimaryGM')));return;}
    root.append(el('p',t('Import.Policy')));
    const packs=[...game.packs].filter(p=>p.metadata.packageName==='runarcana');
    const picker=field(root,'Pack',select(packs.map(p=>[p.metadata.name,p.metadata.label])));
    const output=el('div',undefined,'runarcana-results');root.append(output);let plan;
    root.append(button('Preview',async()=>{
      plan=await game.modules.get('runarcana').api.previewImport([picker.value]);output.replaceChildren();
      const counts={};for(const row of plan)counts[row.action]=(counts[row.action]??0)+1;
      for(const [action,n]of Object.entries(counts))output.append(el('p',`${t('Import.'+action)}: ${n}`));
    }),button('Apply',async()=>{
      if(!plan)throw new Error('RUNARCANA.Error.Preview');
      const results=await game.modules.get('runarcana').api.applyImport(plan);
      output.replaceChildren(el('p',game.i18n.format('RUNARCANA.Import.Result',{count:results.filter(r=>r.status==='imported').length,skipped:results.filter(r=>r.status!=='imported').length})));
      plan=null;
    }));
  }
  async creaturePanel(root) {
    const api=game.modules.get('runarcana').api;
    root.append(el('p',t('Creature.Manual')));
    const form=el('div',undefined,'runarcana-form');
    const name=field(form,'Creature.Name',input('text',''));
    const cr=field(form,'Creature.CR',input('number',1));cr.min=1;cr.max=30;
    const role=field(form,'Creature.Role',select(['minion','grunt','soldier','elite','paragon'].map(v=>[v,t('Creature.'+v)])));
    const size=field(form,'Creature.Size',select(['diminutive','tiny','small','medium','large','huge','gargantuan','colossal'].map(v=>[v,t('Creature.'+v)])));size.value='medium';
    const con=field(form,'Creature.Constitution',input('number',10));
    const ac=field(form,'Creature.AC',input('number',10));
    const tl=field(form,'Creature.Threat',input('number',4));
    const output=el('pre');let preview;
    form.append(button('Preview',()=>{
      preview={name:name.value,cr:Number(cr.value),role:role.value,size:size.value,constitution:Number(con.value),ac:Number(ac.value),threatLevel:Number(tl.value)};
      const result=api.creatureStatistics(preview);output.textContent=`${t('Creature.HP')}: ${result.hp}\n${t('Creature.HitDice')}: ${result.hitDice}\n${t('Creature.Proficiency')}: +${result.proficiency}`;
    }),button('Creature.Create',async()=>{if(!preview)throw new Error('RUNARCANA.Error.Preview');const actor=await api.createCreature(preview);actor.sheet.render(true);}));root.append(form,output);
  }
}
