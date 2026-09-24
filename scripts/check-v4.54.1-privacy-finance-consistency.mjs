import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const requireTokens=(label,source,tokens)=>{
  const missing=tokens.filter(token=>!source.includes(token));
  if(missing.length){console.error(`${label} missing: ${missing.join(', ')}`);process.exit(1);}
};

const assistant=read('services/api/src/ai-operations/ai-assistant.service.ts');
requireTokens('Occupant-scoped workforce AI',assistant,[
  'WorkforceService','residentStatusMine(societyId,userId,unitId)','current occupant of the selected property only',
]);
if(assistant.includes('const facts=await this.residentWorkforce(societyId,unitId)')){
  console.error('AI Assistant must not retain a parallel direct workforce query.');
  process.exit(1);
}

requireTokens('Canonical payment availability',read('services/api/src/accounting/payment-availability.service.ts'),[
  'WITH allocation_totals AS','reversal_totals AS','refund_totals AS','"ReceivableAllocationReversal"','"PaymentRefund"',
]);
requireTokens('Late Fees canonical cash',read('services/api/src/accounting/late-fees.service.ts'),[
  'PaymentAvailabilityService','return this.paymentAvailability.unappliedCashSummary(societyId)',
]);
requireTokens('Treasurer canonical cash',read('services/api/src/accounting/finance-operations.service.ts'),[
  'PaymentAvailabilityService','this.paymentAvailability.unappliedCashSummary(societyId)',
]);
requireTokens('Integration readiness semantics',read('services/api/src/integrations/integration-registry.service.ts'),[
  'configurationReady','contractReady','fieldEvidenceRequired','productionActivationApproved',
  'Production activation stays false when external field evidence is required',
]);
requireTokens('Integration Admin semantics',read('apps/admin/app/integrations/page.tsx'),[
  'Configuration ready:','Contract ready:','Field evidence required:','Production activation approved:',
]);
requireTokens('Treasurer scale seed',read('services/api/scripts/performance-seed.mjs'),[
  'AARAAGATE_PERF_PAYMENT_COUNT??100000','generate_series(1,${paymentCount})','ReceivableAllocationReversal','PaymentRefund',
]);
requireTokens('Treasurer scale gate',read('scripts/performance-smoke.mjs'),[
  "name:'treasurer-control-100k'","/api/v1/accounting/finance-operations/treasurer-control-centre","p95Ms:2500",
]);
requireTokens('V4.54.1 docs',read('docs/AARAAGATE-V4.54.1-PRIVACY-FINANCE-CONSISTENCY-HOTFIX.md'),[
  'Privacy Alignment & Finance Consistency Hotfix','active occupancy','PaymentAvailabilityService','productionActivationApproved=false','100,000',
]);
console.log('V4.54.1 privacy/finance consistency contracts are intact.');
