"""Generate native Foundry documents and durable IDs from normalized, cached sources."""
import argparse, collections, hashlib, html, json, pathlib, re
from bs4 import BeautifulSoup
from normalize import ROOT, dump, sid
from equipment import generate_equipment

PACKS={
 'start':('Start Here','JournalEntry',0),
 'origins':('Origins','Item',1), 'classes':('Classes','Item',1),'subclasses':('Subclasses','Item',1),
 'features':('Features','Item',1),'backgrounds':('Pasts','Item',1),'heritages':('Heritages','Item',1),
 'runes':('Runes & Runessences','Item',1),'resources':('Class Resources','Item',1),'crafts':('Crafts & Formulas','Item',1),
 'equipment':('Equipment','Item',1),'characters':('Character Rules','JournalEntry',1),
 'rules':('Rules','JournalEntry',2),'spells':('Spells','Item',2),'rituals':('Rituals','Item',2),
 'techmaturgy':('Techmaturgy','Item',2),'companions':('Summons & Companions','Actor',2),
 'devices':('Mechas & Servo','Actor',2),
 'gm':('Game Mastering','JournalEntry',3),'afflictions':('Conditions & Afflictions','Item',3),
 'rewards':('Rewards','Item',3),'tables':('Roll Tables','RollTable',3),
 'bestiary':('Bestiary','Actor',4),'creature-features':('Creature Features & Echoes','Item',4),
 'creature-rules':('Creature Creation Rules','JournalEntry',4),'references':('References & Provenance','JournalEntry',90)}
COLLECTION={'Item':'items','Actor':'actors','JournalEntry':'journal','RollTable':'tables'}
GROUPS={0:'00 — Start Here',1:'01 — Characters',2:'02 — Rules',3:'03 — Game Mastering',4:'04 — Monsters & Creatures',90:'90 — References'}
REGISTRY={}; DOCUMENTS={}; PAGE_UUIDS={}; COVERAGE={}; FOLDERS={}
LIMITS={}
REVIEWED=json.loads((ROOT/'sources/mechanics-reviewed.json').read_text(encoding='utf8')) if (ROOT/'sources/mechanics-reviewed.json').exists() else {}

def reviewed(page):return REVIEWED.get(page['id'],{}).get('sourceHash')==page['sha256']
def uid(key):
    REGISTRY.setdefault(key,sid(key))
    return REGISTRY[key]
def provenance(page,key):
    fragment=key.split('#',1)[1] if '#' in key else None
    anchor=fragment if any(s.get('anchor')==fragment for s in page.get('sections',[])) else None
    return {'runarcana':{'canonicalId':key,'sourceUrl':page['url']+(('#'+anchor) if anchor else ''),'sourceAnchor':anchor,'sourceLocator':key,'rulesVersion':page.get('rulesVersion'),'wikiBuild':page.get('wikiBuild'),'sourceHash':page.get('sha256'),'generatorVersion':'0.1.0','localOnly':True,'mechanicalCoverage':'partial'}}
def folder(pack,key,name,parent=None):
    ident=uid('folder:'+pack+':'+key)
    FOLDERS.setdefault(pack,{})[ident]={'_id':ident,'_key':'!folders!'+ident,'name':name,'type':PACKS[pack][1],'folder':parent,'sorting':'a','color':'#397d80'}
    return ident
def add(pack,doc,key,page=None,folder_id=None):
    doc['_id']=uid(key); doc['_key']=f'!{COLLECTION[PACKS[pack][1]]}!{doc["_id"]}'
    previous=next((d for d in DOCUMENTS.get(pack,[]) if d['_id']==doc['_id']),None)
    if previous is not None:
        raise ValueError(f'Duplicate generated document: {pack} {key}')
    def embedded_keys(parent,collection,ids):
        for embedded in ['pages','items','effects','results']:
            for child in parent.get(embedded,[]):
                child['_key']=f'!{collection}.{embedded}!{ids}.{child["_id"]}'
                embedded_keys(child,collection+'.'+embedded,ids+'.'+child['_id'])
    embedded_keys(doc,COLLECTION[PACKS[pack][1]],doc['_id'])
    doc['folder']=folder_id
    doc.setdefault('ownership',{'default':0})
    if page: doc['flags']=provenance(page,key)|doc.get('flags',{})
    DOCUMENTS.setdefault(pack,[]).append(doc)
    uuid=f'Compendium.runarcana.{pack}.{PACKS[pack][1]}.{doc["_id"]}'
    COVERAGE.setdefault(key,[]).append(uuid)
    return uuid
def item(name,typ,description):
    system={'description':{'value':description}}
    if typ in ['weapon','equipment','consumable','tool','feat','spell']:system['activities']={}
    return {'name':name,'type':typ,'img':'icons/svg/book.svg','system':system,'effects':[]}
