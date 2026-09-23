import fs from 'node:fs'

const checks=[
  ['services/api/src/accounting/receivables.controller.ts',['@Get(\':receivableId/adjustments\')','noteNumber?: string']],
  ['services/api/src/accounting/receivables.service.ts',["'DEBIT_NOTE'","'CREDIT_NOTE'",'"residentVisible"']],
  ['apps/admin/app/finance/page.tsx',['Credit & debit notes','noteNumber','Post note']],
  ['apps/admin/app/finance/reconciliation/page.tsx',["../../../lib/admin-client"]],
  ['apps/admin/app/finance/payment-exceptions/page.tsx',["../../../lib/admin-client"]],
  ['services/api/src/guard-operations/guard-operations.controller.ts',["overstays/:id/escalate","patrol/status"]],
  ['services/api/src/guard-operations/guard-operations.service.ts',['escalateOverstay(','patrolStatus(']],
  ['apps/guard/lib/data/guard_operations_client.dart',['escalateOverstay(','patrolStatus(']],
  ['apps/guard/lib/screens/guard_field_operations_screen.dart',["Text('ESCALATE')","Coverage overdue","patrol due"]],
  ['services/api/src/ai-operations/ai-assistant.service.ts',["id:'gate-attention'","whyNow","recommendedNextStep","recommendedFocus"]],
]

for(const [file,tokens] of checks){
  const source=fs.readFileSync(file,'utf8')
  for(const token of tokens){
    if(!source.includes(token)){
      console.error(`V4.48 contract failed: ${file} missing ${token}`)
      process.exit(1)
    }
  }
}

for(const file of ['apps/admin/app/finance/reconciliation/page.tsx','apps/admin/app/finance/payment-exceptions/page.tsx']){
  const source=fs.readFileSync(file,'utf8')
  if(source.includes('async function api<T>')||source.includes('NEXT_PUBLIC_AARAGATE_API_BASE_URL')){
    console.error(`V4.48 contract failed: ${file} regressed to a local Admin API client`)
    process.exit(1)
  }
}

console.log('V4.48 competitive-depth contracts verified')
