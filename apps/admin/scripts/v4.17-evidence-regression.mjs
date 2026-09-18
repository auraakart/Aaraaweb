import fs from 'node:fs'

const trace=fs.readFileSync(new URL('../../../docs/REQUIREMENTS-TRACEABILITY.md',import.meta.url),'utf8')
const score=fs.readFileSync(new URL('../../../docs/AARAAGATE-V4-COMPETITIVE-SCORECARD.md',import.meta.url),'utf8')
const completion=fs.readFileSync(new URL('../../../docs/AARAAGATE-V4.17-COMPLETION-EVIDENCE.md',import.meta.url),'utf8')
const program=fs.readFileSync(new URL('../../../docs/AARAAGATE-V4.17-PROGRAM.md',import.meta.url),'utf8')

for(const token of [
  'V2-OCC Move-in/move-out and tenancy lifecycle | P0 | **Implemented / hardened**',
  'V4.17 Occupancy Lifecycle & Property Operations Depth closure',
  'server-authoritative',
]){
  if(!trace.includes(token)) throw new Error(`V4.17 traceability evidence missing: ${token}`)
}

const scoreValue=(label)=>{
  const row=score.split('\n').find(line=>line.startsWith(`| ${label} |`))
  const match=row?.match(/\*\*([0-9]+(?:\.[0-9]+)?)\*\*/)
  if(!match) throw new Error(`V4.17 live score row missing: ${label}`)
  return Number(match[1])
}
const overallMatch=score.match(/Overall repository evidence score: ([0-9]+(?:\.[0-9]+)?) \/ 10/)
if(!overallMatch) throw new Error('V4.17 live overall score missing')
if(scoreValue('Resident experience/features')<9.5) throw new Error('V4.17 live Resident score regressed below 9.5')
if(scoreValue('Administration/governance')<9.3) throw new Error('V4.17 live Administration/governance score regressed below 9.3')
if(scoreValue('Production/field readiness')<8.0) throw new Error('V4.17 live Production/field readiness regressed below 8.0')
if(Number(overallMatch[1])<9.09) throw new Error('V4.17 live overall score regressed below 9.09')

for(const token of [
  'V4.17.1 merged via PR #701',
  'V4.17.2 merged via PR #702',
  'V4.17.3 merged via PR #703',
  'Repository-only evidence score: **9.09 / 10**',
  'Administration/governance: **9.2 → 9.3**',
  'Production/field readiness therefore remains exactly **8.0**',
]){
  if(!completion.includes(token)) throw new Error(`V4.17 completion evidence missing: ${token}`)
}

for(const token of [
  'Status: Repository closure complete',
  'V4.17.3 — Resident move experience — merged via #703',
  'V4.17.4 — Evidence reconciliation — complete',
]){
  if(!program.includes(token)) throw new Error(`V4.17 program closure missing: ${token}`)
}

console.log('V4.17 evidence reconciliation: PASS')
