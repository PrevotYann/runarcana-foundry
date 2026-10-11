import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {ClassicLevel} from 'classic-level';
for(const archive of process.argv.slice(2)) {
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'runarcana-archive-'));
  try {
    const extraction=spawnSync('python',['-m','zipfile','-e',path.resolve(archive),temp],{encoding:'utf8'});
    assert.equal(extraction.status,0,extraction.stderr);
    const root=path.join(temp,'runarcana');
    const manifest=JSON.parse(await fs.readFile(path.join(root,'module.json'),'utf8'));
    const validation=JSON.parse(await fs.readFile(path.join(root,'sources/validation.json'),'utf8'));
    for(const pack of manifest.packs) {
      const database=new ClassicLevel(path.join(root,pack.path),{keyEncoding:'utf8',valueEncoding:'json',readOnly:true});
      await database.open();
      try {assert.equal((await database.keys().all()).length,validation.packKeys[pack.name],pack.name);}finally{await database.close();}
    }
    console.log(`${archive}: all ${manifest.packs.length} extracted LevelDB packs open and match their recorded keys.`);
  } finally {
    if(path.dirname(temp)!==path.resolve(os.tmpdir())||!path.basename(temp).startsWith('runarcana-archive-'))throw new Error('Unsafe temporary cleanup path');
    await fs.rm(temp,{recursive:true,force:true});
  }
}
