import fs from 'node:fs'
import { readContractBundle } from './lib/source-contract-bundles.mjs';

const checks=[
  ['services/api/src/accounting/receivables.controller.ts',['@Get(\':receivableId/adjustments\')','noteNumber?: string']],
  ['services/api/src/accounting/receivables.service.ts',["'DEBIT_NOTE'","'CREDIT_NOTE'",'"residentVisible"']],
  ['apps/admin/app/finance/page.tsx',['Credit & debit notes','noteNumber','Post note']],
  ['apps/admin/app/finance/reconciliation/page.tsx',["../../../lib/admin-client"]],
  ['apps/admin/app/finance/payment-exceptions/page.tsx',["../../../lib/admin-client"]],
  ['services/api/src/guard-operations/guard-operations.controller.ts',["overstays/:id/escalate","patrol/status"]],
  ['services/api/src/guard-operations/guard-operations.service.ts',['escalateOverstay(','patrolStatus(']],
  ['apps/guard/lib/data/guard_operations_client.dart',['escalateOverstay(','patrolStatus(']],
  ['apps/guard/lib/screens/guard_field_operations_screen.dart',["Coverage overdue","patrol due"]],
  ['@bundle:aiAssistant',["id:'gate-attention'","whyNow","recommendedNextStep","recommendedFocus"]],
]

for(const [file,tokens] of checks){
  const source=file.startsWith('@bundle:') ? readContractBundle(file.slice('@bundle:'.length)) : fs.readFileSync(file,'utf8')
  for(const token of tokens){
    if(!source.includes(token)){
      console.error(`V4.48 contract failed: ${file} missing ${token}`)
      process.exit(1)
    }
  }
}

// Preserve V4.48 safety contracts through bounded Guard UI extraction.
// Both the historical inline button and the extracted action-card layout must
// retain the visible label and executable callback, not just a dead string.
const guardScreen = fs.readFileSync('apps/guard/lib/screens/guard_field_operations_screen.dart', 'utf8');
const guardActionPath = 'apps/guard/lib/widgets/guard_field_action_card.dart';
const guardAction = fs.existsSync(guardActionPath)
  ? fs.readFileSync(guardActionPath, 'utf8')
  : '';
const extractedActionIsWired = guardAction.includes('child: Text(actionLabel)')
  && guardAction.includes('onPressed: onPressed');
const escalationAction = guardScreen.includes("Text('ESCALATE')")
  || (guardScreen.includes("actionLabel: 'ESCALATE'") && extractedActionIsWired);
const patrolAction = guardScreen.includes("Text(stale?'SCAN NOW':'SCAN')")
  || (guardScreen.includes("actionLabel: stale ? 'SCAN NOW' : 'SCAN'") && extractedActionIsWired);
if (!escalationAction || !patrolAction) {
  console.error('V4.48 Guard contract failed: escalation or patrol action no longer renders through a bound callback');
  process.exit(1);
}

for(const file of ['apps/admin/app/finance/reconciliation/page.tsx','apps/admin/app/finance/payment-exceptions/page.tsx']){
  const source=fs.readFileSync(file,'utf8')
  if(source.includes('async function api<T>')||source.includes('NEXT_PUBLIC_AARAGATE_API_BASE_URL')){
    console.error(`V4.48 contract failed: ${file} regressed to a local Admin API client`)
    process.exit(1)
  }
}

console.log('V4.48 competitive-depth contracts verified')
