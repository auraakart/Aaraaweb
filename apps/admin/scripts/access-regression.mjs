import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here=dirname(fileURLToPath(import.meta.url))
const root=resolve(here,'..')
const read=(path)=>readFileSync(resolve(root,path),'utf8')
const consoleSource=read('app/admin-console.tsx')
const platformSource=read('app/platform/page.tsx')
const platformProvidersSource=read('app/platform/providers/page.tsx')
const marketplaceControlSource=read('app/marketplace-control/page.tsx')
const rolesSource=read('app/roles/page.tsx')
const shortcutsSource=read('app/admin-shortcuts.tsx')

assert.match(consoleSource,/SECURITY_SUPERVISOR:\['gates','sos'\]/,'Security Supervisor must remain Gates + SOS only')
assert.match(consoleSource,/ACCOUNTANT:\['billing'\]/,'Accountant must remain billing-only in the main console')
assert.doesNotMatch(consoleSource,/SECURITY_SUPERVISOR:\[[^\]]*(billing|marketplace|residents)/,'Security Supervisor must not gain resident, marketplace or billing views')
assert.match(platformSource,/session\.role!=='SUPER_ADMIN'/,'Platform screen must fail closed for non-Super Admin sessions')
assert.match(platformProvidersSource,/s\.role!=='SUPER_ADMIN'/,'Provider verification screen must fail closed for non-Super Admin sessions')
assert.match(platformProvidersSource,/\/platform\/services\/providers/,'Provider verification screen must use platform provider API')
assert.match(marketplaceControlSource,/SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER/,'Society marketplace controls must remain limited to provider-management roles')
assert.doesNotMatch(marketplaceControlSource,/SECURITY_SUPERVISOR/,'Security Supervisor must not gain marketplace lifecycle access')
assert.match(shortcutsSource,/role==='SUPER_ADMIN'/,'Platform shortcut must be Super Admin only')
assert.match(shortcutsSource,/marketplaceRoles=new Set\(\['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER'\]\)/,'Marketplace shortcut roles must match provider-management boundary')
assert.match(rolesSource,/\['SUPER_ADMIN','SOCIETY_ADMIN'\]/,'People & Roles screen must be limited to society administration')
assert.match(rolesSource,/SECURITY_GUARD/,'Operational role screen must support guards')
assert.doesNotMatch(rolesSource,/assignableRoles=\[[^\]]*SUPER_ADMIN/,'Tenant role assignment must never expose Super Admin')
assert.doesNotMatch(rolesSource,/assignableRoles=\[[^\]]*SOCIETY_ADMIN/,'Tenant role assignment must never expose Society Admin')

console.log('Admin access regression checks passed')
