import fs from 'node:fs';

const source=fs.readFileSync(new URL('../app/governance/readiness/page.tsx',import.meta.url),'utf8');
const governance=fs.readFileSync(new URL('../app/governance/page.tsx',import.meta.url),'utf8');

const required=[
 'Governance readiness & closure evidence',
 'does not determine legal validity',
 'quorumComparison',
 'Recorded count meets/exceeds configured count',
 'Recorded count is below configured count',
 'approvalConfigured',
 'unresolvedResolutions',
 'evidenceEvents',
 'operational completeness checklist only',
];
for(const fragment of required){if(!source.includes(fragment))throw new Error(`Governance readiness regression: missing ${fragment}`)}
if(source.includes('legally valid')||source.includes('statutorily compliant'))throw new Error('Governance readiness must not assert legal validity or statutory compliance.');
if(!governance.includes('/governance/readiness'))throw new Error('Governance workspace must link to readiness evidence.');
console.log('Governance readiness/closure evidence regression: PASS');
