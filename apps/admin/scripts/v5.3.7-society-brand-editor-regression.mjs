import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {build} from 'esbuild'

const root=resolve(import.meta.dirname,'..')
const compiled=await build({
  entryPoints:[resolve(root,'lib/admin-brand-editor-model.ts')],
  bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent',
})
const encoded=Buffer.from(compiled.outputFiles[0].text).toString('base64')
const {parseBrandHistory,brandHistoryVersions,prepareBrandDraft,isBrandConflict}=
  await import(`data:text/javascript;base64,${encoded}`)
const uuid1='11111111-1111-4111-8111-111111111111'
const uuid2='22222222-2222-4222-8222-222222222222'
const societyId='33333333-3333-4333-8333-333333333333'
const rows=[
  {id:uuid1,version:1,config:{displayName:'Courtyard',colors:{primary:'#155e75',primaryDeep:'#164e63'}},
    publishedAt:'2026-10-12T06:00:00Z',createdAt:'2026-10-12T05:00:00Z'},
  {id:uuid2,version:2,config:{displayName:'Courtyard New'},publishedAt:null,createdAt:'2026-10-12T07:00:00Z'},
]
const parsed=parseBrandHistory(rows)
assert.deepEqual(parsed.map(x=>x.version),[2,1])
assert.deepEqual(brandHistoryVersions(parsed),{nextExpectedVersion:2,expectedPublishedVersion:1})
assert.deepEqual(brandHistoryVersions([]),{nextExpectedVersion:0,expectedPublishedVersion:0})
assert.deepEqual(parsed.find(x=>x.version===1).config.colors,{primary:'#155E75',primaryDeep:'#164E63'})
assert.throws(()=>parseBrandHistory(null),/invalid/)
assert.throws(()=>parseBrandHistory([...rows,rows[0]]),/invalid/)
assert.throws(()=>parseBrandHistory([{...rows[0],version:-2}]),/invalid/)
assert.throws(()=>parseBrandHistory([{...rows[0],id:'../../login'}]),/invalid/)
assert.throws(()=>parseBrandHistory([{...rows[0],config:{colors:{primary:'red',primaryDeep:'#164E63'}}}]),/invalid/)
const draft=prepareBrandDraft({societyId,displayName:'  Courtyard  ',primary:'#155e75',primaryDeep:'#164e63'})
assert.deepEqual(draft,{displayName:'Courtyard',colors:{primary:'#155E75',primaryDeep:'#164E63'}})
for(const badName of ['',' '.repeat(9),'abc<script>','X'.repeat(81)]){
  assert.throws(()=>prepareBrandDraft({societyId,displayName:badName,primary:'#155E75',primaryDeep:'#164E63'}))
}
for(const bad of ['#FFFFFF','#FFFF00','#155E75; background:red','red']){
  assert.throws(()=>prepareBrandDraft({societyId,displayName:'Courtyard',primary:bad,primaryDeep:'#164E63'}))
}
assert.equal(isBrandConflict(new Error('Published society branding has changed')),true)
assert.equal(isBrandConflict(new Error('Network offline')),false)
const access=readFileSync(resolve(root,'lib/admin-access.ts'),'utf8')
for(const role of ['SUPER_ADMIN','SOCIETY_ADMIN']){
  const line=access.split('\n').find(x=>x.trim().startsWith(role+':'))
  assert.ok(line?.includes("'branding'"),`Brand editor must appear for ${role}`)
}
for(const role of ['AUDITOR','COMMITTEE_MEMBER','ACCOUNTANT','SECURITY_SUPERVISOR','FACILITY_MANAGER']){
  const line=access.split('\n').find(x=>x.trim().startsWith(role+':'))
  assert.ok(line&&!line.includes("'branding'"),`No brand edit for ${role}`)
}
const consoleSource=readFileSync(resolve(root,'app/admin-console.tsx'),'utf8')
const editor=readFileSync(resolve(root,'app/society-brand-editor.tsx'),'utf8')
assert.ok(consoleSource.includes("activeView==='branding'&&<SocietyBrandEditor key={brandIdentity}"))
assert.ok(consoleSource.includes('setBrandRefresh(value=>value+1)'))
assert.ok(editor.includes("api<unknown>('/branding/manage/revisions'"))
assert.ok(editor.includes("api<DraftResponse>('/branding/manage/drafts'"))
assert.ok(editor.includes('expectedVersion:versions.nextExpectedVersion'))
assert.ok(editor.includes('expectedPublishedVersion:versions.expectedPublishedVersion'))
assert.ok(editor.includes('onPublished()'))
assert.ok(!editor.includes('dangerouslySetInnerHTML'))
const endpoint=readFileSync(resolve(root,'../../services/api/src/branding/branding.controller.ts'),'utf8')
assert.ok(endpoint.includes('@RequiresPermissions(AppPermission.SOCIETY_CONFIGURATION_MANAGE)'))
assert.ok(endpoint.includes('@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)'))
console.log('V5.3.7 editor safety, role boundaries, drafts and publish contract: PASS')
