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
const closeCall = source.indexOf('/accounting/periods/${period.id}/close`',{method:\'POST\'}');
if (closeAction < 0 || closeCall < closeAction) throw new Error('Period close must remain an explicit operator action.');

console.log('Finance period-close workspace contract: PASS');
