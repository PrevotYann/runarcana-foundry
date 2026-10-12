"""Creation metadata from the collected origin rules; conditional actions retain their text."""
import re
from bs4 import BeautifulSoup

POOLS={'Antroplantae':'lineages','Chireans':'colonies','Construct':'models','Half-Dragon':'draconic-essences','Minotaur':'tribe','Troll':'pack','Vastaya':'tribes','Yordle':'cradle'}
SKILLS={'Acrobatics':'acr','Sleight of Hand':'slt','Stealth':'ste','Perception':'prc','Athletics':'ath','Animal Handling':'ani','Arcana':'arc','Deception':'dec','History':'his','Insight':'ins','Intimidation':'itm','Investigation':'inv','Medicine':'med','Nature':'nat','Performance':'prf','Persuasion':'per','Religion':'rel','Survival':'sur'}
SKILLS['Technology']='tec'

def weapon(name,dice,damage,ability='str',bonus='',bonus_action=False,**extra):
    n,d=map(int,dice.split('d'))
    return {'id':name.lower().replace(' ','-'),'name':name,'number':n,'denomination':d,'damageType':damage,'ability':ability,'bonus':bonus,'bonusAction':bonus_action,**extra}

def stats(html):
    soup=BeautifulSoup(html,'html.parser');text=soup.get_text(' ',strip=True)
    result={'movement':{},'senses':{},'skills':{},'choices':[],'notes':text}
    # Only explicit permanent movement is read; durations and situational speed are excluded.
    for p in soup.find_all('p',recursive=False):
        label=p.find(['em','strong']);name=label.get_text(' ',strip=True).rstrip(':.').casefold() if label else ''
        t=p.get_text(' ',strip=True)
        if name in ['speed','deslocamento','maritime']:
            for pattern,mode in [(r'base walking speed is (\d+) feet','walk'),(r'base de caminhada . (\d+)','walk'),(r'(?:climbing speed|swimming speed|swimming range|flying speed) of (\d+) feet',None)]:
                for m in re.finditer(pattern,t,re.I):
                    k=mode or ('climb' if 'climbing' in m[0] else 'fly' if 'flying' in m[0] else 'swim')
                    result['movement'][k]=int(m[1])
        if name=='size':
            sizes=[code for word,code in [('small','sm'),('medium','med'),('large','lg'),('tiny','tiny')] if re.search(r'\b'+word+r'\b',t,re.I)]
            if sizes:result['sizes']=sizes
        if name in ['darkvision','chirosense','born hunter']:
            m=re.search(r'(\d+) feet',t)
            if m:result['senses']['darkvision']=int(m[1])
    return result

def creation(page,variants):
    section=next(s for s in page['sections'] if s['anchor'].endswith('origin-traits'))
    result=stats(section['html']);result.update(schema=1,origin=page['title'],variants=variants,heritagePoints=0 if page['title']=='Runeborn' else 3 if page['title']=='Human' else 2,regionPoints=0 if page['title']=='Runeborn' else 2 if page['title'] in ['Human','Yordle'] else 1)
    result.setdefault('sizes',['sm','med']);result['movement'].setdefault('walk',30)
    languages={'Antroplantae':['Sylvan'],'Chireans':['Chirean','Zaunite'],'Half-Dragon':['Draconic'],'Minotaur':['Minotaur'],'Troll':['Troll'],'Yordle':['Yordle']}
    result['languages']=languages.get(page['title'],[])
    if page['title']=='Chireans':result['region']='Zaun'
    if page['title']=='Human':result['choices']=[{'id':'skill','type':'skill','options':list(SKILLS.values())},{'id':'craft','type':'craft'}]
    if page['title']=='Construct':result['resistance']=['poison'];result['armorModes']=['null','light','medium','heavy']
    if page['title']=='Minotaur':result['hpOverall']='min(8, @details.level) + 2 * max(0, min(8, @details.level - 8)) + 3 * max(0, @details.level - 16)'
    if page['title']=='Minotaur':result['naturalWeapons']=[weapon('Horns','1d8','piercing',bonus='@prof',bonus_action=True,criticalThreshold=19,criticalMultiplier=3,bonusCondition='After making another melee attack.')]
    if page['title']=='Troll':result['naturalWeapons']=[weapon('Bite','1d6','piercing',bonus='@prof',bonus_action=True,upgrade={'level':6,'denomination':8,'magical':True})]
    if page['title']=='Runeborn':
        gallery=next(s for s in page['sections'] if s['anchor']=='trait-gallery')
        result['runeborn']=[]
        for table in BeautifulSoup(gallery['html'],'html.parser').find_all('table'):
            category=table.find('caption').get_text(' ',strip=True)
            group=''
            for row in table.find_all('tr')[1:]:
                cells=row.find_all('td')
                if len(cells)==1:group=cells[0].get_text(' ',strip=True);continue
                if len(cells)!=2:continue
                name,description=[c.get_text(' ',strip=True) for c in cells]
                result['runeborn'].append({'id':re.sub(r'[^a-z0-9]+','-',(category+'-'+(description if category=='Disadvantages' else name)).lower()).strip('-'),'name':description if category=='Disadvantages' else name,'description':description,'category':category,'group':group,'points':float(name.replace(',','.')) if category=='Disadvantages' else 0})
    return result

