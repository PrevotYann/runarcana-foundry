"""Offline extraction. Preserve source text and mark inferred mechanics for review.
Wiki text inclusion in this free module uses the maintainer's recorded permission.
"""
import collections, gzip, hashlib, json, pathlib, re, urllib.parse
from bs4 import BeautifulSoup, Tag
from collect import canonical, ROOT

def dump(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
def sid(key): return hashlib.sha256(key.encode()).hexdigest()[:16]
def clean_html(node,url):
    clone=BeautifulSoup(str(node),'html.parser')
    for x in clone.select('script,style,iframe,form,button,input,select,.spell-tools,.spell-empty'): x.decompose()
    for x in clone.find_all(True):
        for k in list(x.attrs):
            if k.startswith('on') or k.startswith('data-') or k in ('style','srcset','hidden'): del x[k]
    for x in clone.select('img'):
        u=urllib.parse.urljoin(url,x.get('src',''))
        a=clone.new_tag('a',href=u); a.string=x.get('alt','Source illustration'); x.replace_with(a)
    for x in clone.select('a[href]'):
        target=urllib.parse.urljoin(url,x['href'])
        if urllib.parse.urlsplit(target).scheme not in ['http','https','mailto']:x.unwrap()
        else:x['href']=target
    return str(clone)
def classify(url):
    if '/magic/spells/' in url and not url.endswith('/spells/'): return 'spell'
    if '/creatures/' in url and not url.endswith('/creatures/'): return 'creature'
    if '/origins/' in url and not url.endswith('/origins/'): return 'origin'
    if '/classes/' in url and not url.endswith('/classes/'): return 'class'
    if '/rituals/list/' in url: return 'ritual'
    return 'reference'
def section_kind(url,title,level):
    for needle,kind in [('heritages','heritage'),('improvement','improvement'),('runes/list','rune'),('runessences','runessence'),('class-resources','class-resource'),('pasts','background'),('crafts','craft'),('apparatus','techmaturgy'),('rewards','reward'),('conditions','condition'),('afflictions','affliction'),('echoes','echo'),('equipment','equipment'),('rituals','ritual')]:
        if needle in url: return kind
    return 'section'
def table_rows(table):
    return [[c.get_text(' ',strip=True) for c in tr.find_all(['td','th'],recursive=False)] for tr in table.find_all('tr')]
def main():
    cat=json.loads((ROOT/'sources/catalog.json').read_text(encoding='utf8'))
    pages=[]; entries=[]; coverage=[]; counts=collections.Counter()
    for row in cat['pages']:
        base={'id':row['id'],'part':row['part'],'chapter':'/'.join(row['id'].strip('/').split('/')[1:-1]),'url':row['url'],'anchor':None,'language':row['language'],'sha256':row.get('sha256'),'collectedAt':row.get('collectedAt'),'rulesVersion':row.get('rulesVersion'),'wikiBuild':row.get('wikiBuild'),'collectionStatus':row['status'],'documents':[],'uuids':[],'test':'tests/corpus.test.mjs','status':'partial','textual':'missing','mechanical':'manual','redistribution':'permission-confirmed-by-maintainer'}
        if row['status']!='collected':
            unattempted=row['status']=='pending' or row.get('error')=='Not present in local source cache'
            coverage.append(base|{'status':'partial' if unattempted else 'source-unavailable','limit':'Full source not yet collected.' if unattempted else row.get('error')}); continue
        soup=BeautifulSoup((ROOT/row['cache']).read_bytes(),'html.parser')
        article=soup.select_one('main article') or soup.select_one('main')
        prose=article.select_one('.prose') or article
        title=row['title']; text=prose.get_text(' ',strip=True)
        incomplete=bool(re.search(r'under construction|work in progress|in development|em constru[çc][aã]o',text,re.I))
        tables=[];table_occurrences=collections.Counter()
        for t in prose.select('table'):
            heading=t.find_previous(['h2','h3','h4','h5'])
            caption=t.find('caption')
            rows=table_rows(t)
            label=(caption.get_text(' ',strip=True) if caption else '') or (heading.get('id') if heading else '') or '|'.join(rows[0] if rows else [])
            slug=re.sub(r'[^a-z0-9]+','-',label.casefold()).strip('-')
            occurrence=table_occurrences[slug];table_occurrences[slug]+=1
            table_key=row['id']+'#table-'+slug+(f'-{occurrence+1}' if occurrence else '')
            tables.append({'id':table_key,'rows':rows,'html':clean_html(t,row['url'])})
            coverage.append(base|{'id':table_key,'anchor':heading.get('id') if heading else None,'kind':'source-table','textual':'complete','mechanical':'partial','limit':'Native RollTable only for an exact dice/range table; other source tables stay in full journals and metadata.'})
        content=BeautifulSoup(str(article),'html.parser')
        for header in content.select('.article-header'):header.decompose()
        for wrapper in content.select('article'):wrapper.unwrap()
        page={'id':row['id'],'url':row['url'],'title':title,'part':row['part'],'kind':classify(row['url']),'language':'en','rulesVersion':row.get('rulesVersion'),'wikiBuild':row.get('wikiBuild'),'sha256':row['sha256'],'html':clean_html(content,row['url']),'tables':tables,'sections':[],'incomplete':incomplete}
        sheet=article.select_one('.spell-sheet')
        if sheet:
            page['spell']={d.dt.get_text(' ',strip=True):d.dd.get_text(' ',strip=True) for d in sheet.select('dl > div') if d.dt and d.dd}
            page['spell']['classification']=(sheet.select_one('.spell-classification').get_text(' ',strip=True) if sheet.select_one('.spell-classification') else '')
            page['spell']['mysteries']=[x.get_text(' ',strip=True) for x in sheet.select('.spell-mysteries span')]
            if page['id']=='/en/magic/spells/abominable-snowman/':
                coverage.append(base|{'id':page['id']+'#summoned-creature','kind':'spell-summon','textual':'complete','mechanical':'partial','limit':'Published summon stats/attacks and native caster matching. Recharge, initiative and slow duration are manual; augmentation source contradicts the base spell level.'})
        # All anchors remain individually auditable, including nested sections.
        for h in prose.select('h2[id],h3[id],h4[id],h5[id],h6[id]'):
            fragment=[str(h)]; level=int(h.name[1]); sibling=h.next_sibling
            while sibling:
                if isinstance(sibling,Tag) and re.fullmatch('h[1-6]',sibling.name) and int(sibling.name[1])<=level: break
                fragment.append(str(sibling)); sibling=sibling.next_sibling
            key=row['id']+'#'+h['id']
            parent_h2=h.find_previous('h2') if level>2 else None
            parent_h3=h.find_previous('h3') if level>3 else None
            section={'id':key,'anchor':h['id'],'name':h.get_text(' ',strip=True),'level':level,'parentH2':parent_h2.get('id') if parent_h2 else None,'parentH3':parent_h3.get('id') if parent_h3 else None,'kind':section_kind(row['url'],h.get_text(),level),'html':clean_html(BeautifulSoup(''.join(fragment),'html.parser'),row['url'])}
            page['sections'].append(section); entries.append({'page':row['id'],**section})
            coverage.append(base|{'id':key,'anchor':h['id'],'kind':section['kind'],'textual':'complete','status':'source-incomplete' if incomplete else 'partial','limit':'Mechanical conversion requires review; HTML anchors alone are not a closed inventory.'})
        if page['kind']=='origin':
            origin_traits=next((s for s in page['sections'] if s['anchor'].endswith('origin-traits')),None)
            if origin_traits:
                for p in BeautifulSoup(origin_traits['html'],'html.parser').find_all('p',recursive=False):
                    label=p.find(['em','strong'])
                    if not label:continue
                    name=label.get_text(' ',strip=True).rstrip(':.')
                    key=row['id']+'#origin-trait-'+re.sub(r'[^a-z0-9]+','-',name.casefold()).strip('-')
                    entries.append({'id':key,'page':row['id'],'name':name,'kind':'origin-trait','html':str(p)})
                    coverage.append(base|{'id':key,'anchor':origin_traits['anchor'],'kind':'origin-trait','textual':'complete','mechanical':'partial','limit':'Native grants and explicit size/speed/senses; conditional traits and attribute allocation require review.'})
        # Named table entries have no anchors in many equipment/formula lists.
        for ti,t in enumerate(tables):
            row_occurrences=collections.Counter()
            named_columns=[i for i,label in enumerate(t['rows'][0] if t['rows'] else []) if label.casefold() in ['name','item','modification','mount','vehicle','set','ammunition','formula','spell','creature','heritage']]
            for ri,cells in enumerate(t['rows'][1:],1):
                for ni in named_columns or [0]:
                    if len(cells)<=max(1,ni) or not cells[ni] or re.fullmatch(r'[\dº°–—.,+ /-]+',cells[ni]):continue
                    slug=re.sub(r'[^a-z0-9]+','-',cells[ni].casefold()).strip('-')
                    occurrence=row_occurrences[slug];row_occurrences[slug]+=1
                    key=t['id']+'-entry-'+slug+(f'-{occurrence+1}' if occurrence else '')
                    entries.append({'id':key,'page':row['id'],'name':cells[ni],'kind':'table-entry','table':ti,'row':ri,'column':ni,'cells':cells})
                    coverage.append(base|{'id':key,'kind':'table-entry','textual':'complete','limit':'Named table row retained; mechanics require category-specific review.'})
        # Structured bestiary stat blocks are parsed separately from prose.
        page['creatures']=[]
        # Lists may expose hundreds of entries outside .prose; record each authoritative card independently.
        page['listedEntries']=[]
        for card in article.select('[data-spell-card]'):
            target=canonical(card.get('href'),row['url'])
            if not target:continue
            entry={'id':urllib.parse.urlsplit(target).path,'url':target,'kind':'spell','name':card.strong.get_text(' ',strip=True),'level':card.get('data-level'),'mysteries':card.get('data-mystery','').split(),'classes':card.get('data-class','').split(),'origins':card.get('data-origin','').split(),'catalogPage':row['id']}
            page['listedEntries'].append(entry)
            entries.append(entry|{'page':row['id']})
            coverage.append(base|{'id':entry['id']+'@catalog','targetId':entry['id'],'kind':'spell-list-entry','textual':'partial','limit':'Catalog metadata only; full spell page is tracked separately.'})
        for bi,b in enumerate(prose.select('.creature-stat-block')):
            name=b.select_one('.creature-stat-name h3')
            key=row['id'] if bi==0 else row['id']+f'#stat-block-{bi}'
            cr={'id':key,'name':name.get_text(' ',strip=True) if name else title,'html':clean_html(b,row['url'])}
            cr['vitals']={}
            for x in b.select('.creature-stat-vitals > div'):
                label=x.select_one('.stat-label')
                if label: cr['vitals'][label.get_text(strip=True)]=x.get_text(' ',strip=True)[len(label.get_text(strip=True)):].strip()
            cr['tags']={x.span.get_text(strip=True):x.strong.get_text(strip=True) for x in b.select('.creature-stat-tags > div') if x.span and x.strong}
            cr['type']=b.select_one('.creature-stat-type').get_text(' ',strip=True) if b.select_one('.creature-stat-type') else ''
            cr['abilities']={}
            for x in b.select('.attr-name'):
                m=re.match(r'(STR|DEX|CON|INT|WIS|CHA):\s*(\d+)',x.get_text(' ',strip=True),re.I)
                if m: cr['abilities'][m[1].lower()]=int(m[2])
            cr['extra']={x.dt.get_text(strip=True):x.dd.get_text(' ',strip=True) for x in b.select('dl > div') if x.dt and x.dd}
            cr['features']=[];feature_occurrences=collections.Counter()
            for si,s in enumerate(b.select('.creature-section')):
                label=s.select_one('.creature-section-label')
                for pi,p in enumerate(s.find_all('p',recursive=False)):
                    if p==label: continue
                    strong=p.find('strong')
                    fname=strong.get_text(' ',strip=True) if strong else f'Ability {si+1}.{pi+1}'
                    category=label.get_text(' ',strip=True) if label else ''
                    feature_id=key+'#'+re.sub(r'[^a-z0-9]+','-',(category+'-'+fname).casefold()).strip('-')
                    occurrence=feature_occurrences[feature_id];feature_occurrences[feature_id]+=1
                    if occurrence:feature_id+=f'-{occurrence+1}'
                    cr['features'].append({'id':feature_id,'name':fname,'category':category, 'html':clean_html(p,row['url']),'text':p.get_text(' ',strip=True)})
                    entries.append({'page':row['id'],'id':feature_id,'name':fname,'kind':'creature-feature','html':clean_html(p,row['url'])})
                    coverage.append(base|{'id':feature_id,'kind':'creature-feature','textual':'complete','mechanical':'partial','limit':'Structured attack fields convert only where their published syntax is exact. Conditions/runes and other abilities need individual review.'})
            page['creatures'].append(cr)
            if bi>0:
                coverage.append(base|{'id':key,'kind':'creature-stat-block','textual':'complete','mechanical':'partial','limit':'Separate native Actor for this published variant; conditional abilities and missing source fields need review.'})
        if '/garden-of-shadows/creatures/' in row['id'] and not page['creatures']:
            from legacy_creatures import legacy_creatures
            for cr in legacy_creatures(prose,row,clean_html):
                page['creatures'].append(cr)
                for feature in cr['features']:
                    entries.append({'page':row['id'],'id':feature['id'],'name':feature['name'],'kind':'creature-feature','html':feature['html']})
                    coverage.append(base|{'id':feature['id'],'kind':'creature-feature','textual':'complete','mechanical':'partial','limit':'Legacy published attack statistics converted where exact; conditional effects and runes remain manual.'})
                if cr['id']!=row['id']:
                    coverage.append(base|{'id':cr['id'],'kind':'creature-stat-block','textual':'complete','mechanical':'partial','limit':'Separate native Actor for this published legacy variant; conditional abilities remain manual.'})
        pages.append(page); counts[(row['part'],page['kind'])]+=1
        coverage.append(base|{'kind':page['kind'],'textual':'complete','status':'source-incomplete' if incomplete else 'partial','limit':'Full source text included under the recorded permission; mechanical coverage remains separate.'})
    dump(ROOT/'data/local/corpus.json',{'schema':1,'pages':pages,'entries':entries})
    (ROOT/'data/corpus.json.gz').write_bytes(gzip.compress(json.dumps({'schema':1,'pages':pages,'entries':entries},ensure_ascii=False).encode('utf8'),mtime=0))
    dump(ROOT/'sources/coverage.json',{'schema':1,'discoveryComplete':cat['discoveryComplete'],'entryInventoryComplete':False,'entries':coverage,'statistics':[{'part':p,'kind':k,'pages':n} for (p,k),n in sorted(counts.items())]})
    print(f'Normalized {len(pages)} pages, {len(entries)} anchor/table entries; authorized text bundle; mechanical coverage remains partial.')
if __name__=='__main__': main()
