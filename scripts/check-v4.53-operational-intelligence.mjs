import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const requireTokens=(label,source,tokens)=>{
  const missing=tokens.filter(token=>!source.includes(token));
  if(missing.length){
    console.error(`${label} missing: ${missing.join(', ')}`);
    process.exit(1);
  }
};

requireTokens('Finance execution readiness service',read('services/api/src/accounting/finance-operations.service.ts'),[
  'operationalReadiness','RECONCILIATION_OPEN','GATEWAY_OPERATIONS_UNSETTLED','PROCUREMENT_ACCOUNTING_HANDOFF_PENDING',
  'automaticDebitAvailable:false',"providerExecution:'ADAPTER_CONTROLLED'",'does not certify provider settlement',
]);
requireTokens('Finance execution readiness API',read('services/api/src/accounting/finance-operations.controller.ts'),[
  "@Get('operational-readiness')",'AppPermission.FINANCE_READ',
]);
requireTokens('Finance provider exception semantics',read('services/api/src/accounting/payment-reconciliation.service.ts'),[
  "'CHARGEBACK'","'CHARGED_BACK'","'DISPUTED'","'REVERSED'",'providerException',
]);
requireTokens('Finance execution readiness Admin UX',read('apps/admin/app/finance/page.tsx'),[
  'Execution readiness','Open reconciliation','Gateway operations pending','PO accounting handoff','Contracts / AMC ≤30d',
]);

requireTokens('AI Action Centre 2.0',read('services/api/src/ai-operations/ai-assistant.service.ts'),[
  "mode:'READ_ONLY_DRILLDOWN'","confirmationRequired:true","mutationAllowed:false",'workspaceByDomain',
]);
requireTokens('AI Action Centre Admin execution boundary',read('apps/admin/app/ai-assistant/page.tsx'),[
  'Prepare grounded query','Open workspace','explicit confirmation required before any permitted mutation','autonomous mutation: no',
]);

requireTokens('Guard command summary',read('services/api/src/guard-operations/guard-shift-handover.service.ts'),[
  'commandSummary','EMERGENCY_ATTENTION','automaticModeChange:false','PUSH_THEN_IVR_SIMULATOR_OR_MANUAL','FAIL_CLOSED_OR_MANUAL','automaticAccessGrant:false',
]);
requireTokens('Guard command API',read('services/api/src/guard-operations/guard-shift-handover.controller.ts'),[
  "@Get('command-summary')",'GATE_ACCESS_PROCESS',
]);
requireTokens('Guard command mobile UX',read('apps/guard/lib/screens/guard_field_operations_screen.dart'),[
  'commandSummary()','Operating mode:','advisory only','activeDenyWatchlist',
]);
requireTokens('Watchlist lifecycle evidence',read('services/api/src/guard-operations/guard-operations.service.ts'),[
  'watchlistHistory','lifecycleState','deactivatedByName',
]);
requireTokens('Watchlist supervisor boundary',read('services/api/src/guard-operations/guard-operations.controller.ts'),[
  "@Get('watchlist/history')",'AppPermission.GATE_SUPERVISE',
]);

requireTokens('Resident Action Inbox routing',read('apps/resident/lib/screens/home_screen.dart'),[
  '_highlightActionLabel',"return 'Open billing'","return 'Open helpdesk'","return 'Open service'","return 'Read update'",'actionLabel:',
]);
requireTokens('Resident Assistant voice query drafting',read('apps/resident/lib/screens/ai_assistant_screen.dart'),[
  'DeviceResidentSpeech','_listenForAssistant','assistantListening','assistantReview','assistantAction',
  "DropdownMenuItem(value:'hi'","DropdownMenuItem(value:'ta'","DropdownMenuItem(value:'bn'",
]);
requireTokens('Resident voice safety copy',read('apps/resident/lib/voice/resident_speech.dart'),[
  'Assistant query','it never submits, pays, or approves an operation','assistantUnavailable',
]);

requireTokens('Architecture / branch hygiene convergence',read('scripts/cleanup-merged-branches.mjs'),[
  'local-git-ancestry+tree-equivalence+canonical-pr-head-evidence','supersededCanonicalHeadShas','backup/recovery/archive/snapshot preservation rule',
]);
requireTokens('V4.53 milestone evidence',read('docs/AARAAGATE-V4.53-OPERATIONAL-INTELLIGENCE-EXECUTION-DEPTH.md'),[
  'Operational Intelligence & Execution Depth','Finance execution closure','AI Action Centre 2.0','Gate command workflow',
  'Resident execution clarity','Treasurer and Admin depth','Architecture closure','No productionization claim',
]);

console.log('V4.53 operational-intelligence and execution-depth contracts are intact.');