def part_pack(p): return {0:'references',1:'characters',2:'rules',3:'gm',4:'creature-rules'}.get(p,'references')
def journal(page,local):
    pack=part_pack(page['part']); key=page['id']+'@journal'
    description=page['html'] if local else '<p><a href="'+html.escape(page['url'],quote=True)+'">'+html.escape(page['title'])+'</a></p><p>Import an official local export to read this source here. Redistribution permission for the complete text has not been established.</p>'
    chunks=[]; parsed=BeautifulSoup(description,'html.parser')
    for wrapper in parsed.select('.prose'):wrapper.unwrap()
    # Split at top-level h2 headings, keep complete tables/list markup and stable page IDs.
    current=[]; chunk_key='overview'; chunk_name=page['title']
    for child in parsed.contents:
        if getattr(child,'name',None)=='h2' and current:
            chunks.append((chunk_key,chunk_name,''.join(current)));current=[]
            chunk_key=child.get('id') or sid(str(child)); chunk_name=child.get_text(' ',strip=True)
        current.append(str(child))
    if current: chunks.append((chunk_key,chunk_name,''.join(current)))
    pages=[{'_id':uid(key+'#'+k),'name':n,'type':'text','sort':(i+1)*100000,'text':{'content':c,'format':1},'flags':provenance(page,page['id']+'#'+k)} for i,(k,n,c) in enumerate(chunks)]
    f=folder(pack,'chapter:'+page['url'].split('/')[4],page['url'].split('/')[4].replace('-',' ').title())
    result=add(pack,{'name':page['title'],'pages':pages},key,page,f)
    PAGE_UUIDS[page['url']]=result
    COVERAGE.setdefault(page['id'],[]).append(result)
def activity(key,name,typ,description,**kwargs):
    return {'_id':uid(key),'name':name,'type':typ,'description':{'value':description},'activation':{'type':'action','value':1,'override':False},'consumption':{'spellSlot':False,'targets':[]},**kwargs}
def damage_part(formula,typ):
    return {'custom':{'enabled':True,'formula':formula},'types':[typ.lower()],'scaling':{'mode':'','number':1,'formula':''}}
def spell(page):
    fields=page.get('spell')
    if not fields: return
    text=BeautifulSoup(page['html'],'html.parser').get_text(' ',strip=True)
    published_level=fields.get('Level','');number=re.search(r'\d+',published_level)
    if published_level.casefold()=='cantrip':level=0
    elif number and 0<=int(number[0])<=9:level=int(number[0])
    else:raise ValueError(f'Unrecognized spell level: {page["id"]}: {published_level}')
    key=page['id']
    doc=item(page['title'],'spell',page['html']); system=doc['system']
    system.update(level=level,school='',properties=[],method='spell',prepared=0)
    components=fields.get('Components','')
    system['properties']=[v for k,v in [('V','vocal'),('S','somatic'),('M','material')] if re.search(r'\b'+k+r'\b',components)]
    duration=fields.get('Duration',''); concentration='concentration' in duration.lower()
    if concentration: system['properties'].append('concentration')
    match=re.search(r'(\d+)\s*(round|minute|hour|day)s?',duration,re.I)
    system['duration']={'value':match[1] if match else '', 'units':match[2].lower() if match else 'inst' if 'instant' in duration.lower() else 'perm' if 'until dispelled' in duration.lower() else 'spec'}
    cast=fields.get('Casting Time',''); match=re.search(r'(\d+)',cast)
    casting=next((x for x in ['bonus','reaction','minute','hour','day','action'] if x in cast.lower()),'special')
    system['activation']={'type':casting,'value':int(match[0]) if match else 1,'condition':cast if casting in ['reaction','special'] else ''}
    rng=fields.get('Range',''); match=re.search(r'(\d+)',rng)
    system['range']={'value':int(match[0]) if match else None,'units':'mi' if 'mile' in rng.lower() else 'ft' if match else 'touch' if 'touch' in rng.lower() else 'self' if any(x in rng.lower() for x in ['self','personal']) else 'spec'}
    material_price=re.search(r'([\d,]+)\s*GP\b',components,re.I)
    system['materials']={'value':components.split('(',1)[1].rstrip(')') if '(' in components else '', 'consumed':bool(re.search('consum',components,re.I)),'cost':int(material_price[1].replace(',','')) if material_price else 0,'supply':0}
    aid=key+'@activity'
    a=activity(aid,'Cast','utility',page['html'])
    if level>0: a['consumption']['targets']=[{'type':'runarcanaResource','target':'mana','value':str([0,2,3,5,6,7,9,12,16,21][level]),'scaling':{'mode':'','formula':''}}]
    system['activities']={a['_id']:a}
    # Reviewed multi-part Frost Dagger. The explosion is a follow-up, so mana is consumed only for the attack.
    if key=='/en/magic/spells/frost-dagger/' and reviewed(page):
        a['type']='attack';a['attack']={'ability':'','bonus':'','flat':False,'type':{'value':'ranged','classification':'spell'}}
        a['damage']={'includeBase':False,'parts':[damage_part('1d8','piercing'),damage_part('1d6','cold')]}
        follow=activity(key+'@explosion','Shard explosion','save',page['html'],save={'ability':['dex'],'dc':{'calculation':'spellcasting','formula':''}},damage={'onSave':'none','parts':[damage_part('2d6','cold')]})
        follow['target']={'override':True,'template':{'type':'sphere','size':'5','units':'ft'},'affects':{'type':'creature','count':''},'prompt':True}
        system['activities'][follow['_id']]=follow
    if key=='/en/magic/spells/abominable-snowman/' and reviewed(page):
        companion=snowman(page)
        a.update(type='summon',profiles=[{'_id':uid(key+'@summon-profile'),'name':'Abominable Snowman','uuid':companion,'count':'1','level':{'min':8,'max':9}}],summon={'mode':'','prompt':True},match={'attacks':True,'saves':True,'disposition':True,'proficiency':False},bonuses={'ac':'@item.level - 8','hp':'20 * max(@item.level - 8, 0)'})
    if key=='/en/magic/spells/crush/' and reviewed(page):
        a.update(type='attack',attack={'ability':'','bonus':'','flat':False,'type':{'value':'ranged','classification':'spell'}},damage={'includeBase':False,'parts':[damage_part('10d10','gravitational')]})
        follow=activity(key+'@sustained','Sustained pressure','save',page['html'],save={'ability':['con'],'dc':{'calculation':'spellcasting','formula':''}},damage={'onSave':'none','parts':[damage_part('5d10','gravitational')]})
        system['activities'][follow['_id']]=follow
    if key in ['/en/magic/spells/etna/','/en/magic/spells/ablaze/'] and reviewed(page):
        name,ability,formula,typ=('Melee retaliation','dex','2d6','fire') if key.endswith('/etna/') else ('Contact damage','con','5d10','incinerating')
        follow=activity(key+'@secondary',name,'save',page['html'],save={'ability':[ability],'dc':{'calculation':'spellcasting','formula':''}},damage={'onSave':'half' if key.endswith('/etna/') else 'none','parts':[damage_part(formula,typ)]})
        follow['activation']={'override':True,'type':'special','value':1,'condition':'After the published trigger; base spell must already be active.'}
        system['activities'][follow['_id']]=follow
    if key=='/en/magic/spells/hekla/' and reviewed(page):
        a.update(type='save',save={'ability':['dex'],'dc':{'calculation':'spellcasting','formula':''}},damage={'onSave':'none','parts':[damage_part('4d6','incinerating')]})
    doc['flags']=provenance(page,key)
    doc['flags']['runarcana'].update(mysteries=fields.get('mysteries',[]),classification=fields.get('classification'),sourceParameters=fields,manualEffects=True,manualAugmentation=True)
    if key in REVIEWED:doc['flags']['runarcana'].update(reviewedBaseActivity=reviewed(page),manualSourceChange=not reviewed(page))
    f=folder('spells',f'level:{level}',f'Level {level}')
    add('spells',doc,key,page,f)

