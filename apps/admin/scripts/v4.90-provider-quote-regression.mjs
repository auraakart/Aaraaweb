import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseExtraWorkRupees, preserveQuoteRetryIdentity, purgeProviderQuoteDraftsForSession, removeProviderQuoteDraft, restoreProviderQuoteDrafts, saveProviderQuoteDraft } from '../lib/extra-work-quote.ts';

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


const bucket=new Map();
const browserTab={
  get length(){return bucket.size;},
  key(i){return [...bucket.keys()][i]??null;},
  getItem(key){return bucket.get(key)??null;},
  setItem(key,value){bucket.set(key,value);},
  removeItem(key){bucket.delete(key);},
};
const booking='11111111-1111-4111-8111-111111111111';
const active=new Set([booking]);
saveProviderQuoteDraft(browserTab,'session-1','provider-1',booking,first,1000);
const recovered=restoreProviderQuoteDrafts(browserTab,'session-1','provider-1',active,1001);
assert.deepEqual(recovered[booking],first,'Reload must retain exact economic details and key');
assert.deepEqual(restoreProviderQuoteDrafts(browserTab,'session-2','provider-1',active,1001),{});
assert.deepEqual(restoreProviderQuoteDrafts(browserTab,'session-1','provider-2',active,1001),{});
assert.equal(Object.keys(restoreProviderQuoteDrafts(browserTab,'session-1','provider-1',new Set(),1001)).length,0,
  'Closed jobs must not retain retryable drafts');
assert.equal(bucket.size,0);
saveProviderQuoteDraft(browserTab,'session-1','provider-1',booking,first,1000);
assert.deepEqual(restoreProviderQuoteDrafts(browserTab,'session-1','provider-1',active,1000+24*60*60*1000+1),{},
  'Expired drafts must be rejected and removed');
assert.equal(bucket.size,0);
assert.throws(()=>saveProviderQuoteDraft(browserTab,'session-1','provider-1',booking,
  {...first,amountPaise:1.2},1000));
saveProviderQuoteDraft(browserTab,'session-1','provider-1',booking,first,1000);
saveProviderQuoteDraft(browserTab,'session-2','provider-1',booking,first,1000);
purgeProviderQuoteDraftsForSession(browserTab,'session-1');
assert.deepEqual(restoreProviderQuoteDrafts(browserTab,'session-1','provider-1',active,1001),{});
assert.deepEqual(restoreProviderQuoteDrafts(browserTab,'session-2','provider-1',active,1001)[booking],first);
removeProviderQuoteDraft(browserTab,'session-2','provider-1',booking);
assert.equal(bucket.size,0);

const source=readFileSync(new URL('../app/provider/page.tsx',import.meta.url),'utf8');
for(const marker of ['Propose extra work quote','Retry saved quote','Review quote decisions',
  'Discard local draft','/extra-work-quotes','crypto.randomUUID()','preserveQuoteRetryIdentity',
  'No payment or original-price change occurs on approval.','restoreProviderQuoteDrafts',
  'saveProviderQuoteDraft','purgeProviderQuoteDraftsForSession','removeProviderQuoteDraft']){
  assert.ok(source.includes(marker),`Missing provider quotation affordance: ${marker}`);
}
console.log('V4.90.18.3 provider extra work quote input and retry acceptance passed');
