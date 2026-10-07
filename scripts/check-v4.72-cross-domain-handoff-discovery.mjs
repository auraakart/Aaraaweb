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
    console.error(`${label} contains prohibited V4.72 boundary tokens: ${present.join(', ')}`);
    process.exit(1);
  }
};

const facilitiesController=read('services/api/src/facilities/facilities.controller.ts');
const facilitiesHandoff=read('services/api/src/facilities/facilities-helpdesk-handoff.service.ts');
const facilities=`${facilitiesController}\n${facilitiesHandoff}`;
requireTokens('Helpdesk to Facilities preview',facilities,[
  'previewHelpdeskHandoff',
  '@RequiresPermissions(AppPermission.HELPDESK_REVIEW,AppPermission.FACILITIES_READ)',
  'confirmationRequired:true',
  'mutationPerformed:false',
  'ACTIVE_WORK_ORDER_EXISTS',
]);
requireTokens('Helpdesk to Facilities create',facilities,[
  'createHelpdeskWorkOrder',
  '@RequiresPermissions(AppPermission.HELPDESK_REVIEW,AppPermission.FACILITIES_MANAGE)',
  'pg_advisory_xact_lock',
  'sourceHelpdeskTicketId',
  'FACILITY_WORK_ORDER_CREATED',
  'An active Facilities work order already exists for this Helpdesk ticket',
]);

const migration=read('services/api/prisma/migrations/20260928173000_v472_helpdesk_facilities_handoff/migration.sql');
requireTokens('Helpdesk to Facilities tenant and duplicate guards',migration,[
  'FacilityWorkOrder_society_helpdesk_fkey',
  'FOREIGN KEY ("societyId","sourceHelpdeskTicketId")',
  'REFERENCES "HelpdeskTicket"("societyId","id")',
  'FacilityWorkOrder_active_helpdesk_source_key',
  "WHERE \"sourceHelpdeskTicketId\" IS NOT NULL AND \"status\" IN ('OPEN','IN_PROGRESS')",
]);

const helpdeskUi=read('apps/admin/app/helpdesk/page.tsx');
requireTokens('Helpdesk handoff operator UX',helpdeskUi,[
  '/facilities/helpdesk-handoffs/',
  'operatorConfirm',
  'Facilities handoff',
  'Create corrective work order',
]);
const facilitiesUi=read('apps/admin/app/facilities/page.tsx');
requireTokens('Facilities source traceability',facilitiesUi,[
  'sourceHelpdeskTicketId',
  'sourceHelpdeskTitle',
  'Helpdesk source:',
]);

const searchUi=read('apps/admin/app/admin-global-search.tsx');
requireTokens('Admin operator discovery',searchUi,[
  "api<SearchResponse>(`/search?q=",
  'targetFor',
  'Results are permission-scoped by the server',
  "case 'ASSET'",
  "case 'INVOICE'",
  "case 'HELPDESK'",
]);
forbidTokens('Admin operator discovery',searchUi,[
  'window.location.assign(result.path)',
  'href={result.path}',
]);
const adminConsole=read('apps/admin/app/admin-console.tsx');
requireTokens('Admin search integration',adminConsole,[
  "import { AdminGlobalSearch } from './admin-global-search'",
  '<AdminGlobalSearch session={session} allowedViews={allowedViews} open={setView}/>',
]);

const fixture=read('apps/admin/tests/admin-ui/migrations-fixture.tsx');
requireTokens('Admin migration fixture handoff continuity',fixture,[
  '/facilities/helpdesk-handoffs/ticket-1/preview',
  'confirmationRequired:true',
  'mutationPerformed:false',
]);

const program=read('docs/AARAAGATE-V4.72-CROSS-DOMAIN-HANDOFF-DISCOVERY.md');
requireTokens('V4.72 program evidence',program,[
  'Controlled Helpdesk → Facilities Handoff',
  'Permission-aware Admin Operator Discovery',
  'Productionization remains explicitly excluded',
  'No automatic Facilities work-order creation',
  'No cross-tenant deep-linking',
]);
forbidTokens('V4.72 program evidence',program,[
  'production readiness increased',
  'automatic work order creation enabled',
  'field acceptance complete',
  'live provider certified',
]);

console.log('V4.72 cross-domain handoff and operator discovery contracts are intact.');
