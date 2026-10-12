import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
  parseSocietyLogoAssets,parseSocietyLogoUploadIntent,validateSocietyLogoFile,
} from '../lib/admin-society-logo.ts'

const id='11111111-1111-4111-8111-111111111111'
const good={id,status:'PENDING',contentType:'image/png',contentLengthBytes:200,
  sha256:null,createdAt:'2026-10-12T18:30:00.000Z',verifiedAt:null}
const verified={...good,status:'VERIFIED',sha256:'a'.repeat(64),
  verifiedAt:'2026-10-12T18:31:00.000Z'}

assert.deepEqual(parseSocietyLogoAssets([good,verified]),[good,verified])
assert.deepEqual(validateSocietyLogoFile({type:'image/png',size:200}),
  {contentType:'image/png',contentLengthBytes:200})

for(const file of [
  {type:'image/svg+xml',size:200},{type:'image/jpeg',size:200},
  {type:'image/png',size:0},{type:'image/png',size:524289},
  {type:'image/png',size:1.4},
])assert.throws(()=>validateSocietyLogoFile(file))

for(const bad of [
  [{...good,storageKey:'societies/other/secret.png'}],
  [{...good,publicUrl:'https://cdn.invalid/logo.png'}],
  [{...good,status:'VERIFIED'}],
  [{...good,sha256:'a'.repeat(64)}],
  [{...verified,verifiedAt:null}],
  [{...good,id:'other-society'}],
  [{...good,contentType:'text/html'}],
  {assets:[good]},
])assert.throws(()=>parseSocietyLogoAssets(bad))

const expiresAt=new Date(Date.now()+5*60*1000).toISOString()
const create=(url)=>({asset:good,upload:{method:'PUT',url,
  headers:{'Content-Type':'image/png'},expiresAt}})
assert.equal(parseSocietyLogoUploadIntent(create('https://private.example.test/signed?x=1')).upload.method,'PUT')
for(const bad of [
  create('javascript:alert(1)'),create('http://private.example.test/signed'),
  create('https://user:password@private.example.test/signed'),
  create('https://private.example.test/signed#fragment'),
  {...create('https://private.example.test/signed'),upload:{method:'GET',url:'https://private.example.test/signed',
    headers:{'Content-Type':'image/png'},expiresAt}},
  {...create('https://private.example.test/signed'),upload:{method:'PUT',url:'https://private.example.test/signed',
    headers:{Authorization:'Bearer stolen'},expiresAt}},
  {...create('https://private.example.test/signed'),upload:{method:'PUT',url:'https://private.example.test/signed',
    headers:{'Content-Type':'image/png'},expiresAt:'2020-01-01T00:00:00Z'}},
])assert.throws(()=>parseSocietyLogoUploadIntent(bad))

const ui=readFileSync(new URL('../app/admin-society-logo-quarantine.tsx',import.meta.url),'utf8')
const editor=readFileSync(new URL('../app/admin-society-brand-editor.tsx',import.meta.url),'utf8')
for(const token of [
  '/branding/manage/logos','/branding/manage/logos/uploads','/confirm',
  'validateSocietyLogoFile','parseSocietyLogoUploadIntent',
  "credentials:'omit'","redirect:'error'","referrerPolicy:'no-referrer'",
  'body:file','uploaded privately','never shown to residents',
])assert.ok(ui.includes(token),'Missing logo quarantine guard: '+token)
assert.ok(editor.includes('<AdminSocietyLogoQuarantine key={session.societyId} session={session}/>'))
assert.ok(!ui.includes('dangerouslySetInnerHTML'))
assert.ok(!ui.includes('<img'))
assert.ok(!editor.includes('logoAssetId'))
console.log('V5.3.13 private Admin PNG upload, guarded signed PUT and quarantine metadata: PASS')
