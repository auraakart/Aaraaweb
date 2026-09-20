import fs from 'node:fs'

const source=fs.readFileSync(new URL('../app/ai-assistant/page.tsx',import.meta.url),'utf8')
const required=[
  '/ai-operations/assistant/tools',
  'Available assistant capabilities',
  'Only capabilities authorized for this role are shown below.',
  'read only',
  '<FactView facts={result.facts}/>',
]
for(const token of required){
  if(!source.includes(token)) throw new Error(`Missing V4.24 assistant UI contract: ${token}`)
}
if(source.includes('<pre style={pre}>{JSON.stringify(result.facts,null,2)}</pre>')){
  throw new Error('Raw JSON assistant evidence rendering must not be restored')
}
console.log('V4.24 permission-aware assistant UI regression passed')
