"""Resumable, single-worker official wiki crawler. Cache enables entirely offline builds."""
import argparse, hashlib, json, pathlib, re, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone
from bs4 import BeautifulSoup

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = 'https://wiki.runarcana.org'
CACHE = ROOT / 'sources/cache'
CATALOG = ROOT / 'sources/catalog.json'
def canonical(url, parent=BASE + '/en/'):
    u = urllib.parse.urlsplit(urllib.parse.urljoin(parent, url))
    if u.hostname != 'wiki.runarcana.org' or not u.path.startswith('/en/'):
        return None
    path = re.sub(r'/index\.html$', '/', u.path)
    if not pathlib.PurePosixPath(path).suffix and not path.endswith('/'):
        path += '/'
    if pathlib.PurePosixPath(path).suffix:
        return None
    return BASE + path
def part(url):
    path = urllib.parse.urlsplit(url).path
    return next((v for k,v in [('characters',1),('rules',2),('magic',2),('game-mastering',3),('monsters-and-creatures',4)] if f'/{k}/' in path), 0)
def stamp(): return datetime.now(timezone.utc).isoformat()
def save(catalog):
    CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding='utf8')
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--export', type=pathlib.Path, help='Directory containing mirrored en/.../index.html')
    parser.add_argument('--refresh', action='store_true')
    parser.add_argument('--limit', type=int, default=0)
    parser.add_argument('--delay', type=float, default=2.0)
    parser.add_argument('--offline', action='store_true', help='Discover cached links only, without network')
    parser.add_argument('--priority-core',action='store_true',help='Collect rule and inventory pages before individual spell/creature entries')
    args = parser.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    catalog = json.loads(CATALOG.read_text(encoding='utf8')) if CATALOG.exists() else {'schema':1,'collectedAt':stamp(),'discoveryComplete':False,'pages':[],'external':[]}
    known = {x['url']:x for x in catalog['pages']}
    queue = list(dict.fromkeys([BASE+'/en/',BASE+'/en/content-map/',BASE+'/en/licensing/'] + list(known)))
    # sitemap supplements menus/search records; it is never treated as a closed list.
    if not args.export and not args.offline:
        try:
            sitemap = urllib.request.urlopen(BASE+'/sitemap.xml',timeout=30).read().decode()
            for u in re.findall(r'<loc>(.*?)</loc>', sitemap):
                c = canonical(u)
                if c and c not in queue: queue.append(c)
        except Exception as e: catalog['sitemapError']=str(e)
    for url in queue:
        known.setdefault(url,{'id':urllib.parse.urlsplit(url).path,'url':url,'part':part(url),'language':'en','anchors':[],'status':'pending'})
    if args.priority_core:
        queue.sort(key=lambda u:(0 if known[u]['status']=='collected' else 2 if '/magic/spells/' in u and not u.endswith('/spells/') or '/creatures/' in u else 1,len(u),u))
    done = set(); fetched = 0
    while queue:
        url = queue.pop(0)
        if url in done: continue
        done.add(url)
        key = hashlib.sha256(url.encode()).hexdigest()
        file = CACHE / (key+'.html')
        row = known.get(url, {'id':urllib.parse.urlsplit(url).path,'url':url,'part':part(url),'language':'en','anchors':[]})
        known[url] = row
        try:
            if args.export:
                local = args.export / urllib.parse.urlsplit(url).path.lstrip('/') / 'index.html'
                if local.exists(): file.write_bytes(local.read_bytes())
                elif not file.exists(): raise FileNotFoundError(str(local))
            if not file.exists() or args.refresh:
                if args.offline: raise FileNotFoundError('Not present in local source cache')
                time.sleep(args.delay)
                req = urllib.request.Request(url, headers={'User-Agent':'RunarcanaFoundrySourceCollector/0.1 (single worker; cached)'})
                with urllib.request.urlopen(req,timeout=30) as response:
                    file.write_bytes(response.read())
                    row['resolvedUrl'] = response.url
                row['collectedAt']=stamp(); fetched += 1
                catalog['rateLimited']=False
            body=file.read_bytes(); soup=BeautifulSoup(body,'html.parser')
            article=soup.select_one('main article') or soup.select_one('main')
            if not article: raise ValueError('No main article; response is not a rules page')
            row.update(status='collected',sha256=hashlib.sha256(body).hexdigest(),cache=str(file.relative_to(ROOT)).replace('\\','/'))
            row.setdefault('collectedAt',datetime.fromtimestamp(file.stat().st_mtime,timezone.utc).isoformat())
            row['title'] = article.h1.get_text(' ',strip=True) if article.h1 else soup.title.get_text(' ',strip=True)
            row['anchors']=[{'id':h.get('id'),'title':h.get_text(' ',strip=True),'level':int(h.name[1])} for h in article.select('h2[id],h3[id],h4[id],h5[id],h6[id]')]
            text=soup.get_text(' ',strip=True)
            row['rulesVersion']=(re.search(r'Version\s+(0\.\d+)',text) or [None,None])[1]
            row['wikiBuild']=(re.search(r'Wiki Build\s+([\d.]+)',text) or [None,None])[1]
            links=[a.get('href') for a in soup.select('a[href]')]
            for script in soup.select('script[type="application/json"]'):
                try:
                    d=json.loads(script.string or script.get_text())
                    def walk(v):
                        if isinstance(v,dict):
                            for k,x in v.items():
                                if k in ('url','href','link') and isinstance(x,str): links.append(x)
                                else: walk(x)
                        elif isinstance(v,list):
                            for x in v: walk(x)
                    walk(d)
                except (ValueError,TypeError): pass
            for link in links:
                c=canonical(link,url)
                if c and c not in done and c not in queue:
                    queue.append(c)
                    known.setdefault(c,{'id':urllib.parse.urlsplit(c).path,'url':c,'part':part(c),'language':'en','anchors':[],'status':'pending'})
                elif link and link.startswith('http') and 'runarcana' in link and not c and link not in catalog['external']:
                    catalog['external'].append(link)
            row.pop('error',None)
        except urllib.error.HTTPError as e:
            row.update(status='source-unavailable',error=str(e),attemptedAt=stamp())
            if e.code in (429,503):
                catalog['retryAfter']=e.headers.get('Retry-After')
                catalog['pages']=sorted(known.values(),key=lambda x:x['url'])
                catalog.update(discoveryComplete=False,pending=len(queue)+1,collectedAt=stamp(),rateLimited=True)
                save(catalog)
                print('Server rate limit: saved checkpoint and stopped. Retry later with --delay 12 or import a local export.',flush=True)
                return
        except Exception as e:
            if args.offline and isinstance(e,FileNotFoundError):
                row.update(cacheAvailable=False)
                if row.get('status')=='pending' or row.get('error')=='Not present in local source cache':
                    row.update(status='pending');row.pop('error',None)
            else:row.update(status='source-unavailable',error=str(e),attemptedAt=stamp())
        catalog['pages']=sorted(known.values(),key=lambda x:x['url'])
        catalog.update(discoveryComplete=not queue and all(x['status']=='collected' for x in known.values()), pending=len(queue), collectedAt=stamp())
        save(catalog)
        if len(done)%25==0: print(f'{len(done)} pages visited; {len(queue)} pending; {fetched} fetched',flush=True)
        if args.limit and len(done)>=args.limit: break
    save(catalog)
    print(f'Finished: {len(known)} pages, discoveryComplete={catalog["discoveryComplete"]}',flush=True)
if __name__=='__main__': main()
