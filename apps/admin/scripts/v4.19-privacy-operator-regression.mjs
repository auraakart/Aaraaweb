import fs from 'node:fs'

const page=fs.readFileSync(new URL('../app/privacy-operations/page.tsx',import.meta.url),'utf8')

for(const token of [
  '/privacy/operator-context',
  'Select resident/member',
  'Assignee',
  'Due at',
  'Case decision',
  'Retention review',
  'Erasure/minimisation plan',
  'I confirm I reviewed this plan',
]){
  if(!page.includes(token)){
    console.error(`Missing V4.19.1 privacy operator token: ${token}`)
    process.exit(1)
  }
}
for(const forbidden of ['prompt(', 'alert(', 'confirm(']){
  if(page.includes(forbidden)){
    console.error(`Privacy operations must not use browser ${forbidden} dialogs`)
    process.exit(1)
  }
}
console.log('V4.19.1 privacy operator regression passed')
