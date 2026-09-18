import fs from 'node:fs';

const governance=fs.readFileSync(new URL('../app/governance/page.tsx',import.meta.url),'utf8');
const readiness=fs.readFileSync(new URL('../app/governance/readiness/page.tsx',import.meta.url),'utf8');
const score=fs.readFileSync(new URL('../../../docs/AARAAGATE-V4-COMPETITIVE-SCORECARD.md',import.meta.url),'utf8');
const trace=fs.readFileSync(new URL('../../../docs/REQUIREMENTS-TRACEABILITY.md',import.meta.url),'utf8');

for(const fragment of ['Action follow-through','OVERDUE','/status'])if(!governance.includes(fragment))throw new Error(`V4.15 governance evidence missing operator fragment: ${fragment}`);
for(const fragment of ['Governance readiness & closure evidence','does not determine legal validity','operational completeness checklist only'])if(!readiness.includes(fragment))throw new Error(`V4.15 readiness boundary missing: ${fragment}`);
for(const fragment of ['Administration/governance | >= 8.7 | **9.1**','Overall repository evidence score: 9.04 / 10','Production/field readiness remains exactly 8.0'])if(!score.includes(fragment))throw new Error(`V4.15 score reconciliation missing: ${fragment}`);
for(const fragment of ['V4.15 Governance Operations & Committee Workflow Depth closure','Society-specific bye-law/legal acceptance remains external'])if(!trace.includes(fragment))throw new Error(`V4.15 traceability reconciliation missing: ${fragment}`);
console.log('V4.15 governance evidence reconciliation: PASS');
