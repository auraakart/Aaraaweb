import fs from 'node:fs'

const page=fs.readFileSync(new URL('../app/helpdesk/page.tsx',import.meta.url),'utf8')

for(const token of [
  '/readiness',
  'Service-recovery readiness',
  'Ownership',
  'First response',
  'SLA state',
  'Recovery priority',
  'Response / resolution target',
  'Readiness blockers',
  'Next actions',
]){
  if(!page.includes(token)){
    console.error(`Missing V4.21.2 helpdesk readiness token: ${token}`)
    process.exit(1)
  }
}
console.log('V4.21.2 helpdesk readiness regression passed')
