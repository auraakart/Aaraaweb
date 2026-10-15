import fs from 'node:fs';

const source=fs.readFileSync(new URL('../app/governance/page.tsx',import.meta.url),'utf8');
const required=[
  'Action follow-through',
  'onSubmit={updateAction}',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'OVERDUE',
  'Follow up',
  '/status',
];
for(const fragment of required){if(!source.includes(fragment))throw new Error(`Governance action follow-through regression: missing ${fragment}`)}
console.log('Governance action follow-through regression: PASS');
