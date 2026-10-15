import fs from 'node:fs'

const files=[
  '../app/finance/page.tsx',
  '../app/finance/operations/page.tsx',
  '../app/finance/bank-reconciliation/page.tsx',
  '../app/finance/exports/page.tsx',
  '../app/finance/opening-balances/page.tsx',
  '../app/finance/payment-exceptions/page.tsx',
  '../app/finance/procurement/page.tsx',
  '../app/finance/reconciliation/page.tsx',
  '../app/finance/statements/page.tsx',
  '../app/finance/waivers/page.tsx',
]
const sources=files.map(path=>[path,fs.readFileSync(new URL(path,import.meta.url),'utf8')])

for(const [path,source] of sources){
  if(!source.includes('components/admin-ui')){
    console.error(`Finance consolidation missing shared UI import: ${path}`)
    process.exit(1)
  }
  if(!source.includes('PageShell')){
    console.error(`Finance consolidation missing PageShell: ${path}`)
    process.exit(1)
  }
  for(const forbidden of ['prompt(','alert(','confirm(']){
    if(source.includes(forbidden)){
      console.error(`Finance consolidation retained browser dialog ${forbidden}: ${path}`)
      process.exit(1)
    }
  }
}

const finance=sources.find(([path])=>path.endsWith('/finance/page.tsx'))[1]
for(const token of [
  'ReadinessPanel',
  'Period close readiness',
  'close-readiness',
  'periodRequest.current',
  'I confirm this period close is irreversible',
  'I confirm this late-fee batch will post accounting journals',
  '/accounting/late-fees/apply',
  '/accounting/settlements/receivables/',
]){
  if(!finance.includes(token)){
    console.error(`Finance root safety contract missing: ${token}`)
    process.exit(1)
  }
}

const opening=sources.find(([path])=>path.includes('opening-balances'))[1]
for(const token of [
  '/accounting/opening-balances',
  'Batch key',
  'stable batch key',
  'I confirm this creates an auditable posted journal',
]){
  if(!opening.includes(token)){
    console.error(`Opening balance consolidation missing: ${token}`)
    process.exit(1)
  }
}

const waivers=sources.find(([path])=>path.includes('/waivers/'))[1]
for(const token of ['maker–checker','Confirm approval','Confirm rejection','requester cannot review their own request']){
  if(!waivers.includes(token)){
    console.error(`Waiver maker-checker consolidation missing: ${token}`)
    process.exit(1)
  }
}

const reconciliation=sources.find(([path])=>path.includes('/reconciliation/'))[1]
for(const token of ['QueuePanel','DetailPanel','operationRequest.current','aria-pressed']){
  if(!reconciliation.includes(token)){
    console.error(`Reconciliation consolidation missing: ${token}`)
    process.exit(1)
  }
}

const exportsPage=sources.find(([path])=>path.includes('/exports/'))[1]
for(const token of ['ReadinessPanel','Connector readiness','configuration-only check','does not make a network call']){
  if(!exportsPage.includes(token)){
    console.error(`Exports readiness boundary missing: ${token}`)
    process.exit(1)
  }
}

console.log('V4.23 Finance Admin consolidation regression passed')
