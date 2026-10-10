export type ExtraWorkQuoteDraft = {
  scopeDescription: string;
  amountPaise: number;
  idempotencyKey: string;
};
export function parseExtraWorkRupees(raw: string): number | null {
  const input = raw.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(input)) return null;
  const [rupees, fraction = ''] = input.split('.');
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(paise) && paise > 0 && paise <= 100_000_000 ? paise : null;
}
export function preserveQuoteRetryIdentity(
  previous: ExtraWorkQuoteDraft | undefined,
  scopeDescription: string,
  amountPaise: number,
  newKey: () => string,
): ExtraWorkQuoteDraft {
  // A transport failure must not silently mint a new identity. The provider
  // explicitly discards the draft before changing its economics.
  if (previous) return previous;
  return { scopeDescription, amountPaise, idempotencyKey: newKey() };
}
