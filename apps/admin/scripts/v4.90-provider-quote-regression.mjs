import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseExtraWorkRupees, preserveQuoteRetryIdentity } from '../lib/extra-work-quote.ts';

assert.equal(parseExtraWorkRupees('125'),12500);
assert.equal(parseExtraWorkRupees('125.5'),12550);
assert.equal(parseExtraWorkRupees('0.01'),1);
assert.equal(parseExtraWorkRupees('1000000'),100000000);
for(const raw of ['0','-1','1.234','2e3','1000000.01','Infinity','nan','1,000']) {
  assert.equal(parseExtraWorkRupees(raw),null,`Unsafe rupee input: ${raw}`);
}
let generated=0;
const create=()=>{generated++;return 'stable-key-123'};
const first=preserveQuoteRetryIdentity(undefined,'Replace damaged valve',12500,create);
const retry=preserveQuoteRetryIdentity(first,'Changed draft after failure',99999,create);
assert.equal(first,retry);
assert.equal(generated,1);

const source=readFileSync(new URL('../app/provider/page.tsx',import.meta.url),'utf8');
for(const marker of ['Propose extra work quote','Retry saved quote','Review quote decisions',
  'Discard local draft','/extra-work-quotes','crypto.randomUUID()','preserveQuoteRetryIdentity',
  'No payment or original-price change occurs on approval.']){
  assert.ok(source.includes(marker),`Missing provider quotation affordance: ${marker}`);
}
console.log('V4.90.18.3 provider extra work quote input and retry acceptance passed');
