import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const requireTokens=(label,source,tokens)=>{
  const missing=tokens.filter(token=>!source.includes(token));
  if(missing.length){
    console.error(`${label} missing: ${missing.join(', ')}`);
    process.exit(1);
  }
};

requireTokens('Core operations priority queue',read('apps/admin/app/admin-overview.tsx'),[
  'Operations priority queue','Deterministic current-state ordering',"priority:'CRITICAL',title:'Urgent helpdesk'",
  "priority:'HIGH',title:'Payment reconciliation'","priority:'NORMAL',title:'Amenity approvals'",
  'It is not predictive scoring and does not mutate any workflow.','Why now:','Next step:',
]);
requireTokens('Core operations regression gate',read('apps/admin/package.json'),[
  'v4.52-operations-priority-regression.mjs',
]);

requireTokens('AutoPay schema',read('services/api/prisma/schema.prisma'),[
  'model PaymentAutopayPreference','providerMandateStatus','@@unique([societyId, unitId, payerUserId])',
]);
requireTokens('AutoPay truth boundary',read('services/api/src/billing/billing.service.ts'),[
  'getAutopayPreference','setAutopayPreference',"executionState:mandateRecorded?'MANDATE_RECORDED_NO_EXECUTOR':'PROVIDER_UNBOUND'",
  'automaticDebitAvailable:false','assertCurrentPayer',
]);
requireTokens('AutoPay resident UX',read('apps/resident/lib/screens/billing_screen.dart'),[
  'AutoPay preference','PREFERENCE ONLY','Automatic debit is not active until a provider mandate is connected',
]);

requireTokens('Gate watchlist assessment',read('services/api/src/guard-operations/guard-operations.service.ts'),[
  'assessWatchlist',"decision=matches.some(row=>row.kind==='DENY')?'DENY':matches.length?'REVIEW':'CLEAR'",
  'automaticMutation:false','Deterministic exact-match screening',
]);
requireTokens('Guard intake screening',read('apps/guard/lib/screens/guard_operations_screen.dart'),[
  '_screenArrival','Watchlist deny match','Continue to approval','No resident approval request has been created',
]);

requireTokens('Privacy program readiness',read('services/api/src/privacy/privacy.service.ts'),[
  'programReadiness','DATA_CATEGORY_LEGAL_BASIS_MISSING','PROCESSOR_AGREEMENT_REFERENCE_MISSING',
  'does not certify statutory compliance',
]);
requireTokens('Privacy Admin readiness',read('apps/admin/app/privacy-operations/page.tsx'),[
  'Privacy program readiness','Missing legal basis','Processors missing agreement ref',
]);

requireTokens('Facilities continuity',read('services/api/src/facilities/facilities-preventive.service.ts'),[
  'continuity','CRITICAL_ALERTS_OPEN','WORK_ORDERS_OVERDUE','not predictive reliability',
]);
requireTokens('Facilities Admin continuity',read('apps/admin/app/facilities/health/page.tsx'),[
  'Service continuity posture','Contracts ≤30 days',
]);

requireTokens('Resident action inbox',read('apps/resident/lib/screens/home_screen.dart'),[
  "title: 'Action inbox'",'liveRegion: true','Action inbox summary','ACT NOW',
]);

requireTokens('AI evidence quality',read('services/api/src/ai-operations/ai-assistant.service.ts'),[
  'CURRENT_QUERY_SNAPSHOT','causalClaim:false','DETERMINISTIC_SIGNAL_NOT_CAUSAL_PROOF',
  'Likely-cause text is a signal interpretation, not causal proof',
]);
requireTokens('AI Admin evidence copy',read('apps/admin/app/ai-assistant/page.tsx'),[
  'Likely signal — not causal proof','current query snapshot','causal claim: no',
]);

requireTokens('Branch hygiene race hardening',read('scripts/cleanup-merged-branches.mjs'),[
  'alreadyAbsent: false','response.status === 404','response.status === 422',
  'reference does not exist','Already absent at delete time',
]);

requireTokens('Branch hygiene evidence resilience',read('.github/workflows/branch-hygiene.yml'),[
  'Publish branch hygiene evidence to job summary','continue-on-error: true','retention-days: 7',
]);

requireTokens('V4.52 milestone evidence',read('docs/AARAAGATE-V4.52-COMPETITIVE-EXCELLENCE-CONVERGENCE.md'),[
  'Competitive Excellence Convergence','Deterministic core-operations priority queue','Provider-neutral AutoPay readiness','Deterministic watchlist assessment',
  'Privacy program readiness','Service continuity posture','AI evidence-quality contract',
  'does not claim a 9.5+ score merely because code exists',
]);

console.log('V4.52 competitive-excellence contracts are intact.');