def snowman(page):
    """Reviewed published summon; native summon matching supplies its caster attack and DC."""
    key=page['id']+'#summoned-creature';doc={'name':'Abominable Snowman','type':'npc','img':'icons/svg/mystery-man.svg','items':[],'effects':[],
        'system':{'abilities':{k:{'value':v} for k,v in zip(['str','dex','con','int','wis','cha'],[18,11,21,10,16,8])},'attributes':{'ac':{'calc':'flat','flat':19},'hp':{'value':100,'max':100},'movement':{'speeds':{'walk':'50'},'units':'ft'}},'traits':{'size':'huge'},'details':{'type':{'value':'elemental','subtype':'construct'},'biography':{'value':page['html']}}},'prototypeToken':{'actorLink':False},'flags':provenance(page,key)}
    doc['flags']['dnd5e']={'summon':{'level':8}}
    doc['flags']['runarcana'].update(enabled=True,manualRecharge=True,manualInitiative=True,manualSlowDuration=True,manualAugmentation=True,sourceInconsistency='8th-level spell says higher-level mana equals a 6th-level spell; no correction assumed.')
    for name,reach,parts in [('Bite',15,[('1d10 + 3 + @flags.dnd5e.summon.level','piercing'),('1d10 + @flags.dnd5e.summon.level','glacial')]),('Claws of Ice',10,[('2d6 + 3 + @flags.dnd5e.summon.level','glacial')])]:
        featurekey=key+'@'+name.lower().replace(' ','-');feat=item(name,'feat',page['html']);feat['_id']=uid(featurekey)
        a=activity(featurekey+'@attack',name,'attack',page['html'],attack={'ability':'none','flat':True,'bonus':'0','type':{'value':'melee','classification':'weapon'}},range={'override':True,'value':reach,'units':'ft'},damage={'includeBase':False,'parts':[damage_part(f,t) for f,t in parts]})
        feat['system']['activities']={a['_id']:a};doc['items'].append(feat)
    feat=item('Glacial Storm (Recharge 5–6)','feat',page['html']);feat['_id']=uid(key+'@storm')
    a=activity(key+'@storm-save','Glacial Storm','save',page['html'],save={'ability':['dex'],'dc':{'calculation':'','formula':'0'}},damage={'onSave':'half','parts':[damage_part('20d6 + @flags.dnd5e.summon.level','glacial')]},target={'override':True,'template':{'type':'sphere','size':'30','units':'ft'},'affects':{'type':'enemy','count':''},'prompt':True})
    feat['system']['activities']={a['_id']:a};doc['items'].append(feat)
    return add('companions',doc,key,page,folder('companions','spell-summons','Spell summons'))
