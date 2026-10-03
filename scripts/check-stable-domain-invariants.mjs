import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const checks = [
  'scripts/check-v4.36-architecture-convergence.mjs',
  'scripts/check-v4.37-repository-integrity.mjs',
  'scripts/check-v4.40-stabilization.mjs',
  'scripts/check-v4.41-maintainability.mjs',
  'scripts/check-v4.48-competitive-depth.mjs',
  'scripts/check-v4.49-finance-admin-client.mjs',
  'scripts/check-v4.50-reliability-convergence.mjs',
  'scripts/check-v4.50.1-regression-hotfix.mjs',
  'scripts/check-v4.51-field-differentiation-trust.mjs',
  'scripts/check-v4.51.1-regression-hardening.mjs',
  'scripts/check-v4.52-competitive-excellence.mjs',
  'scripts/check-v4.53-operational-intelligence.mjs',
  'scripts/check-v4.54-controlled-action-operational-control.mjs',
  'scripts/check-v4.54.1-privacy-finance-consistency.mjs',
  'scripts/check-v4.55-field-readiness.mjs',
  'scripts/check-v4.55.1-engineering-evidence.mjs',
  'scripts/check-v4.55.2-release-truth.mjs',
  'scripts/check-v4.56-guided-operations.mjs',
  'scripts/check-v4.57-admin-authorization-convergence.mjs',
  'scripts/check-v4.58-resident-service-recovery.mjs',
  'scripts/check-v4.59-secure-handover.mjs',
  'scripts/check-v4.60-gate-decision-recovery.mjs',
  'scripts/check-v4.61-amenity-cancellation-recovery.mjs',
  'scripts/check-v4.62-household-staff-recovery.mjs',
  'scripts/check-v4.63-sos-recovery.mjs',
  'scripts/check-v4.64-community-poll-recovery.mjs',
  'scripts/check-v4.64.1-visitor-invite-recovery.mjs',
  'scripts/check-v4.65-family-member-recovery.mjs',
  'scripts/check-v4.65-autopay-preference-recovery.mjs',
  'scripts/check-v4.66-helpdesk-submission-recovery.mjs',
  'scripts/check-v4.67-helpdesk-comment-retry-safety.mjs',
  'scripts/check-v4.68-emergency-contact-recovery.mjs',
  'scripts/check-v4.70-competitive-operations.mjs',
  'scripts/check-v4.71-operational-depth-usability.mjs',
  'scripts/check-v4.72-cross-domain-handoff-discovery.mjs',
  'scripts/check-v4.73-amenity-participation-policy.mjs',
  'scripts/check-v4.74-amenity-blackout-convergence.mjs',
  'scripts/check-v4.75-portfolio-outcome-depth.mjs',
  'scripts/check-v4.76-amenity-operating-hours-convergence.mjs',
  'scripts/check-v4.77-amenity-no-show-policy.mjs',
  'scripts/check-v4.77.1-amenity-test-contract-resilience.mjs',
  'scripts/check-v4.78-amenity-architecture-hardening.mjs',
];

for (const check of checks) {
  if (!existsSync(check)) {
    console.error(`Stable invariant check is missing: ${check}`);
    process.exit(1);
  }
  console.log(`\n=== ${check} ===`);
  const result = spawnSync(process.execPath, [check], { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`Stable domain invariant suite passed (${checks.length} checks).`);
