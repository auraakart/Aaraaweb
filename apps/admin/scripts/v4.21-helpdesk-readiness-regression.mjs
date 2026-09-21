import fs from 'node:fs'

const page=fs.readFileSync(new URL('../app/helpdesk/page.tsx',import.meta.url),'utf8')

for(const token of [
  '/readiness',
  'ReadinessPanel',
  'Service-recovery readiness',
  "id:'ownership',label:'Ownership'",
  "id:'first-response',label:'First response'",
  "id:'sla-state',label:'SLA state'",
  "id:'recovery-priority',label:'Recovery priority'",
  "id:'response-resolution-target',label:'Response / resolution target'",
  'blockers={readiness?.blockers',
  'nextActions={readiness?.nextActions',
]){
  if(!page.includes(token)){
    console.error(`Missing V4.21.2 helpdesk readiness contract: ${token}`)
    process.exit(1)
  }
}
console.log('V4.21.2 helpdesk readiness regression passed')
