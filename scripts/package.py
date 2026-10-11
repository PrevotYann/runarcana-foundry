"""Package a build without touching a user's Foundry installation."""
import argparse,hashlib,json,pathlib,zipfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
def main():
    p=argparse.ArgumentParser();p.add_argument('--local',action='store_true',help='Legacy local build profile');p.add_argument('--source',action='store_true',help='Code, source snapshot and build tools; excludes raw cache and compiled binaries')
    args=p.parse_args();manifest=json.loads((ROOT/'module.json').read_text(encoding='utf8'))
    if not args.source and bool(manifest['flags']['runarcana']['localContent'])!=args.local:raise SystemExit('Build profile mismatch: run npm run build with the matching --local option first.')
    validation=json.loads((ROOT/'sources/validation.json').read_text(encoding='utf8'))
    if validation['errors']:raise SystemExit('Validation errors prevent packaging.')
    dest=ROOT/'dist';dest.mkdir(exist_ok=True)
    name='runarcana-'+manifest['version']+('-local' if args.local else '')+'.zip'
    files=[ROOT/'module.json',ROOT/'README.md',ROOT/'LICENSE',ROOT/'STATE.json',ROOT/'docs/credits.md',ROOT/'docs/babele.md',ROOT/'docs/coverage.md',ROOT/'docs/rule-differences.md',ROOT/'sources/coverage.json',ROOT/'sources/validation.json',ROOT/'sources/catalog.json',ROOT/'sources/missing.json',ROOT/'sources/versions.json',ROOT/'sources/ids.json',ROOT/'sources/mechanics-reviewed.json']
    for directory in ['src','styles','lang','assets','packs','translations/templates']:
        files.extend(x for x in (ROOT/directory).rglob('*') if x.is_file() and x.name not in ['LOCK','LOG','LOG.old'])
    if args.source:
        name='runarcana-'+manifest['version']+'-source.zip'
        files=[ROOT/n for n in ['.gitignore','LICENSE','README.md','STATE.json','module.json','package.json','package-lock.json']]
        for directory in ['src','styles','lang','docs','scripts','tests','translations/templates']:
            files.extend(x for x in (ROOT/directory).rglob('*') if x.is_file() and x.suffix in ['.mjs','.py','.json','.css','.md','.txt'])
        files.extend((ROOT/'sources').glob('*.json'))
        files.append(ROOT/'data/corpus.json.gz')
    files.append(ROOT/'sources/permissions.json')
    with zipfile.ZipFile(dest/name,'w',compression=zipfile.ZIP_DEFLATED) as archive:
        for file in sorted(set(files)):
            if file.exists():archive.write(file,'runarcana/'+file.relative_to(ROOT).as_posix())
    checksum=hashlib.sha256((dest/name).read_bytes()).hexdigest()
    (dest/(name+'.sha256')).write_text(checksum+'  '+name+'\n',encoding='utf8')
    print(str(dest/name));print('SHA256 '+checksum)
if __name__=='__main__':main()
