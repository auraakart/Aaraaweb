import fs from 'node:fs'

const files=[
  'apps/admin/app/finance/tax/page.tsx',
  'apps/admin/app/finance/bank-reconciliation/page.tsx',
  'apps/admin/app/finance/opening-balances/page.tsx',
  'apps/admin/app/occupancy-lifecycle/page.tsx',
  'apps/admin/app/audit/page.tsx',
  'apps/admin/app/onboarding/page.tsx',
  'apps/admin/app/governance/readiness/page.tsx',
  'apps/admin/app/society-vendors/contracts/page.tsx',
  'apps/admin/app/utilities/integrations/page.tsx',
  'apps/admin/app/emergency-operations/page.tsx',
  'apps/admin/app/platform/provider-trust/page.tsx',
  'apps/admin/app/integrations/page.tsx',
  'apps/admin/app/ai-assistant/page.tsx',
  'apps/admin/app/marketplace-control/page.tsx',
  'apps/admin/app/privacy-operations/page.tsx',
  'apps/admin/app/access-integrations/page.tsx',
  'apps/admin/app/platform/providers/page.tsx',
  'apps/admin/app/finance/procurement/page.tsx',
  'apps/admin/app/finance/waivers/page.tsx',
  'apps/admin/app/notices/metrics/page.tsx',
  'apps/admin/app/household-approvals/page.tsx',
  'apps/admin/app/finance/operations/page.tsx',
  'apps/admin/app/marketplace-control/commercial/page.tsx',
  'apps/admin/app/finance/statements/page.tsx',
  'apps/admin/app/parking/permits/page.tsx',
  'apps/admin/app/platform/privacy/page.tsx',
  'apps/admin/app/society-vendors/page.tsx',
  'apps/admin/app/facilities/health/page.tsx',
  'apps/admin/app/facilities/alerts/page.tsx',
  'apps/admin/app/facilities/inventory/page.tsx',
  'apps/admin/app/facilities/contracts/page.tsx',
  'apps/admin/app/facilities/operations/page.tsx',
  'apps/admin/app/facilities/preventive/page.tsx',
  'apps/admin/app/parking/advanced/page.tsx',
  'apps/admin/app/governance/polls/page.tsx',
  'apps/admin/app/migration/import-stager.tsx',
]

for(const file of files){
  const source=fs.readFileSync(file,'utf8')
  if(!source.includes('lib/admin-client')){
    console.error(`V4.49 contract failed: ${file} missing shared Admin client`)
    process.exit(1)
  }
  if(source.includes('async function api<T>')||source.includes('NEXT_PUBLIC_AARAGATE_API_BASE_URL')){
    console.error(`V4.49 contract failed: ${file} regressed to local API transport`)
    process.exit(1)
  }
}

const migration='apps/admin/app/migration/page.tsx'
const migrationSource=fs.readFileSync(migration,'utf8')
if(!migrationSource.includes('lib/admin-client')||migrationSource.includes('async function api<T>')){
  console.error(`V4.49 contract failed: ${migration} JSON transport is not converged`)
  process.exit(1)
}
if(!migrationSource.includes("await downloadAdminBlob('/migration/batches/'")||
   !migrationSource.includes("'/evidence.csv',session)")||
   !/\bimport\s*\{[^}]*\bdownloadAdminBlob\b/.test(migrationSource)||
   migrationSource.includes('await fetch(')){
  console.error('V4.49 contract failed: Migration evidence must use the guarded shared CSV blob transport')
  process.exit(1)
}

