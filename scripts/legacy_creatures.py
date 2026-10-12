"""Read explicitly labeled legacy monster tables; leave conditional abilities manual."""
import collections,re
from bs4 import BeautifulSoup

SECTIONS={'actions','reactions','legendary actions','runes'}
FIELDS={'armor class':'AC','hit points':'HP','challenge rating':'CR'}

def segments(cell):
    """Keep each direct bold label and its complete following markup together."""
    label=None;body=[]
    for node in cell.contents:
        if getattr(node,'name',None)=='strong':
            if label is not None:yield label,''.join(body)
            label=node.get_text(' ',strip=True).rstrip(':.');body=[]
        else:body.append(str(node))
    if label is not None:yield label,''.join(body)

def legacy_creatures(prose,row,clean_html):
    result=[]
    for table in prose.select('table'):
        caption=table.caption
        if not caption or not caption.strong or not caption.em:continue
        text=table.get_text(' ',strip=True)
        if not all(label in text for label in ('Armor Class:','Hit Points:','Challenge Rating:')):continue
        published_type=caption.em.get_text(' ',strip=True)
        match=re.fullmatch(r'([A-Za-z]+)(?:\s*\(([^)]+)\))?\s+(Tiny|Small|Medium|Large|Huge|Gargantuan),\s*(.+)',published_type,re.I)
        if not match:raise ValueError(f'Unrecognized legacy creature type: {row["id"]}: {published_type}')
        index=len(result);key=row['id'] if index==0 else row['id']+f'#stat-block-{index}'
        cr={'id':key,'name':caption.strong.get_text(' ',strip=True),'html':clean_html(table,row['url']),
            'type':match[1]+', '+match[3],'abilities':{},'vitals':{},'tags':{},
            'extra':{'Published Type':published_type,'Subtype':match[2] or '', 'Alignment':match[4]},'features':[], 'legacy':True}
        category='Traits';occurrences=collections.Counter()
        for tr in table.find_all('tr'):
            cells=tr.find_all(['td','th'],recursive=False)
            if len(cells)==6:
                for cell in cells:
                    m=re.fullmatch(r'(STR|DEX|CON|INT|WIS|CHA)\s+(\d+)\s*\([+-]?\d+\)',cell.get_text(' ',strip=True),re.I)
                    if not m:raise ValueError(f'Invalid legacy ability: {key}')
                    cr['abilities'][m[1].lower()]=int(m[2])
                continue
            for cell in cells:
                parts=list(segments(cell))
                if len(parts)==1 and parts[0][0].casefold() in SECTIONS and not BeautifulSoup(parts[0][1],'html.parser').get_text(strip=True):
                    category=parts[0][0];continue
                for label,body in parts:
                    value=BeautifulSoup(body,'html.parser').get_text(' ',strip=True).lstrip('. ')
                    if label.casefold() in FIELDS:
                        field=FIELDS[label.casefold()]
                        if field=='CR':cr['tags'][field]=value.replace('\u00bc','1/4').replace('\u00bd','1/2').replace('\u215b','1/8')
                        else:cr['vitals'][field]=value
                    elif label.casefold() in {'speed','skills','senses','region','languages','damage resistance','damage immunity','damage vulnerabilities','condition immunity','saving throws'}:
                        cr['extra'][label]=value
                    else:
                        slug=re.sub(r'[^a-z0-9]+','-',(category+'-'+label).casefold()).strip('-')
                        occurrences[slug]+=1;fid=key+'#'+slug+(f'-{occurrences[slug]}' if occurrences[slug]>1 else '')
                        fragment=BeautifulSoup('<div></div>','html.parser');wrapper=fragment.div
                        strong=fragment.new_tag('strong');strong.string=label;wrapper.append(strong)
                        for child in list(BeautifulSoup(body,'html.parser').contents):wrapper.append(child)
                        cr['features'].append({'id':fid,'name':label,'category':category,'html':clean_html(wrapper,row['url']),'text':label+'. '+value})
        if len(cr['abilities'])!=6 or not all(f in cr['vitals'] for f in ('AC','HP')) or 'CR' not in cr['tags']:
            raise ValueError(f'Incomplete legacy creature: {key}')
        speed=cr['extra'].get('Speed','');cr['extra']['Published Speed']=speed
        modes={'fly':'flying','swim':'swimming','climb':'climbing','burrow':'burrowing'}
        cr['extra']['Speed']=', '.join(re.sub(r'^(?:(fly|swim|climb|burrow)\s+)?(\d+)\s*(?:feet|ft\.?)',lambda m:m[2]+' feet '+modes.get(m[1],'walking'),part.strip()) for part in speed.split(','))
        result.append(cr)
    return result
