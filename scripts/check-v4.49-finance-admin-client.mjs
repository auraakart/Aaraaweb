import fs from 'node:fs'

const files=[
  'apps/admin/app/finance/tax/page.tsx',
  'apps/admin/app/finance/bank-reconciliation/page.tsx',
  'apps/admin/app/finance/opening-balances/page.tsx',
  'apps/admin/app/occupancy-lifecycle/page.tsx',
]

for(const file of files){
  const source=fs.readFileSync(file,'utf8')
  if(!source.includes("../../../lib/admin-client")){
    console.error(`V4.49 contract failed: ${file} missing shared Admin client`)
    process.exit(1)
  }
  if(source.includes('async function api<T>')||source.includes('NEXT_PUBLIC_AARAGATE_API_BASE_URL')){
    console.error(`V4.49 contract failed: ${file} regressed to local API transport`)
    process.exit(1)
  }
}

console.log('V4.49 Admin-client convergence verified')
