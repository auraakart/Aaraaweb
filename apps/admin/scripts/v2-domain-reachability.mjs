import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {dirname,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const read=(path)=>readFileSync(resolve(root,path),'utf8')
const shortcuts=read('app/admin-shortcuts.tsx')
const documents=read('app/documents/page.tsx')
const privacy=read('app/privacy-operations/page.tsx')
const vendors=read('app/society-vendors/page.tsx')

assert.match(shortcuts,/href:'\/documents'/,'Documents must be reachable from Admin shortcuts')
assert.match(shortcuts,/href:'\/privacy-operations'/,'Privacy operations must be reachable from Admin shortcuts')
assert.match(shortcuts,/href:'\/society-vendors'/,'Society vendors must be reachable from Admin shortcuts')
assert.match(documents,/readRoles=new Set\(\['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','FACILITY_MANAGER','ACCOUNTANT','AUDITOR'\]\)/,'Document read roles must mirror DOCUMENTS_READ')
assert.match(documents,/manageRoles=new Set\(\['SUPER_ADMIN','SOCIETY_ADMIN'\]\)/,'Document mutation UI must mirror DOCUMENTS_MANAGE')
assert.match(documents,/\/documents\/management\/upload-intent/,'Document upload must start with a server-authorized upload intent')
assert.match(documents,/\/documents\/management\/\$\{id\}\/download-intent/,'Document download must use a server-authorized download intent')
assert.match(documents,/accept="application\/pdf,image\/jpeg,image\/png,image\/webp"/,'Document UI must constrain supported upload formats')
assert.match(privacy,/readRoles=new Set\(\['SUPER_ADMIN','SOCIETY_ADMIN','AUDITOR'\]\)/,'Privacy read UI must mirror privacy-read roles')
assert.match(privacy,/canManage=s\?\.role==='SUPER_ADMIN'/,'Privacy mutation UI must remain platform-only')
assert.doesNotMatch(privacy,/canManage=.*SOCIETY_ADMIN/,'Society Admin must not gain privacy mutation UI')
assert.match(vendors,/readRoles=new Set\(\['SUPER_ADMIN','SOCIETY_ADMIN','COMMITTEE_MEMBER','FACILITY_MANAGER','AUDITOR'\]\)/,'Vendor read UI must mirror society-vendor read roles')
assert.match(vendors,/manageRoles=new Set\(\['SUPER_ADMIN','SOCIETY_ADMIN','FACILITY_MANAGER'\]\)/,'Vendor mutation UI must mirror society-vendor manage roles')
assert.doesNotMatch(vendors,/manageRoles=new Set\([^\n]*AUDITOR/,'Auditor must never gain vendor mutation UI')
console.log('V2 Admin domain reachability checks passed')
