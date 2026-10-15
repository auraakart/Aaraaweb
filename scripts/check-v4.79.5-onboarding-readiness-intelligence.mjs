import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const must=(label,source,tokens)=>{
  const missing=tokens.filter(token=>!source.includes(token));
  if(missing.length)throw new Error(label+' missing: '+missing.join(', '));
};

const service=read('services/api/src/migration/onboarding-readiness.service.ts');
const controller=read('services/api/src/migration/onboarding.controller.ts');
const moduleSource=read('services/api/src/migration/migration.module.ts');
const admin=read('apps/admin/app/onboarding/page.tsx');

must('Authoritative onboarding service',service,[
  'this.migration.readiness(societyId)',
  'this.prisma.building.count',
  'this.prisma.societyMembership.count',
  'this.entitlements.current(societyId)',
  '"SocietyIntegrationConfiguration"',
  '"Amenity"',
  '"AccountingPeriod"',
  '"GovernanceCommitteeTenure"',
  'CURRENT_TIMESTAMP AS "evaluatedAt"',
  'productionizationClaim:false',
  "status:repositoryReady?'REPOSITORY_REVIEW_REQUIRED':'ACTION_REQUIRED'",
]);
must('Onboarding authorization',controller,[
  "@Controller('onboarding')",
  "@Get('readiness')",
  'AppPermission.SOCIETY_CONFIGURATION_MANAGE',
]);
must('Onboarding module wiring',moduleSource,[
  'EntitlementsModule',
  'OnboardingController',
  'OnboardingReadinessService',
]);
must('Admin server-plan consumption',admin,[
  "api<OnboardingPlan>('/onboarding/readiness'",
  'step.blockers',
  'step.nextActions',
  'plan?.boundary',
  "Productionization claimed: {plan?.productionizationClaim?'Yes':'No'}",
]);

for(const forbidden of [
  "api<Building[]>('/societies/",
  "api<MigrationBatch[]>('/migration/batches'",
  "api<RoleRow[]>('/society-roles'",
  "api<Entitlements>('/entitlements/current'",
  "api<IntegrationConfiguration[]>('/integrations/registry/configuration'",
]){
  if(admin.includes(forbidden))throw new Error('Browser-derived onboarding readiness returned: '+forbidden);
}
if(service.includes('process.env.')){
  throw new Error('Onboarding readiness must aggregate repository evidence, not deployment secrets or environment configuration.');
}

console.log('V4.79.5 onboarding readiness intelligence contract OK');
