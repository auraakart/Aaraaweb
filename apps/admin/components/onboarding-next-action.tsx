'use client'

import type {OnboardingPlan} from '../lib/adoption-response'

export function OnboardingNextAction({plan}:{plan:OnboardingPlan}) {
  const next=plan.steps.find(step=>step.id!=='final'&&step.state!=='READY')??plan.steps.find(step=>step.id==='final')
  if(!next)return null
  return <section aria-label="Continue society setup" style={{marginTop:20,padding:20,borderRadius:16,background:'var(--surface-subtle, #eef7f8)',border:'1px solid var(--border-subtle, #c8e3e6)'}}>
    <h2 style={{marginTop:0}}>Continue society setup</h2>
    <p><strong>{next.title}</strong></p>
    <p>{next.nextActions[0]??next.evidence}</p>
    {next.blockers.length>0&&<p role="status">{next.blockers.length} check{next.blockers.length===1?'':'s'} need attention in this step.</p>}
    <a href={next.href} style={{fontWeight:700}}>Continue in {next.title.replace(/^\d+\.\s*/, '')} →</a>
    <p style={{fontSize:13,marginBottom:0}}>Progress comes from saved society records. Return and refresh after completing the action. Visiting a workspace does not mark a check complete.</p>
    {plan.activation.eligibleResidents>plan.activation.activatedResidents&&<p style={{fontSize:13}}>{plan.activation.eligibleResidents-plan.activation.activatedResidents} eligible resident{plan.activation.eligibleResidents-plan.activation.activatedResidents===1?' has':'s have'} not activated. Review resident onboarding before the pilot.</p>}
  </section>
}
