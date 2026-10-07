import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readContractBundle } from './lib/source-contract-bundles.mjs';

const read=(path)=>fs.readFileSync(path,'utf8');
const json=(path)=>JSON.parse(read(path));
const atLeast=(value,minimum)=>{
  const current=value.split('+')[0].split('.').map(Number);
  for(let i=0;i<minimum.length;i+=1){
    if((current[i]??0)>minimum[i])return true;
    if((current[i]??0)<minimum[i])return false;
  }
  return true;
};

const root=json('package.json');
const api=json('services/api/package.json');
const admin=json('apps/admin/package.json');
assert.ok(atLeast(root.version,[4,83,2]),'Root release identity must be V4.83.2+');
assert.equal(api.version,root.version,'API version must match root');
assert.equal(admin.version,root.version,'Admin version must match root');
for(const path of ['apps/resident/pubspec.yaml','apps/guard/pubspec.yaml']){
  const match=read(path).match(/^version:\s*([^\s]+)/m);
  assert.ok(match&&atLeast(match[1],[4,83,2]),path+' must be V4.83.2+');
}

for(const path of [
  'docs/AARAAGATE-V4.83.2-GROUNDED-OPERATIONS-COPILOT.md',
  'services/api/src/ai-operations/ai-copilot.ts',
  'services/api/src/ai-operations/ai-copilot.spec.ts',
  'services/api/prisma/migrations/20261007070000_v4832_ai_recommendation_outcomes/migration.sql',
]) assert.ok(fs.existsSync(path),'V4.83.2 artifact missing: '+path);

const policy=read('services/api/src/ai-operations/ai-assistant.policy.ts');
assert.ok(policy.includes("| 'MULTI_DOMAIN'"),'Multi-domain assistant intent missing');

const copilot=read('services/api/src/ai-operations/ai-copilot.ts');
for(const token of [
  'societyBaselines(',
  'fallbackSafetyThresholdMinutes:240',
  'not relaxed by historical behavior',
  'hypotheses(',
  'contradictingEvidence',
  'causalClaim:false',
  'fingerprint(',
  'latestOutcomes(',
  'recordOutcome(',
]) assert.ok(copilot.includes(token),'Copilot grounding contract missing: '+token);

const assistant=readContractBundle('aiAssistant');
for(const token of [
  'plan.multiDomain',
  "'MULTI_DOMAIN','MULTI_DOMAIN'",
  'multiDomainSnapshot(',
  'topPriorities:evidenceCards.slice(0,3)',
  'proposalOption',
  "action:'ASSIGN_HELPDESK_TICKET'",
  'recommendationKey',
  'recordRecommendationOutcome(',
]) assert.ok(assistant.includes(token),'Assistant Copilot contract missing: '+token);
assert.ok(assistant.includes('mutationAllowed:false'),'Action Centre must remain read-only outside explicit proposal flows');

const operations=read('services/api/src/ai-operations/ai-operations.service.ts');
assert.ok(operations.includes("const ALLOWED_AI_ACTIONS: ReadonlySet<AiAction> = new Set(['CREATE_HELPDESK_TICKET','BOOK_AMENITY','CREATE_VISITOR_PASS','ASSIGN_HELPDESK_TICKET'])"),'AI mutation allow-list must remain explicit and narrow');

const controller=read('services/api/src/ai-operations/ai-operations.controller.ts');
assert.ok(controller.includes("@Post('assistant/recommendation-outcomes')"),'Recommendation outcome endpoint missing');
assert.ok(controller.includes("@IsIn(['REVIEWED','ACTED','RESOLVED','DISMISSED'])"),'Recommendation outcome status allow-list missing');

const migration=read('services/api/prisma/migrations/20261007070000_v4832_ai_recommendation_outcomes/migration.sql');
assert.ok(migration.includes('AiAssistantRecommendationOutcome'),'Recommendation outcome table missing');
assert.ok(migration.includes("CHECK (\"status\" IN ('REVIEWED','ACTED','RESOLVED','DISMISSED'))"),'Recommendation outcome DB status boundary missing');

const adminUi=read('apps/admin/app/ai-assistant/page.tsx');
for(const token of [
  'Today’s top priorities',
  'Cross-domain hypotheses to verify',
  'Evidence confidence:',
  'Society baseline:',
  'recordOutcome(card,status)',
  'prepareControlledAction(card)',
]) assert.ok(adminUi.includes(token),'Admin Copilot UX missing: '+token);

const command=read('apps/admin/app/operations-control/page.tsx');
assert.ok(command.includes('Evidence confidence:'),'Operations Command Centre evidence grade missing');
assert.ok(command.includes('Cross-domain hypotheses to verify'),'Operations Command Centre hypotheses missing');

const spec=read('services/api/src/ai-operations/ai-copilot.spec.ts');
for(const token of [
  'plans only authorized domains for cross-domain questions',
  'keeps mentioned but unauthorized domains out of the selected plan',
  'preserving the gate safety default',
  'supporting and limiting evidence instead of causal claims',
]) assert.ok(spec.includes(token),'Copilot regression coverage missing: '+token);

const previous=read('scripts/check-v4.83.1-insta-services-entry.mjs');
assert.ok(previous.includes('atLeast(root.version,[4,83,1])'),'V4.83.1 invariant must remain forward-compatible');

const ci=read('.github/workflows/ci.yml');
assert.ok(ci.includes('check-v4.83.2-grounded-operations-copilot.mjs'),'V4.83.2 invariant must run in protected CI');

console.log('V4.83.2 Grounded Operations Copilot 2.0: PASS');
