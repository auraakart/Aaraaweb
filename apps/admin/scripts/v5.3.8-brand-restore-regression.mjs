import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parseSocietyBrandRevisions,planBrandRestore,currentPublishedBrand} from '../lib/admin-society-brand-editor.ts'
const id1='11111111-1111-4111-8111-111111111111'
const id2='22222222-2222-4222-8222-222222222222'
const id3='33333333-3333-4333-8333-333333333333'
const old={displayName:'Previous brand',colors:{primary:'#155E75',primaryDeep:'#164E63'}}
const current={displayName:'Current brand',colors:{primary:'#155E75',primaryDeep:'#155E75'}}
const rows=parseSocietyBrandRevisions([
  {id:id1,version:1,publishedAt:'2026-10-10T12:00:00Z',config:old},
  {id:id2,version:2,publishedAt:'2026-10-11T12:00:00Z',config:current},
  {id:id3,version:3,publishedAt:null,config:{displayName:'Unpublished version'}},
])
assert.equal(currentPublishedBrand(rows)?.version,2)
const plan=planBrandRestore(rows,id1)
assert.deepEqual(plan,{expectedVersion:3,expectedPublishedVersion:2,config:old})
plan.config.colors.primary='#000000'
assert.equal(old.colors.primary,'#155E75','Historical config must be copied, not mutated')
for(const bad of [id2,id3,'44444444-4444-4444-8444-444444444444']) {
  assert.throws(()=>planBrandRestore(rows,bad))
}
assert.throws(()=>planBrandRestore(parseSocietyBrandRevisions([
  {id:id1,version:1,publishedAt:null,config:{displayName:'Not yet published'}},
]),id1))
const partial=parseSocietyBrandRevisions([
  {id:id1,version:1,publishedAt:'2026-10-10T12:00:00Z',config:{displayName:'Former name'}},
  {id:id2,version:2,publishedAt:'2026-10-11T12:00:00Z',config:current},
])
assert.deepEqual(planBrandRestore(partial,id1).config,{displayName:'Former name'})
const editor=readFileSync(new URL('../app/admin-society-brand-editor.tsx',import.meta.url),'utf8')
for(const token of ['planBrandRestore(revisions,item.id)','operatorConfirm','expectedVersion:plan.expectedVersion','expectedPublishedVersion:plan.expectedPublishedVersion','savedDraftId=draft.id','onPublished()','item.publishedAt&&published&&item.version<published.version']) {
  assert.ok(editor.includes(token),'Missing version-safe restore step: '+token)
}
assert.ok(!editor.includes('method:\'PATCH\''),'A published version must never be rewritten')
console.log('V5.3.8 prior published brand restore and immutable revision regression: PASS')
