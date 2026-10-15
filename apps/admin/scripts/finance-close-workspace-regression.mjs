import fs from 'node:fs';

const source = fs.readFileSync(new URL('../app/finance/page.tsx', import.meta.url), 'utf8');

const requiredFragments = [
  '/accounting/periods/${period.id}/close-readiness',
  '/accounting/periods/${period.id}/close',
  '/accounting/reports/trial-balance?asOf=${to}',
  '/accounting/reports/income-expense?from=${from}&to=${to}',
  '/accounting/reports/balance-sheet?asOf=${to}',
  '/accounting/reports/fund-statement?from=${from}&to=${to}',
  "closeReadiness?.readyToClose",
  "closeReadiness.period.status!=='OPEN'",
  'This is irreversible. Closed periods cannot be reopened or materially edited.',
];

for (const fragment of requiredFragments) {
  if (!source.includes(fragment)) {
    throw new Error(`Finance close workspace regression: missing required contract fragment: ${fragment}`);
  }
}

const closeAction = source.indexOf('async function closeSelectedPeriod()');
if (closeAction < 0) throw new Error('Period close action is missing.');
const closeActionBody = source.slice(closeAction, source.indexOf('\n\n  const overdue=', closeAction));
if (!closeActionBody.includes("/accounting/periods/${period.id}/close") || !closeActionBody.includes("{method:'POST'}")) {
  throw new Error('Period close must remain an explicit POST operator action.');
}

console.log('Finance period-close workspace contract: PASS');
