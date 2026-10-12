"""Source-backed regional options and eligibility metadata for heritage descriptions."""
import json,re,unicodedata
from bs4 import BeautifulSoup
from origins import SKILLS

def normalized(value):
    return re.sub(r'[^a-z0-9]+',' ',unicodedata.normalize('NFKD',value.casefold().replace('æ','ae')).encode('ascii','ignore').decode()).strip()

def heritage_metadata(page,section):
    if not page['url'].endswith('/customization/heritages/') or section.get('parentH2')!='heritage-descriptions' or section['level']!=3:return None
    soup=BeautifulSoup(section['html'],'html.parser');text=soup.get_text(' ',strip=True)
    requirement=next((p.get_text(' ',strip=True) for p in soup.find_all('p') if re.match(r'prerequis',p.get_text(' ',strip=True),re.I)),'')
    # The universal cost and repeat rule are stated at the beginning of this source page.
    result={'schema':1,'cost':1,'maxCount':2 if re.search(r'(?:chosen|choose|taken) (?:a )?second time',text,re.I) else 1,'requirement':re.sub(r'^prerequis\w*\s*[:>]\s*','',requirement,flags=re.I),'initial':bool(re.search(r'\b(?:initial|starter)\b',requirement,re.I)),'name':section['name']}
    if re.search(r'This Heritage can be (?:chosen|acquired) more than once',text,re.I):
        result['maxCount']=None
        if section['name']!='Discipline is Strength':result['repeatReviewRequired']=True
    mechanics={'Arcanist Acolyte':{'skills':{'arc':1}},'Lunar Sight':{'skills':{'ins':1},'expertiseIfKnown':['ins'],'sensesAdd':{'darkvision':15}},'Valor of the Protector':{'skills':{'inv':1},'expertiseIfKnown':['inv']},'Perceptive':{'sensesMinimum':{'blindsight':10},'passivePerception':'floor(@prof / 2)'}}
    # Reviewed permanent clauses only. Spell grants, counters and situational abilities remain in the full text.
    for name,skill in {'Bioenergy':'tec','Blessed Healer':'med','Cautious Traveler':'sur','Celestial Encouragement':'arc','Draconic Resilience':'sur','Extrovert':'his','Ice Breaker':'sur','Killer Instinct':'med','Manatouched':'arc','Natural Medicine':'med','Nomadic Life':'sur','Ottrani Healing':'med','Simian Skill':'ath','Soul of the Hunt':'sur','Truth Seeker':'prc'}.items():
        mechanics[name]={'skills':{skill:1},'expertiseIfKnown':[skill]}
    mechanics['Truth Seeker']['passivePerception']=1
    # Pickpocketer repeats "proficiency" in the published clause; do not silently substitute expertise.
    mechanics['Pickpocketer']={'skills':{'slt':1}}
    mechanics['Sea Style']={'weapons':['net','spear','trident']}
    mechanics['Exquisite Construction']={'resistanceChoice':['acid','lightning','force','fire','cold','necrotic','psychic','radiant']}
    mechanics['Skilled']={'trainingChoice':{'count':3,'skills':list(SKILLS.values()),'crafts':'all','newOnly':True}}
    mechanics['Master Artisan']={'trainingChoice':{'count':1,'skills':[],'crafts':'all','expert':True}}
    mechanics['Hospitable']={'fixedCrafts':['cook']}
    mechanics['Cautious Traveler']['trainingChoice']={'count':1,'skills':[],'crafts':'guide'}
    mechanics['Discipline is Strength']={'weaponChoice':{'kind':'any','distinct':True,'damagePicks':2}}
    mechanics['Ferromancer']={'weaponChoice':{'kind':'regionalMartial'}}
    mechanics['Weapon Scholar']={'weaponChoice':{'kind':'regional'}}
    mechanics['Sulfur, Saltpeter and Charcoal']={'weaponChoice':{'kind':'firearm'}}
    for name,skills in {'Alpha Authority':['itm','per'],'Commander':['itm','per'],'Insightful Mind':['inv','ins'],'Mediator':['dec','itm','ins','per'],'Natural Propulsion':['nat','sur'],'Thick Feet':['ath','sur'],'Wealthy':list(SKILLS.values())}.items():
        mechanics[name]={'skillChoice':{'count':1,'options':skills,'expertiseIfKnown':True}}
    mechanics['Scout']={'skillChoice':{'count':1,'options':['ins','inv','prc','slt'],'advantageIfKnown':True},'passivePerception':'floor(@prof / 2)'}
    if section['name'] in mechanics:
        if page['sha256']=='9334a15c409859cc61585387d9de4569855f07ae253400ba51802614a723a76e':result['mechanics']=mechanics[section['name']]
        else:result['mechanicsReviewRequired']=True
    return result

