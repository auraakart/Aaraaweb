import fs from 'node:fs'

const page=fs.readFileSync(new URL('../app/facilities/health/page.tsx',import.meta.url),'utf8')

for(const token of [
  '/facilities/readiness',
  'Priority work readiness',
  'Critical active',
  'Overdue',
  'Unassigned',
  'Asset-state risk',
  'Evidence ',
  'nextActions',
  'signals',
]){
  if(!page.includes(token)){
    console.error(`Missing V4.20.2 facilities readiness token: ${token}`)
    process.exit(1)
  }
}
console.log('V4.20.2 facilities readiness regression passed')
