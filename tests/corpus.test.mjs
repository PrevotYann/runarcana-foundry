import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
test('every discovered page is represented in the coverage matrix, including missing sources',async()=>{
  const catalog=JSON.parse(await fs.readFile('sources/catalog.json','utf8'));
  const coverage=JSON.parse(await fs.readFile('sources/coverage.json','utf8'));
  const ids=new Set(coverage.entries.map(e=>e.id));
  for(const page of catalog.pages)assert.ok(ids.has(page.id),`Missing coverage record: ${page.id}`);
  assert.equal(typeof coverage.entryInventoryComplete,'boolean');
  if(coverage.entryInventoryComplete)assert.equal(catalog.discoveryComplete,true,'An exhaustive entry inventory needs complete source discovery.');
});
