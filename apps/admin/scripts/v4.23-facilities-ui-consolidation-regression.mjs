import fs from 'node:fs'

const routes=[
  'page.tsx',
  'operations/page.tsx',
  'health/page.tsx',
  'alerts/page.tsx',
  'preventive/page.tsx',
  'contracts/page.tsx',
  'inventory/page.tsx',
]
const content=Object.fromEntries(routes.map(route=>[
  route,
  fs.readFileSync(new URL(`../app/facilities/${route}`,import.meta.url),'utf8'),
]))

for(const [route,page] of Object.entries(content)){
  for(const token of ['PageShell','PageHeader','ErrorState']){
    if(!page.includes(token)){
      console.error(`Facilities route ${route} missing shared Admin contract: ${token}`)
      process.exit(1)
    }
  }
  for(const forbidden of ['prompt(', 'alert(', 'confirm(']){
    if(page.includes(forbidden)){
      console.error(`Facilities route ${route} must not use browser dialog: ${forbidden}`)
      process.exit(1)
    }
  }
  if(page.includes("background:'#05879A'")){
    console.error(`Facilities route ${route} retained hard-coded legacy primary styling`)
    process.exit(1)
  }
}

for(const token of ['FormField','SelectField','PrimaryButton','SecondaryButton','Timeline','/facilities/operator-context','Complete work order','Completion note']){
  if(!content['page.tsx'].includes(token)){
    console.error(`Facilities core missing consolidation/operator contract: ${token}`)
    process.exit(1)
  }
}
for(const token of ['ReadinessPanel','EvidenceGrid','StatusPill','/facilities/readiness','Priority work readiness','Critical active','Overdue','Unassigned','Asset-state risk','Evidence ','nextActions','signals']){
  if(!content['health/page.tsx'].includes(token)){
    console.error(`Facilities health missing readiness contract: ${token}`)
    process.exit(1)
  }
}
for(const token of ['Completion note','Confirm completion','prepareTransition','submitTransition']){
  if(!content['operations/page.tsx'].includes(token)){
    console.error(`Facilities operations missing typed completion contract: ${token}`)
    process.exit(1)
  }
}
for(const token of ['EvidenceGrid','Generate due work','Assignee','planEvidence']){
  if(!content['preventive/page.tsx'].includes(token)){
    console.error(`Preventive maintenance missing shared/evidence contract: ${token}`)
    process.exit(1)
  }
}
for(const token of ['EvidenceGrid','Approved provider','Maintenance evidence','Verify']){
  if(!content['contracts/page.tsx'].includes(token)){
    console.error(`Facilities contracts missing shared/evidence contract: ${token}`)
    process.exit(1)
  }
}
for(const token of ['EvidenceGrid','Inventory & spares','Record movement','EmptyState']){
  if(!content['inventory/page.tsx'].includes(token)){
    console.error(`Facilities inventory missing shared contract: ${token}`)
    process.exit(1)
  }
}
for(const token of ['StatusPill','Scan now','Acknowledge','Resolve']){
  if(!content['alerts/page.tsx'].includes(token)){
    console.error(`Facilities alerts missing shared contract: ${token}`)
    process.exit(1)
  }
}

const layout=fs.readFileSync(new URL('../app/facilities/layout.tsx',import.meta.url),'utf8')
for(const href of ['/facilities/operations','/facilities/inventory']){
  if(!layout.includes(href)){
    console.error(`Facilities navigation missing ${href}`)
    process.exit(1)
  }
}
const css=fs.readFileSync(new URL('../app/facilities/facilities-workspace.css',import.meta.url),'utf8')
if(css.includes('min-height:42px')) throw new Error('Facilities controls must keep the 44px interaction target')

console.log('V4.23 Facilities Admin consolidation regression passed')