def variant(page,section,uuid):
    result=stats(section['html']);result.update(id=section['anchor'],name=section['name'],uuid=uuid)
    name=result['name'];origin=page['title']
    if origin=='Antroplantae':
        soup=BeautifulSoup(section['html'],'html.parser');options=[]
        for li in soup.select('ul > li'):
            strong=li.find('strong')
            if strong:options.append({'id':re.sub(r'[^a-z0-9]+','-',strong.get_text().lower()).strip('-'),'name':strong.get_text(' ',strip=True).rstrip('.'),'description':li.get_text(' ',strip=True)})
        result['choices'].append({'id':'botany','type':'option','optional':name=='Arboreal','options':options})
        if name=='Arboreal':result['ac']='10 + @abilities.dex.mod + @abilities.con.mod'
    if origin=='Chireans':
        if name=='Nocti':result['senses']['darkvision']=120;result['choices']=[{'id':'skill','type':'skill','options':['acr','slt','ste'],'expertiseIfKnown':True},{'id':'craft','type':'craft'}];result['skills']['tec']=1
        else:result['sizes']=['med']
    if origin=='Construct':
        if name=='Brutal':result['choices']=[{'id':'resistance','type':'damage','options':['acid','lightning','force','fire','cold','necrotic','psychic','radiant']}]
        if name=='Envoy':result['choices']=[{'id':'functional','type':'proficiency'}]
    if origin=='Minotaur':
        if name=='Aelus':result['initiativeAdvantage']=True
        if name=='Aurochs':result['ac']='11 + @abilities.dex.mod'
        if name=='Alnuk':result['strengthReduction']=True
    if origin=='Half-Dragon':
        result['elementalDefense']={'Glacial Elemental':['cold','glacial','fire'],'Infernal Elemental':['fire','incinerating','cold'],'Mountain Elemental':['thunder','vibrational','acid'],'Cloud Elemental':['lightning','plasma','cold'],'Ocean Elemental':['acid','antimonic','lightning']}[name]
        result['resistance']=[result['elementalDefense'][0]]
        result['naturalWeapons']={
            'Glacial Elemental':[weapon('Bite','1d4','piercing'),weapon('Claws','1d6','slashing',ability=''),weapon('Horns','1d4','piercing')],
            'Infernal Elemental':[weapon('Horns','1d6','piercing'),weapon('Tail','1d4','bludgeoning'),weapon('Claws','1d4','piercing',ability='dex')],
            'Mountain Elemental':[weapon('Tail','1d6','bludgeoning'),weapon('Claws','1d4','slashing',ability=''),weapon('Bite','1d4','piercing')],
            'Cloud Elemental':[weapon('Horns','1d6','bludgeoning'),weapon('Tail','1d4','bludgeoning',ability=''),weapon('Bite','1d4','piercing')],
            'Ocean Elemental':[weapon('Tail','1d4','slashing',ability=''),weapon('Claws','1d4','piercing'),weapon('Bite','1d6','piercing')]
        }[name]
    if origin=='Troll':
        result['region']={'Sand Troll':'Shurima','Ice Troll':'Freljord','Jungle Troll':'Kumungu'}[name]
        if name=='Sand Troll':result['skills']['ste']=1
        if name=='Jungle Troll':result['immunity']=['poison'];result['conditionImmunity']=['poisoned'];result['senses']['darkvision']=120
    if origin=='Vastaya':
        result['languages']=[name]
        if name=='Oovi-Kat':result['languages']=['Vastayashai’rei'];result['choices']=[{'id':'languages','type':'languages'}]
        if name=='Shimon':result['choices']=[{'id':'skill','type':'skill','options':list(SKILLS.values())},{'id':'craft','type':'craft'}]
        if name=='Vesani':result['choices']=[{'id':'castingAbility','type':'ability','options':['cha','wis']}]
        if name=='Fauhwoon':result['naturalWeapons']=[weapon('Horns','1d8','bludgeoning')]
        if name=='Kiilash':result['naturalWeapons']=[weapon('Claws','1d6','slashing',ability='',bonus='@prof'),weapon('Bite','2d4','piercing',bonus='@prof')]
        if name=='Marai':result['underwaterVision']=60
        # Underwater-only darkvision remains a situational instruction on Marai.
    if origin=='Yordle':
        if name=='Aquatic':result['resistance']=['bludgeoning'];result['acBonus']='@prof';result['underwaterVision']=120
        if name=='Faeric':result['movement']['fly']=30
        if name=='Fluffy':result['movement']['walk']=40;result['heavyWeaponSpeed']=30
    return result
