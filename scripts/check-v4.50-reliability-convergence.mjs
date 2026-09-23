import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const requireTokens=(name,source,tokens)=>{
  for(const token of tokens){
    if(!source.includes(token)){console.error(`V4.50 regression: ${name} is missing ${token}`);process.exit(1)}
  }
};
const migration=read('services/api/prisma/migrations/20260923170500_v450_guard_incident_source_key/migration.sql');
requireTokens('guard incident migration',migration,['"sourceKey" TEXT','ROW_NUMBER() OVER','SecurityIncident_societyId_category_sourceKey_key']);
const guard=read('services/api/src/guard-operations/guard-operations.service.ts');
requireTokens('guard overstay escalation',guard,['this.prisma.$transaction(async tx=>','FOR UPDATE OF r','"sourceKey"=${sourceRef}','"mediaRefs","sourceKey"']);
const assistant=read('services/api/src/ai-operations/ai-assistant.service.ts');
requireTokens('AI gate grounding',assistant,['criticalIncidentId','oldestOverstayId','staleCheckpointId','const safetyRank=','safetyRank(a)-safetyRank(b)']);
const adminClient=read('apps/admin/lib/admin-client.ts');
requireTokens('Admin session client',adminClient,['const refreshes=new Map<string,Promise<Session>>()','export function refreshAdminSession','result.response.status===401','const latest=storedFor(active)','await refreshAdminSession(active)']);
const consoleSource=read('apps/admin/app/admin-console.tsx');
requireTokens('Admin console extraction',consoleSource,["import { Billing, Marketplace } from './admin-commerce-panels'","refreshAdminSession(stored)"]);
if(consoleSource.includes('function Marketplace(')||consoleSource.includes('function Billing(')){console.error('V4.50 regression: commerce panels must stay outside the Admin console shell');process.exit(1)}
const commerce=read('apps/admin/app/admin-commerce-panels.tsx');
requireTokens('Admin commerce panels',commerce,['export function Marketplace(','export function Billing(','Property finance operations','owner/current-tenant eligibility']);
if(commerce.includes('Owner-only financial operations')||commerce.includes('not occupants or tenants')){console.error('V4.50 regression: stale owner-only billing copy returned');process.exit(1)}
const assistantUi=read('apps/admin/app/ai-assistant/page.tsx');
requireTokens('AI Action Centre UI',assistantUi,['Recommended focus','Why now:','Next step:']);
console.log('V4.50 reliability-convergence contracts are intact.');