def class_origin(page):
    typ='race' if page['kind']=='origin' else 'class'; pack='origins' if typ=='race' else 'classes';key=page['id']
    doc=item(page['title'],typ,page['html']);doc['system']['identifier']=key.rstrip('/').split('/')[-1]
    doc['system']['advancement']=[]
    text=BeautifulSoup(page['html'],'html.parser').get_text(' ',strip=True)
    if typ=='race':origin_advancements(page,doc)
    if typ=='class':
        match=re.search(r'Hit Dice:?\s*1d(\d+)',text,re.I)
        if match: doc['system']['hd']={'denomination':'d'+match[1],'spent':0}
        doc['system']['levels']=1
        doc['system']['spellcasting']={'progression':'none','ability':''}
        progression=next((t['rows'] for t in page['tables'] if t['rows'] and t['rows'][0][0].lower()=='level' and len(t['rows'])>=20),[])
        doc['flags']=provenance(page,key);doc['flags']['runarcana']['progressionTable']=progression
        classfolder=folder('features',key,page['title'])
        section_lookup={}
        progression_names={n.strip().casefold() for r in progression[1:] if len(r)>1 for n in r[1].split(',')}
        subclass_headers={'Acolyte':'rites','Arcanist':'arcanist-glyphs','Bodhisattva':'doctrines','Brute':'animas','Combatant':'honor','Hunter':'enclave','Marksman':'trails','Mercurial':'cabal','Shaman':'paths'}
        subclass_header=subclass_headers.get(page['title'])
        for s in page['sections']:
            if (s.get('parentH2')=='class-features' and s['level']==3 and s['anchor'] not in ['hit-points','proficiencies','equipment','quick-build']) or (s['level']<=3 and s['name'].casefold() in progression_names):
                feat=item(s['name'],'feat',s['html']); feat['system']['type']={'value':'class','subtype':''}
                u=add('features',feat,s['id'],page,classfolder); section_lookup[s['name'].casefold()]=u
        for sub in page['sections']:
            if not ((sub['level']==3 and sub.get('parentH2')==subclass_header) or (page['title']=='Marksman' and sub['anchor']=='khorsan-trail')):continue
            subclass=item(sub['name'],'subclass',sub['html'])
            subclass['system'].update(identifier=sub['anchor'],classIdentifier=doc['system']['identifier'],advancement=[])
            subfolder=folder('features',sub['id'],sub['name'],classfolder)
            for s in page['sections']:
                if s.get('parentH3')!=sub['anchor'] or s['level']!=4:continue
                feat=item(s['name'],'feat',s['html']);feat['system']['type']={'value':'class','subtype':''}
                u=add('features',feat,s['id'],page,subfolder)
                first=BeautifulSoup(s['html'],'html.parser').get_text(' ',strip=True)[:450]
                m=re.search(r'(?:reaching|reach|at|from)\s+(\d+)(?:st|nd|rd|th)?[- ]level',first,re.I)
                if m:
                    level=int(m[1])
                    subclass['system']['advancement'].append({'_id':uid(s['id']+'@grant'),'type':'ItemGrant','level':level,'title':s['name'],'configuration':{'items':[{'uuid':u,'optional':False}],'optional':False},'value':{}})
            add('subclasses',subclass,sub['id'],page,folder('subclasses',key,page['title']))
        if progression:
            for r in progression[1:]:
                if len(r)<2:continue
                m=re.match(r'(\d+)',r[0]); level=int(m[1]) if m else None
                features=[section_lookup[n.strip().casefold()] for n in r[1].split(',') if n.strip().casefold() in section_lookup]
                if level and features:
                    doc['system']['advancement'].append({'_id':uid(key+f'@grant-{level}'),'type':'ItemGrant','level':level,'title':'Class features','configuration':{'items':[{'uuid':u,'optional':False} for u in features],'optional':False},'value':{}})
        # Source numeric progression columns become native ScaleValue advancements.
        if progression:
            for col,name in enumerate(progression[0][2:],2):
                scaling={}
                for r in progression[1:]:
                    if len(r)>col and re.fullmatch(r'\d+',r[col]):
                        n=re.match(r'\d+',r[0]);
                        if n: scaling[n[0]]={'value':int(r[col])}
                if scaling:
                    ident=re.sub(r'[^a-z0-9]+','-',name.lower()).strip('-')
                    doc['system']['advancement'].append({'_id':uid(key+'@scale-'+ident),'type':'ScaleValue','configuration':{'identifier':ident,'type':'number','scale':scaling},'value':{},'title':name})
    add(pack,doc,key,page,folder(pack,key,page['title']))

