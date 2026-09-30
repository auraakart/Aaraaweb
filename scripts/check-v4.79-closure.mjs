import fs from 'node:fs';

const requiredDocs=[
  'docs/AARAAGATE-V4.79.0-SOCIETY-KNOWLEDGE-AI.md',
  'docs/AARAAGATE-V4.79.1-FINANCE-DOCUMENT-INTAKE.md',
  'docs/AARAAGATE-V4.79.2-AMENITY-DEPOSIT-LIFECYCLE.md',
  'docs/AARAAGATE-V4.79.3-COMMUNITY-EVENTS-RSVP.md',
  'docs/AARAAGATE-V4.79.4-OPERATION-LEVEL-INTEGRATION-CONTRACTS.md',
  'docs/AARAAGATE-V4.79.5-ONBOARDING-READINESS-INTELLIGENCE.md',
  'docs/AARAAGATE-V4.79.5.1-VALIDATION-DELAY-HARDENING.md',
  'docs/AARAAGATE-V4.79-COMPETITIVE-CONVERGENCE-CLOSURE.md',
];
const requiredChecks=[
  'scripts/check-v4.79.0-society-knowledge-ai.mjs',
  'scripts/check-v4.79.1.1-ci-scope-hardening.mjs',
  'scripts/check-v4.79.1.2-ci-cancellation.mjs',
  'scripts/check-v4.79.1.3-demo-apk-scheduling.mjs',
  'scripts/check-v4.79.2-amenity-deposit-lifecycle.mjs',
  'scripts/check-v4.79.3-community-events-rsvp.mjs',
  'scripts/check-v4.79.4-operation-level-integration-contracts.mjs',
  'scripts/check-v4.79.5-onboarding-readiness-intelligence.mjs',
  'scripts/check-v4.79.5.1-validation-delay-hardening.mjs',
];
for(const path of [...requiredDocs,...requiredChecks]){
  if(!fs.existsSync(path))throw new Error('V4.79 closure evidence missing: '+path);
}

const capability=fs.readFileSync('docs/CURRENT-CAPABILITY-INDEX.md','utf8');
for(const token of [
  'V4.79.0 adds a version-aware Society Knowledge AI foundation',
  'V4.79.1 adds a provider-neutral finance document-intake preparation step',
  'V4.79.2 adds a refundable amenity-deposit lifecycle',
  'V4.79.3 adds a dedicated non-statutory Community Events + RSVP capability',
  'V4.79.4 deepens provider-neutral integration readiness',
  'V4.79.5 replaces browser-derived onboarding heuristics',
  'V4.79 competitive convergence closure',
  'Productionization, hosted staging acceptance',
]){
  if(!capability.includes(token))throw new Error('Current capability reconciliation missing: '+token);
}

const trace=fs.readFileSync('docs/REQUIREMENTS-TRACEABILITY.md','utf8');
for(const token of [
  '## V4.79 Competitive Convergence closure',
  'Society Knowledge AI',
  'Finance Document Intake',
  'Amenity Deposit Lifecycle',
  'Community Events + RSVP',
  'Operation-Level Integration Contracts',
  'Onboarding Readiness Intelligence',
  'does **not** increase Production/field readiness',
]){
  if(!trace.includes(token))throw new Error('Requirements traceability reconciliation missing: '+token);
}

const closure=fs.readFileSync('docs/AARAAGATE-V4.79-COMPETITIVE-CONVERGENCE-CLOSURE.md','utf8');
for(const token of [
  '**Repository-complete on develop after this closure pass.**',
  'No OCR/RAG provider',
  'No automatic expense creation',
  'No amenity wallet',
  'RSVP is not voting',
  'Providers remain transport/reference evidence only',
  'optional disabled modules do not fabricate blockers',
  'This closure pass stops at `develop`.',
]){
  if(!closure.includes(token))throw new Error('V4.79 closure boundary missing: '+token);
}

console.log('V4.79 competitive convergence closure contract OK');
