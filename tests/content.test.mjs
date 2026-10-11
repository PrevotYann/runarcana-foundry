import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
test('the public build includes content in every advertised compendium',async()=>{
  const manifest=JSON.parse(await fs.readFile('module.json','utf8'));
  const index=JSON.parse(await fs.readFile('data/build-index.json','utf8'));
  assert.equal(index.profile,'authorized-content');
  for(const pack of manifest.packs)assert.ok(index.documents.some(d=>d.pack===pack.name),`Empty public compendium: ${pack.name}`);
  const references=index.documents.filter(d=>d.pack==='references');
  const sample=JSON.parse(await fs.readFile(`packs-src/release/references/${references[0].id}.json`,'utf8'));
  assert.ok(sample.pages.some(p=>p.text.content.length>600),'Source journals must contain full text.');
  assert.ok(!JSON.stringify(sample).includes('Redistribution permission for the complete text has not been established.'));
});
