import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {draftBrandConfig,parseSocietyBrandRevisions,planBrandRestore} from '../lib/admin-society-brand-editor.ts'

const good=draftBrandConfig(' Lake View ', '#155e75', '#164e63', ' Help@Example.com ', ' +919876543210 ')
assert.deepEqual(good,{displayName:'Lake View',colors:{primary:'#155E75',primaryDeep:'#164E63'},
  support:{email:'help@example.com',phone:'+919876543210'}})
assert.deepEqual(draftBrandConfig('No contact','#155E75','#164E63'),{
  displayName:'No contact',colors:{primary:'#155E75',primaryDeep:'#164E63'}})
for(const bad of ['javascript:alert(1)','contact','root@example.com\nBcc:bad@example.com']){
  assert.throws(()=>draftBrandConfig('Name','#155E75','#164E63',bad))
}
for(const bad of ['9876543210','+00012345678','+91<script>']){
  assert.throws(()=>draftBrandConfig('Name','#155E75','#164E63','',bad))
}
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']
const records=parseSocietyBrandRevisions([
  {id:ids[0],version:1,publishedAt:'2026-10-10T12:00:00Z',config:good},
  {id:ids[1],version:2,publishedAt:'2026-10-11T12:00:00Z',config:{displayName:'New'}},
])
const restore=planBrandRestore(records,ids[0])
assert.deepEqual(restore.config,good)
restore.config.support.email='changed@example.com'
assert.equal(records.find(x=>x.id===ids[0]).config.support.email,'help@example.com')
for(const unsafe of [
  {support:{email:'help@example.com',url:'https://example.com'}},
  {support:{phone:'1234567890'}},
  {support:{email:'evil<script>@example.com'}},
]){
  assert.throws(()=>parseSocietyBrandRevisions([{
    id:ids[0],version:1,publishedAt:null,config:{displayName:'X',...unsafe},
  }]))
}
const ui=readFileSync(new URL('../app/admin-society-brand-editor.tsx',import.meta.url),'utf8')
for(const text of ['Support email (optional)','Support phone (optional)','setSupportEmail','setSupportPhone','draftBrandConfig(name,primary,primaryDeep,supportEmail,supportPhone)','item.config.support']){
  assert.ok(ui.includes(text),'Missing safe support editor wire: '+text)
}
console.log('V5.3.11 published society contacts, Admin editor and rollback: PASS')
