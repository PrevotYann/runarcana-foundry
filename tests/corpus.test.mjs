import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
test('every discovered page is represented in the coverage matrix, including missing sources',async()=>{
  const catalog=JSON.parse(await fs.readFile('sources/catalog.json','utf8'));
  const coverage=JSON.parse(await fs.readFile('sources/coverage.json','utf8'));
  const ids=new Set(coverage.entries.map(e=>e.id));
  for(const page of catalog.pages)assert.ok(ids.has(page.id),`Missing coverage record: ${page.id}`);
  assert.equal(typeof coverage.entryInventoryComplete,'boolean');
  if(coverage.entryInventoryComplete)assert.equal(catalog.discoveryComplete,true,'An exhaustive entry inventory needs complete source discovery.');
});

test('every cached source has a journal and every published full spell has a native item',async()=>{
  const catalog=JSON.parse(await fs.readFile('sources/catalog.json','utf8'));
  const corpus=JSON.parse(gunzipSync(await fs.readFile('data/corpus.json.gz')).toString('utf8'));
  const index=JSON.parse(await fs.readFile('data/build-index.json','utf8'));
  const pages=new Map(corpus.pages.map(p=>[p.id,p]));
  const journals=new Set(index.documents.filter(d=>d.type==='JournalEntry').map(d=>d.sourceId));
  const spells=new Set(index.documents.filter(d=>d.pack==='spells').map(d=>d.sourceId));
  for(const row of catalog.pages.filter(p=>p.status==='collected')){
    const page=pages.get(row.id);
    assert.ok(page,`Collected source omitted from offline corpus: ${row.id}`);
    assert.equal(page.sha256,row.sha256,`Stale corpus: ${row.id}`);
    assert.ok(journals.has(`${row.id}@journal`),`Full source journal missing: ${row.id}`);
    if(page.kind==='spell'&&page.spell)assert.ok(spells.has(row.id),`Native spell missing: ${row.id}`);
  }
  if(catalog.discoveryComplete){
    for(const card of corpus.entries.filter(e=>e.kind==='spell')){
      assert.ok(pages.get(card.id)?.spell,`Catalog card lacks its full spell source: ${card.id}`);
      assert.ok(spells.has(card.id),`Catalog card lacks its native spell: ${card.id}`);
    }
  }
});
