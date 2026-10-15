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
    console.error(`${label} contains prohibited V4.71 boundary tokens: ${present.join(', ')}`);
    process.exit(1);
  }
};

const financeUi=read('apps/admin/app/finance/operations/page.tsx');
requireTokens('Finance intake workflow',financeUi,[
  'ExpenseIntakeAssessment',
  '/accounting/finance-operations/expenses/intake-assessment',
  'intakeConfirmed',
  'evidenceUnchanged',
  'Review & create draft',
  'Approval and posting remain separate controls.',
]);

const amenityUi=read('apps/admin/app/amenities/page.tsx');
requireTokens('Amenity policy Admin coverage',amenityUi,[
  'minAdvanceMinutes',
  'maxAdvanceDays',
  'maxFutureBookingsPerUnit',
  'maxBookingsPerDayPerUnit',
  'cooldownMinutes',
  'cancellationCutoffMinutes',
  'checkInOpenMinutesBefore',
  'noShowGraceMinutes',
  'conflictGroup',
  'pricingBands',
  'WEEKDAYS',
]);

const helpdesk=read('services/api/src/helpdesk/helpdesk.service.ts');
requireTokens('Helpdesk asset linkage',helpdesk,[
  'reviewAssets',
  'linkAsset',
  'ASSET_LINKED',
  'ASSET_UNLINKED',
  'SAME_ASSET',
  'SAME_UNIT_CATEGORY',
  'sameAssetSimilarLast90Days',
]);
const helpdeskController=read('services/api/src/helpdesk/helpdesk.controller.ts');
requireTokens('Helpdesk asset API',helpdeskController,[
  "review/assets",
  "review/:ticketId/asset",
  'LinkHelpdeskAssetDto',
  '@RequiresPermissions(AppPermission.HELPDESK_REVIEW, AppPermission.FACILITIES_READ)',
]);
const helpdeskUi=read('apps/admin/app/helpdesk/page.tsx');
requireTokens('Helpdesk asset operator UX',helpdeskUi,[
  '/helpdesk/review/assets',
  'Facility asset linkage',
  'Similar same-asset tickets / 90d',
  'Residents do not need to know an asset ID',
]);
const migration=read('services/api/prisma/migrations/20260928143000_v471_helpdesk_asset_linkage/migration.sql');
requireTokens('Helpdesk asset tenant constraint',migration,[
  'HelpdeskTicket_society_asset_fkey',
  'FOREIGN KEY ("societyId","assetId")',
  'REFERENCES "FacilityAsset"("societyId","id")',
  'HelpdeskTicket_society_asset_created_idx',
]);

const platformUi=read('apps/admin/app/platform/page.tsx');
requireTokens('Portfolio action guidance',platformUi,[
  'currentAttention',
  'Attention evidence',
  'humanReason',
  'reasonGuidance',
  'This platform surface does not mutate tenant operations.',
]);

const fixture=read('apps/admin/tests/admin-ui/migrations-fixture.tsx');
requireTokens('Helpdesk migration fixture continuity',fixture,[
  '/helpdesk/review/assets',
  "scope:'SAME_ASSET'",
  "sameAssetSimilarLast90Days:1",
]);

const program=read('docs/AARAAGATE-V4.71-OPERATIONAL-DEPTH-USABILITY.md');
requireTokens('V4.71 program evidence',program,[
  'Finance Intake Workflow',
  'Amenity Policy Administration',
  'Helpdesk Asset-linked Recurrence',
  'Portfolio Attention Guidance',
  'Productionization is explicitly excluded',
]);

forbidTokens('V4.71 program evidence',program,[
  'production readiness increased',
  'live provider certified',
  'field acceptance complete',
  'automatic expense posting enabled',
  'automatic helpdesk assignment enabled',
]);

console.log('V4.71 operational depth and usability contracts are intact.');
