import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {draftBrandConfig,selectVerifiedLogoForDraft} from '../lib/admin-society-brand-editor.ts'
import {parseSocietyLogoAssets} from '../lib/admin-society-logo.ts'

const id='44444444-4444-4444-8444-444444444444'
const verified={id,status:'VERIFIED',contentType:'image/png',contentLengthBytes:250,
  sha256:'a'.repeat(64),createdAt:'2026-10-12T18:30:00Z',verifiedAt:'2026-10-12T18:40:00Z'}
const pending={...verified,id:'55555555-5555-4555-8555-555555555555',
  status:'PENDING',sha256:null,verifiedAt:null}
const assets=parseSocietyLogoAssets([verified,pending])
const original=draftBrandConfig('Lakeview','#155E75','#164E63')
assert.deepEqual(selectVerifiedLogoForDraft(original,'',assets),original)
const selected=selectVerifiedLogoForDraft(original,id,assets)
assert.deepEqual(selected,{...original,logoAssetId:id})
assert.ok(!('logoAssetId' in original),'Original draft may not be mutated')
for(const unsafe of [
  'javascript:alert(1)','https://example.com/evil.png','../logo.png',
  '22222222-2222-4222-8222-222222222222',pending.id,
])assert.throws(()=>selectVerifiedLogoForDraft(original,unsafe,assets))
assert.throws(()=>selectVerifiedLogoForDraft(original,id,[]))

const editor=readFileSync(new URL('../app/admin-society-brand-editor.tsx',import.meta.url),'utf8')
const panel=readFileSync(new URL('../app/admin-society-logo-quarantine.tsx',import.meta.url),'utf8')
const preview=readFileSync(new URL('../app/admin-published-society-logo.tsx',import.meta.url),'utf8')
for(const expected of [
  'selectVerifiedLogoForDraft','verifiedLogos','selectedLogoId',
  'onAssetsChanged={onLogoAssetsChanged}','AdminPublishedSocietyLogo',
  'setSelectedLogoId(item.config.logoAssetId',
  'Only VERIFIED private images',
])assert.ok(editor.includes(expected),'Missing safe selected-logo editor: '+expected)
assert.ok(panel.includes('onAssetsChanged?.(valid)'), 'Existing quarantine panel should notify verified assets')
for(const expected of [
  '/api/v1/context/logo',"credentials:'omit'","cache:'no-store'",
  "redirect:'error'","referrerPolicy:'no-referrer'",
  "Accept:'image/png'","Authorization:'Bearer '+session.accessToken",
  "response.headers.get('content-type')","maxBytes",
  'URL.createObjectURL','URL.revokeObjectURL','controller.abort()',
  'session.societyId','session.sessionId','session.accessToken',
])assert.ok(preview.includes(expected),'Missing authenticated logo display guard: '+expected)
assert.ok(!preview.includes('localStorage'))
assert.ok(!preview.includes('sessionStorage'))
assert.ok(!preview.includes('dangerouslySetInnerHTML'))
assert.ok(!preview.includes('cdn.'))
console.log('V5.3.16 verified society-logo brand revision selection and authenticated Admin preview: PASS')