def generate(pages,documents,root):
    craft_catalog=[]
    abilities={'strength':'str','dexterity':'dex','constitution':'con','intelligence':'int','wisdom':'wis','charisma':'cha'}
    def ability(text):
        return next((code for name,code in abilities.items() if re.search(r'\b'+name+r'\b',text,re.I)),None)
    for p in pages:
        match=re.search(r'/detailing/crafts/(major|minor)/([^/]+)/$',p['url'])
        if not match:continue
        soup=BeautifulSoup(p['html'],'html.parser');intro=[]
        for child in (soup.find('div') or soup).children:
            if getattr(child,'name',None)=='h2':break
            if getattr(child,'name',None):intro.append(child)
        base={'sourceUrl':p['url'],'sourceHash':p['sha256'],'category':match[1],'craft':p['title']}
        if match[1]=='major':
            attr=next((e.get_text(' ',strip=True) for e in intro if e.find('strong') and e.find('strong').get_text(strip=True).rstrip(':.').casefold()=='attribute'),'')
            craft_catalog.append({**base,'id':match[2],'name':p['title'],'ability':ability(attr) or 'int','abilityReviewRequired':not bool(ability(attr))})
        else:
            for element in intro:
                if element.name not in ['ul','ol']:continue
                for li in element.find_all('li',recursive=False):
                    label=li.find('strong');attr=next((e.get_text(' ',strip=True) for e in li.find_all('li') if e.find('strong') and e.find('strong').get_text(strip=True).rstrip(':.').casefold()=='attribute'),'')
                    if not label or not attr:continue
                    name=label.get_text(' ',strip=True).rstrip(':');slug=normalized(name).replace(' ','-')
                    craft_catalog.append({**base,'id':match[2]+'-'+slug,'name':p['title']+': '+name,'discipline':name,'ability':ability(attr) or 'int','specialtyRequired':match[2]=='guide' or match[2]=='player' and slug=='cards'})
    if len(craft_catalog)<30:raise ValueError('Craft source catalog is incomplete')
    core=['battleaxe','blowgun','club','dagger','dart','flail','glaive','greataxe','greatclub','greatsword','halberd','handaxe','handcrossbow','heavycrossbow','javelin','lance','lightcrossbow','lighthammer','longbow','longsword','mace','maul','morningstar','musket','pike','pistol','quarterstaff','rapier','scimitar','shortsword','sickle','spear','shortbow','sling','trident','warpick','warhammer','whip','net']
    aliases={'staff':'quarterstaff','big club':'greatclub','war axe':'battleaxe','riding lance':'lance','hatchet':'handaxe','mallet':'maul','long sword':'longsword','short sword':'shortsword','flintlock pistol':'pistol','hand cannon':'handcannon','gauntlet':'wargauntlet'}
    weapons=[];by_name={}
    for d in documents.get('equipment',[]):
        if d.get('type')!='weapon':continue
        slug=normalized(d['name']);compact=slug.replace(' ','');key=aliases.get(slug,compact if compact in core else 'runarcana-'+slug.replace(' ','-'))
        d['system']['type']['baseItem']=key
        entry={'id':key,'name':d['name'],'uuid':'Compendium.runarcana.equipment.Item.'+d['_id'],'category':'firearm' if '#table-firearms' in d['flags']['runarcana']['canonicalId'] else 'simple' if d['system']['type']['value'].startswith('simple') else 'martial'}
        published=re.search(r'\bregional\s*\(([^)]+)\)',d['flags']['runarcana'].get('sourceColumns',{}).get('properties',''),re.I)
        entry['regions']=[r.strip() for r in published[1].split(',')] if published else []
        d['flags']['runarcana']['weaponRegions']=entry['regions']
        weapons.append(entry);by_name[compact]=key;by_name[slug]=key
    for name,key in aliases.items():
        match=next((w for w in weapons if w['id']==key or normalized(w['name']).replace(' ','')==key),None)
        if match:by_name[name]=match['id'];by_name[name.replace(' ','')]=match['id']
    def ids(names):
        found=[]
        for name in names:
            key=by_name.get(normalized(name)) or by_name.get(normalized(name).replace(' ',''))
            if not key and normalized(name).replace(' ','') in core:
                key=normalized(name).replace(' ','');weapons.append({'id':key,'name':name.title(),'uuid':None,'category':'martial','source':'Explicit regional proficiency; standard dnd5e identifier'})
                by_name[normalized(name)]=key
            if key:found.append(key)
            else:raise ValueError('Regional weapon not found in collected source: '+name)
        return found
    heritage_page=next((p for p in pages if p['url'].endswith('/customization/heritages/')),None)
    if heritage_page:
        construct=next((p for p in pages if p['url'].endswith('/characters/origins/construct/')),None)
        def key(value):return re.sub(r'\bvariant\b','',normalized(value)).replace('magik','magic').strip()
        general=set();origins={};regions_index={}
        for section in heritage_page['sections']:
            soup=BeautifulSoup(section['html'],'html.parser')
            if section['anchor']=='general':general={key(li.get_text(' ',strip=True)) for li in soup.find_all('li')}
            elif section['anchor'] in ['heritages-by-origin','heritages-by-region']:
                current=None;target=origins if section['anchor']=='heritages-by-origin' else regions_index
                for child in soup.children:
                    if getattr(child,'name',None)=='p' and child.find('strong'):current=child.get_text(' ',strip=True)
                    elif getattr(child,'name',None) in ['ol','ul'] and current:
                        for li in child.find_all('li'):target.setdefault(key(li.get_text(' ',strip=True)),[]).append(current)
        variant_page=next((p for p in pages if p['url'].endswith('/customization/variant-heritages/')),None)
        for d in documents.get('heritages',[]):
            meta=d.get('flags',{}).get('runarcana',{}).get('heritageRules')
            if not meta:continue
            if meta['name']=='Exquisite Construction':
                if not construct or construct['sha256']!='5df86610a7dd2bb97239d849919849133325d80321ad84a7a67b3d6cff08951f':
                    meta.pop('mechanics',None);meta['mechanicsReviewRequired']=True
                else:meta['mechanicsSource']={'url':construct['url'],'sha256':construct['sha256']}
            k=key(meta['name']);meta.update(general=k in general,origins=origins.get(k,[]),regions=regions_index.get(k,[]))
            meta['unlisted']=not(meta['general'] or meta['origins'] or meta['regions'])
            if meta['name'].startswith('Variant:') and variant_page:
                variant=next((s for s in variant_page['sections'] if key(s['name'])==k),None)
                if variant:
                    text=BeautifulSoup(variant['html'],'html.parser').get_text(' ',strip=True)
                    if re.search(r'(?:chosen|choose|taken) (?:a )?second time',text,re.I):meta.update(maxCount=2,repeatInitial=True)
                    meta['variantSourceUrl']=variant_page['url']+'#'+variant['anchor'];meta['variantSourceHash']=variant_page['sha256']
    activities={
        'Bilgewater':(['dagger','flintlock pistol','greatsword','hand cannon','harpoon','long sword','musket','scimitar','short sword','trident'],[],['Guide: Cartographer','Guide: Navigator','Locksmith','Forger discipline','Apothecary','Player: Game','Musician: Instrument']),
        'Demacia':([],['martial'],['Minor craft']),
        'Freljord':(['greatsword','longsword','pike','greataxe','mallet','flail','longbow'],['simple'],['Apothecary','Armorer','Fletcher','Collector: Leatherworker','Cook','Cutler','Musician: Instrument']),
        'Ionia':([],['simple'],['Minor craft']),
        'Ixtal':([],['martial'],['Minor craft']),
        'Noxus':([],['simple','martial'],['Minor craft']),
        'Piltover':(['light crossbow','short sword','longsword','glaive','warhammer','gauntlet','rapier','hand crossbow','heavy crossbow','net'],['firearm'],['Craft']),
        'Shadow Isles':([],['simple','martial'],['Apothecary','Guide: Navigator']),
        'Shurima':(['scimitar','shortsword','greatsword','longsword','glaive','khopesh','pike','gauntlet','rapier','trident','longbow','net','blowgun'],['simple'],[]),
        'Targon':(['dagger','shortbow','khopesh','small chakram'],['martial'],['Minor craft']),
        'Zaun':(['light crossbow','short sword','longsword','glaive','warhammer','gauntlet','rapier','hand crossbow','heavy crossbow','net'],['firearm'],['Craft'])
    }
    regions={}
    for p in pages:
        if '/detailing/runeterra/' not in p['url'] or p['url'].endswith('/runeterra/'):continue
        fields={}
        for para in BeautifulSoup(p['html'],'html.parser').find_all('p'):
            label=para.find(['em','strong']);name=label.get_text(' ',strip=True).rstrip(':.').casefold() if label else ''
            if name in ['languages','skill','activity','weapon','craft']:fields[name]=para.get_text(' ',strip=True)
        if 'skill' not in fields:continue
        skill_text=fields['skill'];skills=list(SKILLS.values()) if re.search(r'any skill|one skill',skill_text,re.I) else [code for name,code in SKILLS.items() if re.search(r'\b'+re.escape(name)+r'\b',skill_text,re.I)]
        language_text=fields['languages'];body=re.sub(r'^Languages\s*\.\s*','',language_text).rstrip('.')
        if 'choose one' in body.lower():
            prefix,choice=re.split(r'choose one (?:between|from):?',body,maxsplit=1,flags=re.I)
            fixed=[re.sub(r'\s+and\s*$','',prefix.strip())] if prefix.strip() and prefix.strip().casefold()!='choose one between: zaunite and' else []
            choices=[v.strip().rstrip('.') for v in re.split(r',|\band\b|\bor\b',choice) if v.strip()]
            if p['title']=='Zaun':fixed=['Zaunite'];choices=['Demacian','Ionian','Noxian','Bilgewatrian','Shurimane','Zaunite Piltovian']
        else:fixed=[body.split(' (')[0]];choices=[]
        groups=[]
        if p['title']=='Bandle City':groups=[{'id':'weapons','count':2,'weapons':ids(['dagger','javelin','hatchet','light hammer','shortbow','dart','sling','net','blowgun']),'categories':[],'crafts':[]},{'id':'craft','count':1,'weapons':[],'categories':[],'crafts':['Artisan','Herbalist','Player']}]
        elif p['title']=='Nazumah':groups=[{'id':'collector','count':1,'weapons':[],'categories':[],'crafts':['Collector: Biologist','Collector: Tanner']},{'id':'profession','count':1,'weapons':[],'categories':[],'crafts':['Alchemist','Armorer','Archer','Weaponsmith','Enchanter','Techmaturge']}]
        elif p['title'] in activities:
            names,categories,crafts=activities[p['title']];groups=[{'id':'activities','count':2,'weapons':ids(names),'categories':categories,'crafts':crafts}]
        regions[p['title']]={'name':p['title'],'sourceUrl':p['url'],'sourceHash':p['sha256'],'skills':skills,'languages':{'fixed':fixed,'choices':choices},'groups':groups,'sourceRules':'\n'.join(fields.values())}
    dest=root/'src/generated/character-options.mjs';dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text('// Generated from the collected official source snapshot.\nexport const REGIONAL_RULES='+json.dumps(regions,ensure_ascii=False,indent=2)+';\nexport const EQUIPMENT_WEAPONS='+json.dumps(sorted(weapons,key=lambda w:w['name']),ensure_ascii=False,indent=2)+';\nexport const CRAFTS='+json.dumps(sorted(craft_catalog,key=lambda c:c['name']),ensure_ascii=False,indent=2)+';\n',encoding='utf8')
