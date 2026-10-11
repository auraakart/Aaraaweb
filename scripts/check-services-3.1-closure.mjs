#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FROZEN_LAST_SUBSLICE = 10;
const labelPattern = /v4\.90\.18\.(\d+)(?=$|[^0-9])/gi;

const ONE_OFF_TITLE = 'V4.90.18.11 — Independent finance handoff (read-only)';
const ONE_OFF_BRANCH = 'feature/v4.90.18.11-independent-finance-handoff';

function closedLabelViolation(values) {
  const [title,branch] = values;
  const approvedOneOff = title === ONE_OFF_TITLE && branch === ONE_OFF_BRANCH;
  for (const value of values) {
    for (const match of String(value ?? '').matchAll(labelPattern)) {
      const slice = Number(match[1]);
      if (slice === 11 && approvedOneOff) continue;
      if (slice > FROZEN_LAST_SUBSLICE) return match[0];
    }
  }
  return null;
}

function verifyClosureRecord() {
  const record = readFileSync(new URL('../docs/AARAAGATE-V4.90.18-SERVICES-3.1-CLOSURE.md', import.meta.url), 'utf8');
  for (const marker of [
    '**Status:** CLOSED_FOR_NEW_SERVICES_3_1_FEATURES',
    '**Cutoff:** V4.90.18.10',
    '**Exception:** V4.90.18.11 — ONE_APPROVED_READ_ONLY_FINANCE_HANDOFF',
    '**Finance:** NOT_AUTHORIZED_FOR_EXTRA_WORK_INVOICING_OR_PAYMENT.',
    'Product/field acceptance: NOT VERIFIED',
    'No future work is approved by this closure document.',
  ]) {
    assert.ok(record.includes(marker), 'Missing mandatory Services 3.1 scope marker: ' + marker);
  }
}

function selfTest() {
  assert.equal(closedLabelViolation(['V4.90.18.10 — closure', 'feature/v4.90.18.9']), null);
  assert.equal(closedLabelViolation(['V4.90.19.1 — distinct future milestone']), null);
  assert.equal(closedLabelViolation(['v4.90.18.11 — invoice']), 'v4.90.18.11');
  assert.equal(closedLabelViolation([ONE_OFF_TITLE,ONE_OFF_BRANCH]), null);
  assert.equal(closedLabelViolation([ONE_OFF_TITLE,'feature/v4.90.18.11-invoice']), 'v4.90.18.11');
  assert.equal(closedLabelViolation([ONE_OFF_TITLE+' + money',ONE_OFF_BRANCH]), 'v4.90.18.11');
  assert.equal(closedLabelViolation(['V4.90.18.12 — payout',ONE_OFF_BRANCH]), 'V4.90.18.12');
  assert.equal(closedLabelViolation(['feature/V4.90.18.124-payout']), 'V4.90.18.124');
  assert.equal(closedLabelViolation(['V4.90.18.1000']), 'V4.90.18.1000');
  assert.equal(closedLabelViolation(['V4.90.18.1']), null);
  console.log('Services 3.1 closure guard self-test passed.');
}

verifyClosureRecord();
if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  const violation = closedLabelViolation([process.env.AARAAGATE_PR_TITLE, process.env.AARAAGATE_PR_HEAD]);
  if (violation) {
    console.error('Services 3.1 is closed at V4.90.18.10; ' + violation + ' is an unauthorized continuation. Define a separate independently approved workstream.');
    process.exitCode = 1;
  } else {
    console.log('Services 3.1 milestone closure verified.');
  }
}