def origin_advancements(page,doc):
    """Extract explicit common traits; preserve choices and exceptions for review."""
    key=page['id'];traits=next((s for s in page['sections'] if s['anchor'].endswith('origin-traits')),None)
    if not traits:return
    parsed=BeautifulSoup(traits['html'],'html.parser');grants=[]
    doc['flags']=provenance(page,key)
    doc['flags']['runarcana'].update(manualAttributeAllocation=True,manualRegionalChoices=True)
    for p in parsed.find_all('p',recursive=False):
        label=p.find(['em','strong'])
        if not label:continue
        name=label.get_text(' ',strip=True).rstrip(':.');text=p.get_text(' ',strip=True)
        traitkey=key+'#origin-trait-'+re.sub(r'[^a-z0-9]+','-',name.casefold()).strip('-')
        feat=item(name,'feat',str(p));feat['system']['type']={'value':'race','subtype':''}
        feat['flags']=provenance(page,traitkey);feat['flags']['runarcana'].update(manualEffects=True,requiresReview=True)
        u=add('features',feat,traitkey,page,folder('features',key,page['title']))
        # Inventory all named paragraphs, while granting actual features rather than creation instructions.
        metadata={'attributes','heritage','age','size','speed','deslocamento','past','region','languages','lineages','lineage','models','tribes','colonies','cradle'}
        if name.casefold() not in metadata:grants.append(u)
        if name.casefold()=='size':
            sizes=[v for label,v in [('small','sm'),('medium','med'),('large','lg'),('tiny','tiny')] if re.search(r'\b'+label+r'\b',text,re.I)]
            if sizes:doc['system']['advancement'].append({'_id':uid(key+'@size'),'type':'Size','configuration':{'sizes':sizes},'value':{}})
        if name.casefold()=='speed':
            m=re.search(r'base walking speed is (\d+) feet',text,re.I)
            if m:doc['system']['movement']={'speeds':{'walk':m[1]},'units':'ft'}
        if name.casefold() in ['darkvision','chirosense']:
            m=re.search(r'(\d+) feet',text)
            if m:doc['system']['senses']={'ranges':{'darkvision':int(m[1])},'units':'ft','special':''}
        if name.casefold() in ['heritage','region']:
            m=re.search(r'(?:have|receive)\s+(\d+)\s+(?:Origin |Region )?Heritage points?',text,re.I)
            if m:doc['flags']['runarcana']['initial'+name+'Points']=int(m[1])
    if grants:doc['system']['advancement'].append({'_id':uid(key+'@origin-grants'),'type':'ItemGrant','level':0,'title':'Origin features','configuration':{'items':[{'uuid':u,'optional':False} for u in grants],'optional':False},'value':{}})
    pools={'Antroplantae':'lineages','Chireans':'colonies','Construct':'models','Half-Dragon':'draconic-essences','Troll':'pack','Vastaya':'tribes','Yordle':'cradle'}
    heading=pools.get(page['title']);variants=[]
    for s in page['sections']:
        if not heading or s['level']!=3 or s.get('parentH2')!=heading:continue
        feat=item(s['name'],'feat',s['html']);feat['system']['type']={'value':'race','subtype':''}
        feat['flags']=provenance(page,s['id']);feat['flags']['runarcana'].update(originVariant=True,manualEffects=True,requiresReview=True)
        variants.append(add('features',feat,s['id'],page,folder('features',key+'@variants',page['title']+' variants')))
    if variants:doc['system']['advancement'].append({'_id':uid(key+'@variant-choice'),'type':'ItemChoice','title':heading.replace('-',' ').title(),'configuration':{'allowDrops':False,'type':'feat','choices':{'0':{'count':1,'replacement':False}},'pool':[{'uuid':u} for u in variants],'restriction':{'type':'race'}},'value':{}})
