import fs from 'node:fs'

const facilities=fs.readFileSync(new URL('../app/facilities/page.tsx',import.meta.url),'utf8')
const preventive=fs.readFileSync(new URL('../app/facilities/preventive/page.tsx',import.meta.url),'utf8')

for(const token of [
  '/facilities/operator-context',
  'Assignee',
  'Complete work order',
  'Completion note',
  'Confirm completion',
  'Work-order history',
  '/events',
  'Append-only lifecycle evidence',
]){
  if(!facilities.includes(token)){
    console.error(`Missing V4.20.1 facilities operator token: ${token}`)
    process.exit(1)
  }
}
if(/\bprompt\s*\(/.test(facilities)){
  console.error('Facilities work orders must not use browser prompt() flows')
  process.exit(1)
}
for(const token of ['/facilities/operator-context','Assignee','assignedUserName']){
  if(!preventive.includes(token)){
    console.error(`Missing V4.20.1 preventive operator token: ${token}`)
    process.exit(1)
  }
}
if(preventive.includes('Assigned user ID')){
  console.error('Preventive maintenance must not expose raw assignee user ID entry')
  process.exit(1)
}
console.log('V4.20.1 facilities operator regression passed')
