import { isIP } from 'node:net';
import { domainToASCII } from 'node:url';

/**
 * V5.4.2 — Pure partner-domain candidate contract. Never use a hostname as an
 * authentication principal or as evidence of partner/society membership.
 * No DNS, HTTPS, external URL fetch, cookie, database or routing side effects.
 */
const reservedTlds = new Set(['localhost', 'local', 'internal', 'test', 'invalid', 'example']);
const reservedExampleHosts = ['example.com', 'example.net', 'example.org'];
const hostnameLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const utc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/** Reject URL syntax, ports, credentials, IPs, wildcards and malformed DNS labels. */
function asciiHostname(value) {
  if (typeof value !== 'string' || !value || value.length > 253 ||
      value !== value.trim() || /[\x00-\x20\x7f\/@:#?*\\,]/.test(value)) {
    throw new Error('Invalid partner domain hostname');
  }
  const ascii = domainToASCII(value);
  if (!ascii || ascii.length > 253 || isIP(ascii) !== 0) {
    throw new Error('Invalid partner domain hostname');
  }
  const labels = ascii.split('.');
  if (labels.length < 2 || labels.some(label => !hostnameLabel.test(label)) ||
      /^\d+$/.test(labels.at(-1))) {
    throw new Error('Invalid partner domain hostname');
  }
  return ascii.toLowerCase();
}

/**
 * Accept an IDNA hostname for a future verified registry entry; canonical
 * platform hostnames must be supplied in reservedHostnames by the caller.
 */
export function normalizePartnerDomainHostname(value, { reservedHostnames = [] } = {}) {
  const host = asciiHostname(value);
  const labels = host.split('.');
  if (reservedTlds.has(labels.at(-1)) ||
      reservedExampleHosts.some(example => host === example || host.endsWith('.' + example))) {
    throw new Error('Reserved or internal partner domain');
  }
  if (!Array.isArray(reservedHostnames) ||
      reservedHostnames.some(existing => {
        const reserved = asciiHostname(existing);
        return host === reserved || host.endsWith('.' + reserved);
      })) {
    throw new Error('Reserved platform partner domain');
  }
  return host;
}

/**
 * A duplicate remains unavailable even if its old row is pending/revoked.
 * Reclaim/transfer requires a separately audited workflow and fresh DNS proof.
 */
export function assertPartnerDomainAvailable(hostname, records, options = {}) {
  const canonical = normalizePartnerDomainHostname(hostname, options);
  if (!Array.isArray(records)) throw new Error('Invalid partner domain registry');
  for (const record of records) {
    if (!record || typeof record.hostname !== 'string') {
      throw new Error('Invalid partner domain registry');
    }
    if (asciiHostname(record.hostname) === canonical) {
      throw new Error('Partner domain already registered');
    }
  }
  return canonical;
}

function parseUtc(value) {
  if (typeof value !== 'string' || !utc.test(value)) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) ||
      new Date(parsed).toISOString().slice(0, 19) !== value.slice(0, 19)) {
    return null;
  }
  return parsed;
}

/**
 * Exact verified-host candidate lookup. A caller must pass the raw Host from
 * the trusted HTTP server, NOT user-supplied X-Forwarded-Host. Trusted proxy
 * selection and request/session authorization are separate future gates.
 */
export function resolveVerifiedPartnerDomainHost(hostHeader, registry, nowUtc, options = {}) {
  let host;
  try { host = normalizePartnerDomainHostname(hostHeader, options); }
  catch { return null; }
  const now = parseUtc(nowUtc);
  if (now === null || !Array.isArray(registry)) return null;
  // Multiple records for one normalized hostname are a conflict, never
  // a reason to choose the first record from an inconsistent registry.
  let matched = null;
  for (const row of registry) {
    if (!row || typeof row.hostname !== 'string') return null;
    let registered;
    try { registered = asciiHostname(row.hostname); }
    catch { return null; }
    if (registered !== host) continue;
    if (matched) return null;
    matched = row;
  }
  if (!matched || matched.status !== 'VERIFIED' ||
      !uuid.test(matched.partnerId ?? '') || !uuid.test(matched.brandId ?? '')) {
    return null;
  }
  const verifiedAt = parseUtc(matched.verifiedAt);
  const verifiedUntil = parseUtc(matched.verifiedUntil);
  if (verifiedAt === null || verifiedUntil === null ||
      verifiedAt > now || verifiedUntil <= now || verifiedUntil <= verifiedAt) {
    return null;
  }
  return Object.freeze({ hostname:host, partnerId:matched.partnerId, brandId:matched.brandId });
}
