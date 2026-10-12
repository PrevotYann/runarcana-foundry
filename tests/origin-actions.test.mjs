import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('changed source hashes disable reviewed origin actions until their rules are reviewed',()=>{
  const script=String.raw`import sys,json,gzip
from pathlib import Path
sys.path.insert(0,'scripts')
from origins import creation,variant
pages=json.loads(gzip.decompress(Path('data/corpus.json.gz').read_bytes()))['pages']
dragon=next(p for p in pages if p['kind']=='origin' and p['title']=='Half-Dragon')
section=next(s for s in dragon['sections'] if s['anchor']=='glacial-elemental')
assert len(variant(dragon,section,'uuid')['actions'])==1
dragon['sha256']='changed'
profile=variant(dragon,section,'uuid')
assert not profile.get('actions') and profile['actionsReviewRequired']
vastaya=next(p for p in pages if p['kind']=='origin' and p['title']=='Vastaya')
assert len(creation(vastaya,[])['actions'])==1
vastaya['sha256']='changed'
profile=creation(vastaya,[])
assert not profile.get('actions') and profile['actionsReviewRequired']
`;
  const result=spawnSync('python',['-c',script],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});
