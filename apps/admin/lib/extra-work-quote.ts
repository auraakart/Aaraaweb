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

/**
 * Session-only draft recovery. Namespaced by authenticated session and provider,
 * never placed in localStorage. Exact idempotency keys survive a page reload
 * but are deliberately cleared on sign-out or when this tab session ends.
 */
export type QuoteDraftSessionStorage = {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};
const DRAFT_PREFIX = 'aaraagate.provider.extraWorkDraft.v1.';
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
function sessionPrefix(sessionId: string) {
  return DRAFT_PREFIX + encodeURIComponent(sessionId) + '.';
}
function providerPrefix(sessionId: string, providerId: string) {
  return sessionPrefix(sessionId) + encodeURIComponent(providerId) + '.';
}
function validDraft(value: unknown): value is ExtraWorkQuoteDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<ExtraWorkQuoteDraft>;
  return typeof draft.scopeDescription === 'string' &&
    draft.scopeDescription.length >= 10 && draft.scopeDescription.length <= 1500 &&
    Number.isSafeInteger(draft.amountPaise) && (draft.amountPaise ?? 0) > 0 &&
    (draft.amountPaise ?? 0) <= 100_000_000 &&
    typeof draft.idempotencyKey === 'string' &&
    draft.idempotencyKey.length >= 8 && draft.idempotencyKey.length <= 120;
}
export function restoreProviderQuoteDrafts(
  storage: QuoteDraftSessionStorage, sessionId: string, providerId: string,
  activeBookingIds: ReadonlySet<string>, now = Date.now(),
): Record<string, ExtraWorkQuoteDraft> {
  const prefix = providerPrefix(sessionId, providerId);
  const result: Record<string, ExtraWorkQuoteDraft> = {};
  // Iterate backwards because invalid/expired/closed-booking entries are pruned.
  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i);
    if (!key?.startsWith(prefix)) continue;
    const bookingId = key.slice(prefix.length);
    try {
      const raw = storage.getItem(key);
      const record: unknown = raw ? JSON.parse(raw) : null;
      const entry = record as { savedAt?: unknown; draft?: unknown } | null;
      if (!activeBookingIds.has(bookingId) || !entry ||
          typeof entry.savedAt !== 'number' || !Number.isFinite(entry.savedAt) ||
          entry.savedAt > now || now - entry.savedAt > DRAFT_MAX_AGE_MS ||
          !validDraft(entry.draft)) {
        storage.removeItem(key);
        continue;
      }
      // All retrieved values are revalidated before allowing a retry.
      result[bookingId] = entry.draft;
    } catch {
      // A malformed or inaccessible record must never authorize submission.
      try { storage.removeItem(key); } catch { /* Browser may block storage. */ }
    }
  }
  return result;
}
export function saveProviderQuoteDraft(
  storage: QuoteDraftSessionStorage, sessionId: string, providerId: string,
  bookingId: string, draft: ExtraWorkQuoteDraft, now = Date.now(),
): void {
  if (!sessionId || !providerId || !bookingId || !validDraft(draft))
    throw new Error('Invalid quotation recovery context');
  storage.setItem(providerPrefix(sessionId, providerId) + bookingId,
    JSON.stringify({ savedAt: now, draft }));
}
export function removeProviderQuoteDraft(
  storage: QuoteDraftSessionStorage, sessionId: string, providerId: string,
  bookingId: string,
): void {
  storage.removeItem(providerPrefix(sessionId, providerId) + bookingId);
}
export function purgeProviderQuoteDraftsForSession(
  storage: QuoteDraftSessionStorage, sessionId: string,
): void {
  const prefix = sessionPrefix(sessionId);
  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i);
    if (key?.startsWith(prefix)) storage.removeItem(key);
  }
}
