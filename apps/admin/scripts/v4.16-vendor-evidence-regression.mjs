import fs from 'node:fs'

const vendorPage=fs.readFileSync(new URL('../app/society-vendors/page.tsx',import.meta.url),'utf8')
const contractPage=fs.readFileSync(new URL('../app/society-vendors/contracts/page.tsx',import.meta.url),'utf8')
const financePage=fs.readFileSync(new URL('../app/finance/procurement/page.tsx',import.meta.url),'utf8')
const score=fs.readFileSync(new URL('../../../docs/AARAAGATE-V4-COMPETITIVE-SCORECARD.md',import.meta.url),'utf8')
const trace=fs.readFileSync(new URL('../../../docs/REQUIREMENTS-TRACEABILITY.md',import.meta.url),'utf8')
const evidence=fs.readFileSync(new URL('../../../docs/AARAAGATE-V4.16-COMPLETION-EVIDENCE.md',import.meta.url),'utf8')

const checks=[
  [vendorPage,'Quotation comparison'],
  [vendorPage,'Vendor contracts & SLA'],
  [contractPage,'Contract event history'],
  [contractPage,'does not determine legal validity or renewal obligations'],
  [financePage,'Procurement accounting handoff'],
  [score,'Administration/governance | >= 8.7 | **9.2**'],
  [score,'Overall repository evidence score: 9.05 / 10'],
  [score,'Production/field readiness | >= 8.0 before pilot | **8.0**'],
  [trace,'V2-VND Society vendors/procurement | P1 | **Implemented / hardened**'],
  [trace,'V4.16 Society Vendor & Procurement Operations Depth closure'],
  [evidence,'Production/field readiness remains exactly **8.0**'],
  [evidence,'Vendor-staff gate linkage remains deliberately deferred'],
]
for(const [content,token] of checks){
  if(!content.includes(token)){
    console.error('Missing V4.16 evidence contract token:',token)
    process.exit(1)
  }
}
console.log('V4.16 vendor/procurement evidence regression passed')
