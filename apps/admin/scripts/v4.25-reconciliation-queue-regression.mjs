import fs from 'node:fs'

const source=fs.readFileSync(new URL('../app/finance/reconciliation/page.tsx',import.meta.url),'utf8')
for(const token of ['Queue priority','Next action','priority} priority','selected.nextAction','selected.priority']){
  if(!source.includes(token)) throw new Error(`Missing V4.25 reconciliation queue contract: ${token}`)
}
if(!source.includes("selected.status==='RESOLVED'?'success':selected.priority==='HIGH'?'error':'warning'")){
  throw new Error('High-priority reconciliation cases must remain visually distinct without changing status semantics')
}
console.log('V4.25 reconciliation exception queue regression passed')
