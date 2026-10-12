import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {currentPublishedBrand,parseSocietyBrandRevisions} from '../lib/admin-society-brand-editor.ts'
const uuidA='11111111-1111-4111-8111-111111111111'
const uuidB='22222222-2222-4222-8222-222222222222'
const row=(id,version,publishedAt)=>({
  id,version,publishedAt,
  config:{displayName:'Courtyard',colors:{primary:'#155E75',primaryDeep:'#164E63'}},
})
const revisions=parseSocietyBrandRevisions([
  row(uuidA,1,'2026-10-11T00:00:00Z'),row(uuidB,2,'2026-10-12T00:00:00Z'),
])
assert.equal(currentPublishedBrand(revisions).version,2)
assert.equal(revisions[1].publishedAt!==null,true)
const editor=readFileSync(new URL('../app/admin-society-brand-editor.tsx',import.meta.url),'utf8')
const controller=readFileSync(new URL('../../../services/api/src/branding/branding.controller.ts',import.meta.url),'utf8')
const service=readFileSync(new URL('../../../services/api/src/branding/branding.service.ts',import.meta.url),'utf8')
for(const token of [
  "operatorConfirm('Restore the appearance of version",
  "expectedVersion:latestVersion,expectedPublishedVersion:published.version",
  "'/branding/manage/revisions/'+encodeURIComponent(item.id)+'/restore'",
  'onPublished()',
  'Restore as new revision',
])assert.ok(editor.includes(token),'Missing version-safe editor restore requirement: '+token)
assert.ok(controller.includes("@Post('revisions/:revisionId/restore')"))
assert.ok(controller.includes('AppPermission.SOCIETY_CONFIGURATION_MANAGE'))
assert.ok(controller.includes('BearerGuard, TenantGuard, PermissionsGuard'))
assert.ok(service.includes('await this.lockSociety(societyId, tx)'))
assert.ok(service.includes('async restorePublished('))
assert.ok(service.includes('where: { societyId, id: sourceRevisionId, publishedAt: { not: null } }'))
assert.ok(service.includes('version: input.expectedVersion + 1'))
assert.ok(!editor.includes('dangerouslySetInnerHTML'))
console.log('V5.3.8 atomic, society-scoped brand rollback Admin contract: PASS')
