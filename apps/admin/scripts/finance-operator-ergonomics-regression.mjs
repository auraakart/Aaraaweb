import fs from 'node:fs';

const files = [
  '../app/finance/operations/page.tsx',
  '../app/finance/payment-exceptions/page.tsx',
  '../app/finance/reconciliation/page.tsx',
];

const sources = files.map((file) => [file, fs.readFileSync(new URL(file, import.meta.url), 'utf8')]);

for (const [file, source] of sources) {
  if (source.includes('prompt(')) {
    throw new Error(`Finance operator ergonomics regression: browser prompt remains in ${file}`);
  }
}

const operations = sources.find(([file]) => file.includes('/operations/'))?.[1] ?? '';
for (const fragment of [
  'Choose liability account',
  'Choose posted journal',
  'Settlement cannot exceed the outstanding payable amount.',
  'submitExpenseAction',
  'submitSettlement',
]) {
  if (!operations.includes(fragment)) {
    throw new Error(`Finance operations typed-control contract missing: ${fragment}`);
  }
}

const exceptions = sources.find(([file]) => file.includes('/payment-exceptions/'))?.[1] ?? '';
for (const fragment of [
  'Confirm reversal',
  'reversalReason',
  'reversalAmount',
  'reversiblePaise',
]) {
  if (!exceptions.includes(fragment)) {
    throw new Error(`Payment exception reversal contract missing: ${fragment}`);
  }
}

const reconciliation = sources.find(([file]) => file.includes('/reconciliation/'))?.[1] ?? '';
for (const fragment of [
  'Refund amount (₹)',
  'Resolution reason',
  'resolutionReason',
  'refundAmount',
]) {
  if (!reconciliation.includes(fragment)) {
    throw new Error(`Payment reconciliation operator contract missing: ${fragment}`);
  }
}

console.log('Finance operator ergonomics contract: PASS');
