import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const requireTokens=(label,source,tokens)=>{const missing=tokens.filter(t=>!source.includes(t));if(missing.length){console.error(`${label} missing: ${missing.join(', ')}`);process.exit(1);}};

const service=read('services/api/src/reports/reports-analytics.service.ts');
requireTokens('Portfolio outcome service',service,[
  'platformPortfolioCommandCentre(from?:string,to?:string)',
  'SocietyVendorContract',
  'ReceivableAllocationReversal',
  'collectionPercent',
  'slaCompliancePercent',
  'avgGateProcessingSeconds',
  'deliverySuccessPercent',
  'aggregateOnly:true',
  'No resident or unit records are returned',
]);
const controller=read('services/api/src/reports/reports-platform-analytics.controller.ts');
requireTokens('Portfolio permission boundary',controller,[
  'AppPermission.PLATFORM_CONSUMER_BOOKING_READ',
  'AppPermission.PLATFORM_CONSUMER_PAYMENT_READ',
  "portfolioCommandCentre(@Query('from') from?:string,@Query('to') to?:string)",
]);
const admin=read('apps/admin/app/platform/page.tsx');
requireTokens('Portfolio outcome Admin UX',admin,[
  'Current-state attention + aggregate outcomes',
  'SLA compliance',
  'Notice delivery',
  'Contracts ≤30d',
  'CONTRACTS_EXPIRING',
]);
const test=read('services/api/src/reports/reports-portfolio-command-centre.spec.ts');
requireTokens('Portfolio focused regression',test,[
  "collectionPercent).toBe(80)",
  "slaCompliancePercent).toBe(75)",
  "aggregateOnly:true",
  "not.toContain('unitNumber')",
]);
const doc=read('docs/AARAAGATE-V4.75-PORTFOLIO-OUTCOME-DEPTH.md');
requireTokens('V4.75 program evidence',doc,[
  'Aggregate-only cross-society outcomes',
  'Authoritative finance semantics',
  'No society quality ranking',
  'Productionization remains explicitly excluded',
]);
console.log('V4.75 portfolio outcome depth contracts are intact.');
