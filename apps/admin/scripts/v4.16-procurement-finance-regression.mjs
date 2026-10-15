import fs from 'node:fs'
const page=fs.readFileSync(new URL('../app/finance/procurement/page.tsx',import.meta.url),'utf8')
const layout=fs.readFileSync(new URL('../app/finance/layout.tsx',import.meta.url),'utf8')
const required=['Procurement accounting handoff','/vendors/procurement/accounting/purchase-orders','/expense-draft','/accounting/accounts','/accounting/finance-operations/fund-utilization','FINANCE_MANAGE permission','Create expense draft']
for(const token of required){if(!page.includes(token)){console.error('Missing V4.16.2 finance handoff token:',token);process.exit(1)}}
if(!layout.includes('/finance/procurement')){console.error('Finance navigation missing procurement handoff');process.exit(1)}
console.log('V4.16.2 procurement finance handoff regression passed')
