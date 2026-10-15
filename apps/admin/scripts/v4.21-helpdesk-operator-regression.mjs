import fs from 'node:fs'

const page=fs.readFileSync(new URL('../app/helpdesk/page.tsx',import.meta.url),'utf8')
const nav=fs.readFileSync(new URL('../app/admin-shortcuts.tsx',import.meta.url),'utf8')

for(const token of [
  '/helpdesk/sla/queue',
  '/helpdesk/review/context',
  '/assignment',
  'Prioritized queue',
  'Assignment',
  'Ticket lifecycle',
  'Resolution code',
  'Closure code',
  'Resident-visible comment',
  'Internal note',
  'SLA controls',
  'Escalate breached ticket',
  'Activity history',
  'SLA history',
]){
  if(!page.includes(token)){
    console.error(`Missing V4.21.1 helpdesk operator token: ${token}`)
    process.exit(1)
  }
}
for(const forbidden of ['prompt(', 'alert(', 'confirm(']){
  if(page.includes(forbidden)){
    console.error(`Helpdesk Admin must not use browser ${forbidden} dialogs`)
    process.exit(1)
  }
}
if(!nav.includes("href:'/helpdesk'")||!nav.includes("features.has('HELPDESK')")){
  console.error('Helpdesk Admin navigation must be feature-gated and reachable')
  process.exit(1)
}
console.log('V4.21.1 helpdesk operator regression passed')
