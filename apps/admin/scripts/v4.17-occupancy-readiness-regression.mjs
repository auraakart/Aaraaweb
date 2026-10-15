import fs from 'node:fs'

const page=fs.readFileSync(new URL('../app/occupancy-lifecycle/page.tsx',import.meta.url),'utf8')

for(const token of [
  '/readiness',
  'Operational handover evidence',
  'Required checklist',
  'Verified documents',
  'Active vehicles',
  'Active workforce',
  'Parking allocations',
  'Current gate authority',
  'These signals are descriptive and do not by themselves block completion',
]){
  if(!page.includes(token)){
    console.error(`Missing V4.17.2 occupancy readiness token: ${token}`)
    process.exit(1)
  }
}
console.log('V4.17.2 occupancy readiness regression passed')
