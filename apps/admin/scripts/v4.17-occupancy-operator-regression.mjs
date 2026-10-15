import fs from 'node:fs'

const page=fs.readFileSync(new URL('../app/occupancy-lifecycle/page.tsx',import.meta.url),'utf8')

const required=[
  '/occupancy-lifecycle/operator-context',
  '/occupancy-lifecycle/move-ins/by-phone',
  'Registered mobile',
  'Select unit',
  'Select resident occupancy',
  'Review decision',
  'Operational note (optional)',
  'Document / file reference',
  'Verification note (optional)',
]
for(const token of required){
  if(!page.includes(token)){
    console.error(`Missing V4.17.1 occupancy operator contract token: ${token}`)
    process.exit(1)
  }
}
if(page.includes('prompt(')){
  console.error('Occupancy lifecycle must not use browser prompt() interactions')
  process.exit(1)
}
if(page.includes('Unit ID<input')||page.includes('User ID<input')||page.includes('Active occupancy ID<input')){
  console.error('Occupancy lifecycle must not expose raw identifier entry for core move workflows')
  process.exit(1)
}
console.log('V4.17.1 occupancy operator regression passed')
