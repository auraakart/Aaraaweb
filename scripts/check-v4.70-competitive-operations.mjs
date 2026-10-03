import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const requireTokens=(label,source,tokens)=>{
  const missing=tokens.filter(token=>!source.includes(token));
  if(missing.length){
    console.error(`${label} missing semantic contract tokens: ${missing.join(', ')}`);
    process.exit(1);
  }
};
const forbidTokens=(label,source,tokens)=>{
  const present=tokens.filter(token=>source.includes(token));
  if(present.length){
    console.error(`${label} contains prohibited V4.70 truth-boundary tokens: ${present.join(', ')}`);
    process.exit(1);
  }
};

const finance=read('services/api/src/accounting/finance-operations.service.ts');
requireTokens('Finance smart intake',finance,[
  'expenseIntakeAssessment',
  'DUPLICATE_EXACT',
  'REVIEW_REFERENCE_CONFLICT',
  'REVIEW_SIMILAR',
  'mutationPerformed:false',
  'automaticPosting:false',
]);
const reconciliation=read('services/api/src/accounting/bank-reconciliation.service.ts');
requireTokens('Bank reconciliation explainability',reconciliation,[
  'matchSignals',
  'EXACT_BANK_MOVEMENT',
  'autoMatched:false',
  'deterministic:true',
  'confirmationRequired:true',
]);

const amenities=read('services/api/src/amenities/amenities.service.ts');
const amenityPolicy=read('services/api/src/amenities/amenity-policy.engine.ts');
const amenityDomain=`${amenities}\n${amenityPolicy}`;
requireTokens('Amenity policy depth',amenityDomain,[
  'conflictGroup',
  'pricingBands',
  'resolveBookingFee',
  'AmenityWaitlistEntry',
  'bookingFeePaise',
]);
const amenityAdmin=read('apps/admin/app/amenities/page.tsx');
requireTokens('Amenity policy Admin UX',amenityAdmin,[
  'Conflict group',
  'Peak fee',
  'pricingBands',
]);

const reports=read('services/api/src/reports/reports-analytics.service.ts');
requireTokens('Portfolio command centre',reports,[
  'platformPortfolioCommandCentre',
  "attentionLevel",
  "predictive:false",
  "mutationPerformed:false",
]);
requireTokens('Field experience analytics',reports,[
  'experienceFunnel',
  'AMENITY_BOOKING_STARTED',
  'PAYMENT_CHECKOUT_STARTED',
  'HELPDESK_DRAFT_STARTED',
  'PARTIAL_CLIENT_COVERAGE',
  'rawInteractionTraceStored:false',
]);

const platform=read('apps/admin/app/platform/page.tsx');
requireTokens('Portfolio Admin surface',platform,[
  'Portfolio command centre',
  'portfolio-command-centre',
  'no predictive score',
]);

const helpdesk=read('services/api/src/helpdesk/helpdesk.service.ts');
requireTokens('Helpdesk triage intelligence',helpdesk,[
  'triageIntelligence',
  'classifyTriageText',
  'recommendedAssignee',
  'classificationApplied:false',
  'assignmentApplied:false',
  'predictive:false',
]);

const integrations=read('services/api/src/integrations/integration-registry.service.ts');
requireTokens('Integration activation plan',integrations,[
  'activationPlan',
  'BLOCKED_CONTRACT',
  'CONFIGURATION_REQUIRED',
  'FIELD_EVIDENCE_REQUIRED',
  'READY_FOR_INTERNAL_ENABLEMENT',
  'certificationClaim:false',
  'mutationPerformed:false',
]);

const usage=read('services/api/src/analytics/operational-usage.service.ts');
requireTokens('Privacy-minimal usage signals',usage,[
  "'AMENITY_BOOKING_STARTED'",
  "'PAYMENT_CHECKOUT_STARTED'",
  "'HELPDESK_DRAFT_STARTED'",
  "createHash('sha256')",
]);
const usageMigration=read('services/api/prisma/migrations/20260928110000_v470_field_experience_telemetry/migration.sql');
requireTokens('V4.70 telemetry migration',usageMigration,[
  'OperationalUsageEvent_type_check',
  "'AMENITY_BOOKING_STARTED'",
  "'PAYMENT_CHECKOUT_STARTED'",
  "'HELPDESK_DRAFT_STARTED'",
]);

const residentRepository=read('apps/resident/lib/data/resident_repository.dart');
const billing=read('apps/resident/lib/screens/billing_screen.dart');
const residentHelpdesk=read('apps/resident/lib/screens/helpdesk_screen.dart');
const residentAmenities=read('apps/resident/lib/screens/amenities_screen.dart');
requireTokens('Resident task-start instrumentation',residentRepository,['recordUsage(String eventType)']);
requireTokens('Billing task-start instrumentation',billing,["recordUsage('PAYMENT_CHECKOUT_STARTED').ignore()"]);
requireTokens('Helpdesk task-start instrumentation',residentHelpdesk,["recordUsage('HELPDESK_DRAFT_STARTED').ignore()"]);
requireTokens('Amenity task-start instrumentation',residentAmenities,["recordUsage('AMENITY_BOOKING_STARTED').ignore()"]);

const program=read('docs/AARAAGATE-V4.70-COMPETITIVE-OPERATIONS-CONVERGENCE.md');
requireTokens('V4.70 program evidence',program,[
  'Finance Smart Intake',
  'Amenity Policy Depth',
  'Portfolio Command Centre',
  'Helpdesk Triage Intelligence',
  'Integration Activation Plan',
  'Field Experience Telemetry',
  'No OCR/document-extraction provider is integrated by V4.70',
  'No live-provider or physical-hardware certification is claimed',
]);

// V4.70 is explicitly deterministic/advisory. These phrases would contradict
// the release truth boundary if introduced into the evidence document.
forbidTokens('V4.70 program evidence',program,[
  'autonomous accounting posting is enabled',
  'automatic complaint assignment is enabled',
  'hardware certification complete',
  'field pilot accepted',
]);

console.log('V4.70 competitive operations convergence contracts are intact.');
