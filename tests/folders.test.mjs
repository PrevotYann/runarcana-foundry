import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {folderErrors} from '../scripts/pack-validation.mjs';

test('the startup folder validator rejects missing, empty and whitespace names',()=>{
  for(const name of [undefined,null,'',' \t ']) {
    const errors=folderErrors({_id:'bdc0edd96ebbe434',name,type:'JournalEntry'},'JournalEntry');
    assert.ok(errors.some(e=>e.includes('Folder name is required')));
  }
  assert.deepEqual(folderErrors({_id:'bdc0edd96ebbe434',name:'Introduction',type:'JournalEntry'},'JournalEntry'),[]);
});

test('the public generator preserves the home folder ID and gives it a valid name',async()=>{
  // Run in a temporary workspace so this also tests the cache-free release build.
  const script=String.raw`import tempfile,pathlib,json,shutil,subprocess,sys
root=pathlib.Path.cwd()
with tempfile.TemporaryDirectory(prefix='runarcana-folders-') as temp:
    target=pathlib.Path(temp)
    shutil.copytree(root/'scripts',target/'scripts',ignore=shutil.ignore_patterns('__pycache__'))
    shutil.copytree(root/'sources',target/'sources',ignore=shutil.ignore_patterns('cache','technical'))
    shutil.copy2(root/'package.json',target/'package.json')
    subprocess.run([sys.executable,str(target/'scripts/generate.py'),'--references'],cwd=target,check=True,stdout=subprocess.DEVNULL)
    folder=json.loads((target/'packs-src/release/references/bdc0edd96ebbe434.json').read_text(encoding='utf8'))
    print(json.dumps(folder))`;
  const result=spawnSync('python',['-c',script],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const folder=JSON.parse(result.stdout);
  assert.equal(folder._id,'bdc0edd96ebbe434');assert.equal(folder.name,'Introduction');
  assert.deepEqual(folderErrors(folder,'JournalEntry'),[]);
});
