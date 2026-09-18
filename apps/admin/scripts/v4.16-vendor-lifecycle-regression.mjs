import fs from 'node:fs'
const page=fs.readFileSync(new URL('../app/society-vendors/contracts/page.tsx',import.meta.url),'utf8')
const required=['Vendor contracts & SLA evidence','/society-vendors/contracts','Renewal notice days','lifecycleState','does not determine legal validity or renewal obligations','Mark expired','Terminate','Contract event history','/history']
for(const token of required){if(!page.includes(token)){console.error('Missing V4.16.3 vendor lifecycle token:',token);process.exit(1)}}
console.log('V4.16.3 vendor lifecycle regression passed')
