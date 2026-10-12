import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parseSocietyBrandRevisions,currentPublishedBrand,draftBrandConfig} from '../lib/admin-society-brand-editor.ts'
import {parseAdminSocietyBrand} from '../lib/admin-society-brand.ts'
const a='11111111-1111-4111-8111-111111111111'
const b='22222222-2222-4222-8222-222222222222'
const c='33333333-3333-4333-8333-333333333333'
const item=(id,version,publishedAt,config={displayName:'Courtyard',colors:{primary:'#155E75',primaryDeep:'#164E63'}})=>({id,version,publishedAt,config})
const input=[item(b,2,null),item(a,1,'2026-10-10T10:00:00.000Z'),item(c,3,'2026-10-11T10:00:00.000Z')]
const rows=parseSocietyBrandRevisions(input)
assert.deepEqual(rows.map(r=>r.version),[3,2,1])
assert.equal(currentPublishedBrand(rows)?.version,3)
assert.equal(currentPublishedBrand(parseSocietyBrandRevisions([item(c,3,null),item(a,1,'2026-10-10T10:00:00.000Z'),item(b,2,'2026-10-11T10:00:00.000Z')]))?.version,2)
assert.equal(currentPublishedBrand([item(a,1,null)]),null)
assert.deepEqual(draftBrandConfig('  Courtyard  ','#155e75','#164e63'),{displayName:'Courtyard',colors:{primary:'#155E75',primaryDeep:'#164E63'}})
for(const invalid of ['', '<script>', 'X'.repeat(81),'X\nY'])assert.throws(()=>draftBrandConfig(invalid,'#155E75','#164E63'))
for(const invalid of ['red','#GGGGGG','#155E75; color:red'])assert.throws(()=>draftBrandConfig('Courtyard',invalid,'#164E63'))
assert.throws(()=>parseSocietyBrandRevisions({revisions:input}))
assert.throws(()=>parseSocietyBrandRevisions([item(a,0,null)]))
assert.throws(()=>parseSocietyBrandRevisions([item('not-a-uuid',1,null)]))
assert.throws(()=>parseSocietyBrandRevisions([item(a,1,null,{displayName:'ok',features:['BILLING']})]))
assert.throws(()=>parseSocietyBrandRevisions([item(a,1,null,{colors:{primary:'#155E75',primaryDeep:'javascript:evil'}})]))
const draft=draftBrandConfig('Society A','#155E75','#164E63')
assert.ok(parseAdminSocietyBrand({society:{id:a},branding:{schemaVersion:1,revision:'preview',brand:{id:'aaraagate',...draft}}},a))
assert.equal(parseAdminSocietyBrand({society:{id:a},branding:{schemaVersion:1,revision:'preview',brand:{id:'aaraagate',...draft}}},b),null)
assert.equal(parseAdminSocietyBrand({society:{id:a},branding:{schemaVersion:1,revision:'preview',brand:{id:'aaraagate',displayName:'Light palette',colors:{primary:'#FFFFFF',primaryDeep:'#164E63'}}}},a)?.onPrimaryDeep,'#FFFFFF')
const editor=readFileSync(new URL('../app/admin-society-brand-editor.tsx',import.meta.url),'utf8')
const access=readFileSync(new URL('../lib/admin-access.ts',import.meta.url),'utf8')
const consoleSource=readFileSync(new URL('../app/admin-console.tsx',import.meta.url),'utf8')
for(const token of ['/branding/manage/revisions','/branding/manage/drafts','expectedVersion:latestVersion','expectedPublishedVersion:published?.version??0','operatorConfirm','parseAdminSocietyBrand','key={brandIdentity}','onPublished()'])assert.ok((editor+consoleSource).includes(token),'Missing editor safety requirement: '+token)
assert.match(access,/SOCIETY_ADMIN: \[[^\n]+branding/)
assert.match(access,/SUPER_ADMIN: \[[^\n]+branding/)
assert.doesNotMatch(access,/ACCOUNTANT: \[[^\n]+branding/)
assert.doesNotMatch(access,/AUDITOR: \[[^\n]+branding/)
assert.ok(!editor.includes('dangerouslySetInnerHTML'))
console.log('V5.3.7 Admin brand editor contract and isolation: PASS')
