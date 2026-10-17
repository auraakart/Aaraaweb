import assert from 'node:assert/strict'
import {parseSocietyBrandRevisions,planBrandRestore} from '../lib/admin-society-brand-editor.ts'

const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']
const logoId='AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'
const records=parseSocietyBrandRevisions([
  {id:ids[0],version:1,publishedAt:'2026-10-10T10:00:00Z',config:{
    displayName:'Lake Society',logoAssetId:logoId}},
  {id:ids[1],version:2,publishedAt:'2026-10-11T10:00:00Z',config:{displayName:'New look'}},
])
assert.equal(records.find(row=>row.version===1).config.logoAssetId,logoId.toLowerCase())
const restored=planBrandRestore(records,ids[0])
assert.equal(restored.config.logoAssetId,logoId.toLowerCase())
assert.equal(restored.expectedVersion,2)
for(const bad of [
  {logoAssetId:'https://cdn.invalid/logo.png'},
  {logoAssetId:'data:image/svg+xml,<svg/>'},
  {logoAssetId:'foo'},
  {logoAssetId:logoId,logoUrl:'https://cdn.invalid/logo.png'},
  {logoAssetId:null},
  {logoAssetId:logoId,featureOverrides:{GATE:true}},
]){
  assert.throws(()=>parseSocietyBrandRevisions([{
    id:ids[0],version:1,publishedAt:null,config:bad,
  }]))
}
console.log('V5.3.14 Admin history and rollback accepts only opaque logo UUIDs: PASS')
