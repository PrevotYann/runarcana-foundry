import {compilePack} from '@foundryvtt/foundryvtt-cli';
import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const local=process.argv.includes('--local');
const result=spawnSync('python',['scripts/generate.py',...(local?['--local']:[]),...(process.argv.includes('--references')?['--references']:[])],{stdio:'inherit'});
if(result.status!==0)process.exit(result.status??1);
const manifest=JSON.parse(await fs.readFile('module.json','utf8'));
const packRoot=path.resolve('packs');
for(const pack of manifest.packs) {
  const target=path.resolve(pack.path);
  if(!target.startsWith(packRoot+path.sep)||path.dirname(target)!==packRoot)throw new Error('Unsafe generated pack path');
  const stat=await fs.lstat(target).catch(()=>null);
  if(stat?.isSymbolicLink())throw new Error('Generated pack path cannot be a symbolic link');
  // A new database prevents obsolete local text remaining in unused LevelDB blocks of a reference release.
  await fs.rm(target,{recursive:true,force:true});
  await compilePack(`packs-src/${local?'local':'release'}/${pack.name}`,target,{log:false});
}
console.log(`Compiled ${manifest.packs.length} LevelDB packs.`);
