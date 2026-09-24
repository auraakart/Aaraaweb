import fs from 'node:fs';

const source=fs.readFileSync('app/admin-overview.tsx','utf8');
const required=[
  'Operations priority queue',
  'Deterministic current-state ordering',
  "priorityRank:Record<OperationsPriority,number>",
  "priority:'CRITICAL',title:'Urgent helpdesk'",
  "priority:'HIGH',title:'Payment reconciliation'",
  "priority:'HIGH',title:'Long-open workforce attendance'",
  "priority:'HIGH',title:'Onboarding blocker'",
  "priority:'NORMAL',title:'Overdue maintenance invoices'",
  "priority:'NORMAL',title:'Amenity approvals'",
  "priority:'NORMAL',title:'Workforce verification'",
  'It is not predictive scoring and does not mutate any workflow.',
  'Why now:',
  'Next step:',
];
const missing=required.filter(token=>!source.includes(token));
if(missing.length){
  console.error('V4.52 operations-priority regression missing: '+missing.join(', '));
  process.exit(1);
}
const critical=source.indexOf("priority:'CRITICAL',title:'Urgent helpdesk'");
const normal=source.indexOf("priority:'NORMAL',title:'Amenity approvals'");
if(critical<0||normal<0||critical>normal){
  console.error('V4.52 operations-priority ordering contract changed unexpectedly.');
  process.exit(1);
}
console.log('V4.52 Admin operations priority queue regression contract passed.');