def npc(page,cr):
    key=cr['id']; stats=cr['vitals']; tags=cr['tags']; extra=cr['extra']
    def num(s,default=0):
        m=re.search(r'[+-]?\d+(?:\.\d+)?',str(s));return float(m[0]) if m else default
    hp=num(stats.get('HP'))
    bits=[x.strip() for x in cr['type'].split(',')]; size=bits[-1].lower() if len(bits)>1 else 'medium'
    sizekey={'small':'sm','medium':'med','large':'lg','huge':'huge','gargantuan':'grg','tiny':'tiny'}.get(size,'med')
    system={'abilities':{k:{'value':v} for k,v in cr['abilities'].items()},'attributes':{'hp':{'value':hp,'max':hp,'temp':0,'formula':stats.get('HP','').split('(',1)[-1].rstrip(')')},'ac':{'flat':num(stats.get('AC')),'calc':'flat'},'movement':{},'senses':{'special':extra.get('Senses','')},'init':{'bonus':str(num(stats.get('Initiative'))-((cr['abilities'].get('dex',10)-10)//2))}},'details':{'cr':num(tags.get('CR')),'type':{'value':bits[0].lower() if bits and bits[0].lower() in ['aberration','beast','celestial','construct','dragon','elemental','fey','fiend','giant','humanoid','monstrosity','ooze','plant','undead'] else 'custom','custom':bits[0] if bits else ''},'biography':{'value':page['html']}},'traits':{'size':sizekey,'languages':{'value':[],'custom':extra.get('Languages','')}}}
    for amount,mode in re.findall(r'(\d+)\s*(?:feet|ft\.?)\s*(?:of\s+)?(walking|flying|swimming|climbing|burrowing|walk|fly|swim|climb|burrow)',extra.get('Speed',''),re.I):
        system['attributes']['movement'].setdefault('speeds',{})[{'walking':'walk','flying':'fly','swimming':'swim','climbing':'climb','burrowing':'burrow'}.get(mode.lower(),mode.lower())]=amount
    system['attributes']['movement']['units']='ft'
    skill_abilities={'ath':('athletics','str'),'acr':('acrobatics','dex'),'ani':('animal handling','wis'),'arc':('arcana','int'),'dec':('deception','cha'),'his':('history','int'),'ins':('insight','wis'),'itm':('intimidation','cha'),'inv':('investigation','int'),'med':('medicine','wis'),'nat':('nature','int'),'prc':('perception','wis'),'prf':('performance','cha'),'per':('persuasion','cha'),'rel':('religion','int'),'slt':('sleight of hand','dex'),'ste':('stealth','dex'),'sur':('survival','wis')}
    system['skills']={}
    for skill,(name,ability) in skill_abilities.items():
        m=re.search(re.escape(name)+r'\s*([+-]\d+)',extra.get('Skills',''),re.I)
        if m:
            bonus=int(m[1])-(cr['abilities'].get(ability,10)-10)//2
            system['skills'][skill]={'value':0,'ability':ability,'bonuses':{'check':str(bonus),'passive':''}}
    doc={'name':cr['name'],'type':'npc','img':'icons/svg/mystery-man.svg','system':system,'items':[],'effects':[],'prototypeToken':{'name':cr['name'],'actorLink':False}}
    doc['flags']=provenance(page,key);doc['flags']['runarcana'].update(enabled=True,role=tags.get('Category'),sourceVitals=stats,sourceExtra=extra,damageReduction=num(stats.get('DR')),manualDefenses=True)
    for f in cr['features']:
        embedded=item(f['name'],'feat',f['html']);embedded['_id']=uid(f['id']);embedded['flags']=provenance(page,f['id'])
        m=re.search(r'(Melee|Ranged).*?Attack,\s*([+-]\d+) to hit,\s*(\d+)\s*(?:ft\.?|feet).*?(?:deals|takes)\s*\d+\s*\(([^)]+)\)\s*([A-Za-z]+)\s*damage',f['text'],re.I)
        if m and f['category'].lower()=='attacks':
            a=activity(f['id']+'@attack',f['name'],'attack',f['html'],attack={'ability':'none','bonus':m[2],'flat':True,'type':{'value':m[1].lower(),'classification':'weapon'}},damage={'includeBase':False,'parts':[damage_part(m[4],m[5])]},range={'override':True,'value':int(m[3]),'units':'ft'})
            embedded['system']['activities']={a['_id']:a}
        doc['items'].append(embedded)
        # Independent feature links facilitate browsing without duplicate Actors.
        add('creature-features',item(f['name'],'feat',f['html']),f['id'],page,folder('creature-features',key,cr['name']))
    add('bestiary',doc,key,page,folder('bestiary','type:'+bits[0],bits[0]))
def sections(page):
    routing={'heritage':('heritages','feat'),'improvement':('heritages','feat'),'rune':('runes','feat'),'runessence':('runes','feat'),'class-resource':('resources','feat'),'background':('backgrounds','background'),'craft':('crafts','tool'),'techmaturgy':('techmaturgy','feat'),'reward':('rewards','equipment'),'condition':('afflictions','feat'),'affliction':('afflictions','feat'),'echo':('creature-features','feat'),'ritual':('rituals','feat')}
    for s in page['sections']:
        if s['kind'] not in routing:continue
        pack,typ=routing[s['kind']]
        doc=item(s['name'],typ,s['html']);doc['flags']=provenance(page,s['id']);doc['flags']['runarcana'].update(category=s['kind'],manualEffects=True,requiresReview=True)
        add(pack,doc,s['id'],page,folder(pack,page['id'],page['title']))
def rolltables(page):
    for t in page['tables']:
        rows=t['rows']
        if not rows or len(rows[0])!=2:continue
        die=re.fullmatch(r'd(\d+)',rows[0][0].strip(),re.I)
        if not die:continue
        results=[]
        for i,r in enumerate(rows[1:]):
            if len(r)!=2:break
            m=re.fullmatch(r'(\d+)(?:\s*[-–—]\s*(\d+))?',r[0])
            if not m:break
            lo=int(m[1]);hi=int(m[2] or m[1])
            results.append({'_id':uid(t['id']+f'@result-{lo}-{hi}'),'type':'text','range':[lo,hi],'weight':hi-lo+1,'drawn':False,'description':r[1],'img':'icons/svg/d20.svg'})
        else:
            if results:
                covered=[n for r in results for n in range(r['range'][0],r['range'][1]+1)]
                if sorted(covered)!=list(range(1,int(die[1])+1)):
                    LIMITS[t['id']]='Native RollTable omitted: published ranges do not cover the stated die exactly. The full original table remains in the source journal.'
                    continue
                add('tables',{'name':page['title']+' — '+rows[0][1],'formula':rows[0][0].lower(),'replacement':True,'displayRoll':True,'results':results,'description':t['html']},t['id'],page,folder('tables',page['id'],page['title']))
def devices(page):
    if page['url'].endswith('/apparatus/mecha/'):
        table=next((t for t in page['tables'] if t['rows'] and t['rows'][0]==['Size','Complete','Partial'] and t['rows'][1][1]=='6'),None)
        if not table:return
        for row in table['rows'][1:]:
            for index,shield in [(1,'Complete'),(2,'Partial')]:
                if not row[index].isdigit():continue
                key=page['id']+'#base-'+row[0].lower()+'-'+shield.lower()
                doc={'name':row[0]+' '+shield+' Mecha (Craft 1)','type':'vehicle','img':'icons/svg/mystery-man.svg','items':[],'effects':[],
                     'system':{'attributes':{'hp':{'value':int(row[index]),'max':int(row[index])}},'details':{'biography':{'value':page['html']}},'traits':{'size':{'small':'sm','medium':'med','large':'lg','huge':'huge'}[row[0].lower()]}},
                     'flags':provenance(page,key),'prototypeToken':{'actorLink':False}}
                doc['flags']['runarcana'].update(device='mecha',size=row[0],shielding=shield,craftLevel=1,shieldingValue=int(row[index]),manualParameters=['armor','abilities','speed','fuel','line','developments','pilot'],mechanicalCoverage='partial')
                add('devices',doc,key,page,folder('devices','mecha','Mechas'))
    elif page['url'].endswith('/apparatus/servo/'):
        table=next((t for t in page['tables'] if t['rows'] and t['rows'][0][:6]==['Size','GP','STR','DEX','CON','HP']),None)
        if not table:return
        for row in table['rows'][1:]:
            key=page['id']+'#base-'+row[0].lower()
            abilities={a:{'value':int(re.match(r'\d+',row[col])[0])} for a,col in [('str',2),('dex',3),('con',4)]}
            hp=int(row[5]);doc={'name':row[0]+' Servo (base chassis)','type':'npc','img':'icons/svg/mystery-man.svg','items':[],'effects':[],
                'system':{'abilities':abilities,'attributes':{'hp':{'value':hp,'max':hp},'ac':{'calc':'flat','flat':10+(abilities['dex']['value']-10)//2}},'details':{'type':{'value':'construct'},'biography':{'value':page['html']}},'traits':{'size':{'tiny':'tiny','small':'sm','medium':'med','large':'lg','huge':'huge'}[row[0].lower()]}},'flags':provenance(page,key),'prototypeToken':{'actorLink':False}}
            doc['flags']['runarcana'].update(device='servo',sourceChassis=dict(zip(table['rows'][0],row)),manualParameters=['neuron','level','reactor','fuel','line','developments','controller','attacks'],mechanicalCoverage='partial')
            add('devices',doc,key,page,folder('devices','servo','Servo'))
def rewrite_links():
    def visit(v):
        if isinstance(v,dict):
            for k,x in list(v.items()): v[k]=visit(x)
        elif isinstance(v,list): return [visit(x) for x in v]
        elif isinstance(v,str) and '<a' in v:
            soup=BeautifulSoup(v,'html.parser')
            for a in soup.select('a[href]'):
                href=a['href'];target=href.split('#')[0].replace('/index.html','/')
                if target in PAGE_UUIDS:
                    label=a.get_text(' ',strip=True)
                    # Native journal page heading anchors survive within the journal body; retain original source link for precise navigation.
                    if '#' not in href: a.replace_with(f'@UUID[{PAGE_UUIDS[target]}]{{{label}}}')
            return str(soup)
        return v
    for docs in DOCUMENTS.values():
        for doc in docs: visit(doc)
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--local',action='store_true');args=parser.parse_args()
    rp=ROOT/'sources/ids.json'
    if rp.exists():REGISTRY.update(json.loads(rp.read_text(encoding='utf8')))
    corpus_path=ROOT/'data/local/corpus.json'
    if args.local:
        if not corpus_path.exists():raise SystemExit('Local build requires normalized official sources. Run collect.py and normalize.py first.')
        corpus=json.loads(corpus_path.read_text(encoding='utf8'))
    else:
        catalog=json.loads((ROOT/'sources/catalog.json').read_text(encoding='utf8'))
        corpus={'pages':[dict(p,html='') for p in catalog['pages'] if p['status']=='collected']}
    for page in corpus['pages']:
        journal(page,args.local)
        if not args.local:continue
        if page['kind']=='spell':spell(page)
        elif page['kind'] in ['class','origin']:class_origin(page)
        for cr in page['creatures']:npc(page,cr)
        if page['kind'] not in ['class','origin','spell','creature']:sections(page)
        rolltables(page)
        devices(page)
        generate_equipment(page,[e for e in corpus['entries'] if e.get('page')==page['id'] and e.get('kind')=='table-entry'],(add,item,activity,damage_part,folder,provenance))
    index={'id':'runarcana:start','url':'https://wiki.runarcana.org/en/','part':0,'title':'Runarcana — Start Here','html':'<p>Runarcana for dnd5e 6.0.6 / Foundry V14. This build has partial mechanical coverage and static validation only.</p><p>Use the Runarcana workbench to browse packs, preview imports and manage marked actors. Read the included coverage report before play.</p>'+''.join(f'<h2>{html.escape(label)}</h2><ul>'+''.join(f'<li>@UUID[{u}]{{{html.escape(next(p["title"] for p in corpus["pages"] if p["url"]==url))}}}</li>' for url,u in PAGE_UUIDS.items() if next(p['part'] for p in corpus['pages'] if p['url']==url)==part)+'</ul>' for part,label in GROUPS.items() if part!=90),'sha256':None}
    add('start',{'name':index['title'],'pages':[{'_id':uid('runarcana:start#overview'),'name':'Welcome','type':'text','text':{'content':index['html'],'format':1},'sort':100000}]},'runarcana:start',index)
    rewrite_links()
    target=ROOT/'packs-src'/('local' if args.local else 'release')
    # Only generator-owned JSON files are replaced; other workspace files are preserved.
    for pack in PACKS:
        directory=target/pack;directory.mkdir(parents=True,exist_ok=True)
        for p in directory.glob('*.json'):p.unlink()
        for doc in list(FOLDERS.get(pack,{}).values())+DOCUMENTS.get(pack,[]):dump(directory/(doc['_id']+'.json'),doc)
    manifest={'id':'runarcana','title':'Runarcana','description':'Runarcana rules and local content import for D&D Fifth Edition. Partial mechanical coverage; see coverage report.','version':'0.1.0','compatibility':{'minimum':'14.367','maximum':'14'},'authors':[{'name':'Runarcana Foundry contributors'}],'relationships':{'systems':[{'id':'dnd5e','type':'system','compatibility':{'minimum':'6.0.6','maximum':'6.0.6'}}],'recommends':[{'id':'babele','type':'module','compatibility':{'minimum':'2.9.1'}}]},'esmodules':['src/main.mjs'],'styles':['styles/runarcana.css'],'languages':[{'lang':'en','name':'English','path':'lang/en.json'}],'packs':[{'name':k,'label':v[0],'path':'packs/'+k,'type':v[1],'system':'dnd5e','ownership':{'PLAYER':'OBSERVER','ASSISTANT':'OWNER'}} for k,v in PACKS.items()],'packFolders':[{'name':'Runarcana','sorting':'m','color':'#397d80','folders':[{'name':label,'sorting':'m','packs':[k for k,v in PACKS.items() if v[2]==part]} for part,label in GROUPS.items()]}],'flags':{'runarcana':{'localContent':args.local,'mechanicalCoverage':'partial','runtimeVerified':False}}}
    manifest.update(url='https://github.com/PrevotYann/runarcana-foundry',manifest='https://raw.githubusercontent.com/PrevotYann/runarcana-foundry/main/module.json',download='https://github.com/PrevotYann/runarcana-foundry/releases/download/v0.1.0/runarcana-0.1.0.zip')
    manifest['authors']=[{'name':'PrevotYann','url':'https://github.com/PrevotYann'}]
    dump(ROOT/'module.json',manifest)
    dump(rp,dict(sorted(REGISTRY.items())))
    coverage=json.loads((ROOT/'sources/coverage.json').read_text(encoding='utf8'))
    for row in coverage['entries']:
        row['uuids']=COVERAGE.get(row['id'],[]);row['documents']=row['uuids']
        row['referenceUuid']=PAGE_UUIDS.get(row['url'])
        if row['id'] in LIMITS:row.update(limit=LIMITS[row['id']],mechanical='manual')
        if not args.local and row['textual']=='complete':row['textual']='local-cache-only'
    coverage['buildProfile']='local' if args.local else 'redistributable-references'
    coverage['documentCounts']={k:len(v) for k,v in DOCUMENTS.items()}
    dump(ROOT/'sources/coverage.json',coverage)
    dump(ROOT/'data/build-index.json',{'profile':coverage['buildProfile'],'documents':[{'pack':pack,'type':PACKS[pack][1],'id':d['_id'],'name':d['name'],'sourceId':d.get('flags',{}).get('runarcana',{}).get('canonicalId')} for pack,docs in DOCUMENTS.items() for d in docs]})
    print(f'Generated {sum(len(x) for x in DOCUMENTS.values())} documents ({coverage["buildProfile"]})')
if __name__=='__main__':main()
