import fs from 'node:fs'

const trace=fs.readFileSync(new URL('../../../docs/REQUIREMENTS-TRACEABILITY.md',import.meta.url),'utf8')
const score=fs.readFileSync(new URL('../../../docs/AARAAGATE-V4-COMPETITIVE-SCORECARD.md',import.meta.url),'utf8')
const completion=fs.readFileSync(new URL('../../../docs/AARAAGATE-V4.18-COMPLETION-EVIDENCE.md',import.meta.url),'utf8')
const program=fs.readFileSync(new URL('../../../docs/AARAAGATE-V4.18-PROGRAM.md',import.meta.url),'utf8')

for(const token of [
  'V2-DOC Document repository | P1 | **Implemented / hardened**',
  'V4.18 Document Repository & Records Governance Depth closure',
  'VERSION_REPLACED',
  '/documents/published',
]){
  if(!trace.includes(token)) throw new Error(`V4.18 traceability evidence missing: ${token}`)
}

const scoreValue=(label)=>{
  const row=score.split('\n').find(line=>line.startsWith(`| ${label} |`))
  const match=row?.match(/\*\*([0-9]+(?:\.[0-9]+)?)\*\*/)
  if(!match) throw new Error(`V4.18 live score row missing: ${label}`)
  return Number(match[1])
}
const overallMatch=score.match(/Overall repository evidence score: ([0-9]+(?:\.[0-9]+)?) \/ 10/)
if(!overallMatch) throw new Error('V4.18 live overall score missing')
if(scoreValue('Resident experience/features')<9.5) throw new Error('V4.18 live Resident score regressed below 9.5')
if(scoreValue('Administration/governance')<9.4) throw new Error('V4.18 live Administration/governance score regressed below 9.4')
if(scoreValue('Production/field readiness')<8.0) throw new Error('V4.18 live Production/field readiness regressed below 8.0')
if(Number(overallMatch[1])<9.10) throw new Error('V4.18 live overall score regressed below 9.10')

for(const token of [
  'V4.18.1 merged via PR #705',
  'V4.18.2 merged via PR #706',
  'V4.18.3 merged via PR #707',
  'Repository-only evidence score: **9.10 / 10**',
  'Administration/governance: **9.3 → 9.4**',
  'Production/field readiness therefore remains exactly **8.0**',
]){
  if(!completion.includes(token)) throw new Error(`V4.18 completion evidence missing: ${token}`)
}

for(const token of [
  'Status: Repository closure complete',
  'V4.18.1 — Document operator depth — merged via #705',
  'V4.18.2 — Controlled supersession & version lineage — merged via #706',
  'V4.18.3 — Resident document clarity — merged via #707',
  'V4.18.4 — Evidence reconciliation — complete',
]){
  if(!program.includes(token)) throw new Error(`V4.18 program closure missing: ${token}`)
}

console.log('V4.18 evidence reconciliation: PASS')
