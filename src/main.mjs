import {createApi,isMarked} from './api.mjs';
import {registerBabele} from './translation.mjs';
import {installDnd5eAdapter} from './adapters/dnd5e-6.mjs';
import {previewImport,applyImport} from './importer.mjs';
import {Workbench} from './workbench.mjs';
import {EQUIPMENT_WEAPONS} from './regional.mjs';

Hooks.on('babele.init',registerBabele);
Hooks.once('init',()=>{
  game.settings.register('runarcana','enabled',{name:'RUNARCANA.Settings.Enabled',hint:'RUNARCANA.Settings.EnabledHint',scope:'world',config:true,type:Boolean,default:false,requiresReload:true});
  if(game.settings.get('runarcana','enabled')){
    CONFIG.DND5E.skills.tec??={label:'RUNARCANA.SkillTechnology',ability:'int',fullKey:'technology'};
    CONFIG.DND5E.tools.runarcanaCraft??={ability:'int'};
    CONFIG.DND5E.toolProficiencies.runarcanaCraft??='RUNARCANA.Craft';
    for(const weapon of EQUIPMENT_WEAPONS)if(weapon.uuid)CONFIG.DND5E.weaponIds[weapon.id]??=weapon.uuid;
  }
  game.settings.registerMenu('runarcana','workbench',{name:'RUNARCANA.Workbench',label:'RUNARCANA.OpenWorkbench',hint:'RUNARCANA.Settings.WorkbenchHint',icon:'fas fa-book-open',type:Workbench,restricted:false});
});
Hooks.once('setup',()=>{
  if(game.system.id!=='dnd5e'||game.system.version!=='6.0.6') {
    ui.notifications.error(game.i18n.localize('RUNARCANA.Error.Version'));return;
  }
  game.modules.get('runarcana').api=Object.freeze({...createApi(),previewImport,applyImport,open:(actor)=>new Workbench({actor}).render(true)});
  installDnd5eAdapter();
});
Hooks.on('renderActorSheetV2',(sheet,element)=>{
  if(!isMarked(sheet.actor))return;
  const button=document.createElement('button');button.type='button';button.className='runarcana-sheet-button';button.textContent=game.i18n.localize('RUNARCANA.Workbench');
  button.addEventListener('click',()=>game.modules.get('runarcana').api.open(sheet.actor));
  const panel=document.createElement('section');panel.className='runarcana-actor-panel';panel.append(button);
  for(const [id,r]of Object.entries(sheet.actor.getFlag('runarcana','resources')??{})) {
    const value=document.createElement('span');value.textContent=`${r.label??id}: ${r.value} / ${r.max}`;panel.append(value);
  }
  (element.querySelector('.window-content')??element).prepend(panel);
});
