"""Native equipment conversion from explicit official table columns. Ambiguities stay in flags."""
import html,re
from bs4 import BeautifulSoup
def decimal(value):
    m=re.search(r'\d+(?:[.,]\d+)*',value)
    if not m:return None
    value=m[0]
    if ',' in value:value=value.replace('.','').replace(',','.')
    elif re.fullmatch(r'\d{1,3}(?:\.\d{3})+',value):value=value.replace('.','')
    return float(value)
def physical(system,fields):
    weight=fields.get('weight','');price=fields.get('price','')
    if decimal(weight) is not None:system['weight']={'value':decimal(weight),'units':'kg' if 'kg' in weight.lower() else 'lb'}
    m=re.search(r'\b(cp|sp|ep|gp|pp)\b',price,re.I)
    if m and decimal(price) is not None:system['price']={'value':decimal(price),'denomination':m[1].lower()}
    system['quantity']=1
def generate_equipment(page,entries,helpers):
    add,item,activity,damage_part,folder,provenance=helpers
    if '/equipment/' not in page['url']:return
    section_by_table={}
    for ti,table in enumerate(page['tables']):
        if not table['rows']:continue
        headers=[h.casefold() for h in table['rows'][0]]; category='General'
        for ri,row in enumerate(table['rows'][1:],1):
            if len(row)==1:category=row[0];continue
            matched=[e for e in entries if e.get('table')==ti and e.get('row')==ri]
            for entry in matched:
                ni=entry.get('column',0)
                columns=dict(zip(headers[ni:ni+3] if len(headers)>4 and headers.count('item')>1 else headers,row[ni:ni+3] if len(headers)>4 and headers.count('item')>1 else row))
                name=entry['name'].strip(' ⠀');key=entry['id']
                if not name or name in ['Ammunition','Major Craft Sets:','Minor Craft Sets:'] or not ('price' in columns or 'damage' in columns or 'armor class' in columns or 'modification' in columns):continue
                typ='weapon' if 'damage' in columns and 'crit' in columns else 'equipment' if 'armor class' in columns else 'tool' if headers[0]=='set' else 'feat' if 'modification' in columns else 'loot'
                # A mount without published defensive stats remains explicitly incomplete, never an invented NPC.
                if headers[0] in ['mount','vehicle']:continue
                desc='<table>'+''.join('<tr><th>'+html.escape(k)+'</th><td>'+html.escape(v)+'</td></tr>' for k,v in columns.items())+'</table>'
                doc=item(name,typ,desc);system=doc['system'];physical(system,columns)
                doc['flags']=provenance(page,key);flags=doc['flags']['runarcana'];flags.update(sourceColumns=columns,category=category,manualProperties=True)
                f=folder('equipment','category:'+category,category)
                if typ=='weapon':
                    properties=columns.get('properties','');native=[]
                    for label,code in [('finesse','fin'),('light','lgt'),('heavy','hvy'),('two-handed','two'),('thrown','thr'),('versatile','ver'),('ammunition','amm'),('reach','rch')]:
                        if re.search(r'\b'+label+r'\b',properties,re.I):native.append(code)
                    ranged='ranged' in category.casefold() or 'misfire' in columns
                    system.update(properties=native,type={'value':('simple' if 'simple' in category.lower() else 'martial')+('R' if ranged else 'M')},mastery=columns.get('mastery','').lower())
                    # Multiple mastery labels and bespoke masteries remain literal metadata.
                    if not re.fullmatch(r'[a-z]+',system['mastery']):system['mastery']=''
                    crit=columns.get('crit','');mult=re.search(r'x(\d+)',crit,re.I);threshold=re.search(r'\b(1[89]|20)\b',crit)
                    flags['criticalMultiplier']=int(mult[1]) if mult else 2
                    rng=columns.get('range','');m=re.search(r'(\d+)\s*/\s*(\d+)',rng or properties)
                    system['range']={'value':int(m[1]) if m else None,'long':int(m[2]) if m else None,'reach':None if ranged else 5,'units':'ft'}
                    components=re.findall(r'(\d+d\d+(?:\s*[+-]\s*\d+)?)\s*(bludgeoning|piercing|slashing|fire|acid|cold|[bps])\b',columns['damage'],re.I)
                    for i,(formula,damage_type) in enumerate(components):
                        damage_type={'b':'bludgeoning','p':'piercing','s':'slashing'}.get(damage_type.lower(),damage_type.lower())
                        a=activity(key+f'@damage-{damage_type}-{i}',name if len(components)==1 else name+' — '+damage_type,'attack',desc,
                            attack={'ability':'','bonus':'','flat':False,'critical':{'threshold':int(threshold[1]) if threshold else 20},'type':{'value':'ranged' if ranged else 'melee','classification':'weapon'}},damage={'includeBase':False,'parts':[damage_part(formula+' + @mod',damage_type)]})
                        if 'misfire' in columns:
                            capacity=re.search(r'(?:cap\.?|charge)\s*(\d+)',properties,re.I)
                            flags['misfireThreshold']=decimal(columns['misfire']);flags['manualMisfire']=True
                            if capacity:
                                system['uses']={'max':capacity[1],'spent':0,'recovery':[]}
                                a['consumption']['targets']=[{'type':'itemUses','target':'','value':'1','scaling':{'mode':'','formula':''}}]
                                flags['manualReload']=True
                        system['activities'][a['_id']]=a
                    if not components:flags['manualDamage']=True
                elif typ=='equipment':
                    cat=category.lower();ac=columns.get('armor class','');n=decimal(ac)
                    armor_type='shield' if 'shield' in cat else 'light' if 'light' in cat else 'medium' if 'medium' in cat else 'heavy' if 'heavy' in cat else 'medium'
                    system['type']={'value':armor_type};system['properties']=['stealthDisadvantage'] if 'disadvantage' in columns.get('stealth','').lower() else []
                    if n is not None:system['armor']={'value':int(n),'dex':2 if 'max +2' in ac else None if 'dexterity' in ac.lower() else 0}
                    if 'defense modifier' in ac.lower():flags['manualArmorClass']=True
                    strength=decimal(columns.get('strengt',''));system['strength']=int(strength or 0)
                    flags.update(damageReduction=columns.get('dr','-'),damageReductionException=columns.get('exception','-'),manualDamageReduction=True)
                add('equipment',doc,key,page,f)