const reports='apps/admin/app/reports/page.tsx'
const reportsSource=fs.readFileSync(reports,'utf8')
if(!reportsSource.includes('lib/admin-client')||reportsSource.includes('async function api<T>')){
  console.error(`V4.49 contract failed: ${reports} JSON transport is not converged`)
  process.exit(1)
}
// V5.14.5 moved CSV transport into the shared session-safe client. Keep the
// historical blob/export contract, but pin the stricter login/society boundary
// rather than requiring a fetch call at a particular UI file location.
const reportsClientSource=fs.readFileSync('apps/admin/lib/admin-client.ts','utf8')
const reportCsvContract=[
  reportsSource.includes('downloadCsv'),
  reportsSource.includes('await downloadAdminBlob(path,session)'),
  /\bimport\s*\{[^}]*\bdownloadAdminBlob\b/.test(reportsSource),
  !reportsSource.includes('await fetch('),
  reportsClientSource.includes('export async function downloadAdminBlob('),
  reportsClientSource.includes("headers:{Accept:'text/csv'"),
  reportsClientSource.includes("Authorization:'Bearer '+current.accessToken"),
  reportsClientSource.includes('let active=storedFor(session)'),
  reportsClientSource.includes('storedFor(active)'),
  reportsClientSource.includes('if(response.status===401)'),
  reportsClientSource.includes('await refreshAdminSession(active)'),
  reportsClientSource.includes('if(!response.ok)throw new Error('),
  reportsClientSource.includes('const blob=await response.blob()'),
  reportsClientSource.includes('return {blob,headers:response.headers}'),
]
if(reportCsvContract.some(passed=>!passed)){
  console.error('V4.49 contract failed: Reports must use guarded shared CSV blob transport with session, refresh and response-body checks')
  process.exit(1)
}


const exportsFile='apps/admin/app/finance/exports/page.tsx'
const exportsSource=fs.readFileSync(exportsFile,'utf8')
if(!exportsSource.includes('lib/admin-client')||exportsSource.includes('async function api<T>')){
  console.error(`V4.49 contract failed: ${exportsFile} JSON transport is not converged`)
  process.exit(1)
}
if(!exportsSource.includes('/artifact')||!exportsSource.includes('await fetch(')||!exportsSource.includes('response.blob')&&!exportsSource.includes('r.blob')){
  console.error(`V4.49 contract failed: ${exportsFile} must retain explicit authenticated artifact blob transport`)
  process.exit(1)
}

const documentsFile='apps/admin/app/documents/page.tsx'
const documentsSource=fs.readFileSync(documentsFile,'utf8')
if(!documentsSource.includes('lib/admin-client')||documentsSource.includes('async function api<T>')){
  console.error(`V4.49 contract failed: ${documentsFile} JSON transport is not converged`)
  process.exit(1)
}
if(!documentsSource.includes('uploadUrl')||!documentsSource.includes('await fetch(intent.uploadUrl')){
  console.error(`V4.49 contract failed: ${documentsFile} must retain explicit signed upload transport`)
  process.exit(1)
}

const specialTransportFiles=new Set([
  'apps/admin/app/migration/page.tsx',
  'apps/admin/app/reports/page.tsx',
  'apps/admin/app/finance/exports/page.tsx',
  'apps/admin/app/documents/page.tsx',
])

function walk(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const path=`${dir}/${entry.name}`
    return entry.isDirectory()?walk(path):[path]
  })
}

for(const file of walk('apps/admin/app').filter(file=>/\.(?:ts|tsx)$/.test(file))){
  const source=fs.readFileSync(file,'utf8')
  if(!source.includes('aaraagate.admin.session'))continue
  if(source.includes('async function api<T>')){
    console.error(`V4.49 residual contract failed: ${file} defines a local Admin API helper`)
    process.exit(1)
  }
  if(!specialTransportFiles.has(file)&&(
    source.includes('NEXT_PUBLIC_AARAGATE_API_BASE_URL')||
    source.includes('NEXT_PUBLIC_API_BASE_URL')
  )){
    console.error(`V4.49 residual contract failed: ${file} defines a direct Admin API base`)
    process.exit(1)
  }
}

const providerSessionFiles=[
  'apps/admin/app/provider/page.tsx',
  'apps/admin/app/provider/media/page.tsx',
]
for(const file of providerSessionFiles){
  const source=fs.readFileSync(file,'utf8')
  if(!source.includes('aaraagate.provider.session')||source.includes('aaraagate.admin.session')){
    console.error(`V4.49 boundary failed: ${file} must remain on the provider session boundary`)
    process.exit(1)
  }
}

console.log('V4.49 Admin-client convergence verified')
