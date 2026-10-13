/**
 * V5.4.5.1 — deterministic commercial capacity/cutover rehearsal only.
 *
 * Input authority is TEST SNAPSHOT DATA, not a bearer-authenticated principal
 * or a transactionally locked PostgreSQL row. The result is a proposed next
 * state, NEVER a live grant, entitlement or society association update.
 * V5.1 audited transfers and V5.4.5 DB atomicity are prerequisites to wiring.
 */
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const key = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const featureName = /^[A-Z][A-Z0-9_]{1,63}$/;
const essentialIfAlreadyEnabled = ['VISITOR_MANAGEMENT', 'SOS'];

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}
function validId(value) { return typeof value === 'string' && key.test(value); }
function safeNonnegative(value) { return Number.isSafeInteger(value) && value >= 0; }
function featureSet(list) {
  ensure(Array.isArray(list) && list.length <= 128, 'Invalid feature snapshot');
  const values = new Set();
  for (const feature of list) {
    ensure(typeof feature === 'string' && featureName.test(feature) &&
      !values.has(feature), 'Invalid or duplicate feature');
    values.add(feature);
  }
  return values;
}
function sameSet(left, right) {
  return left.size === right.size && [...left].every(value => right.has(value));
}

/** A compatibility check, not a feature resolver. Never mutates legacy grants. */
export function assessLegacyLicenseCutover({
  historicalFeatures, currentFeatures, proposedFeatures,
  explicitSocietyOptIn, auditedOwnershipTransfer, essentialOperationsApproved,
}) {
  const historical = featureSet(historicalFeatures);
  const current = featureSet(currentFeatures);
  const proposed = featureSet(proposedFeatures);
  const blockers = [];
  if (!sameSet(historical, current)) blockers.push('LEGACY_ENTITLEMENT_DRIFT');
  if (explicitSocietyOptIn !== true) blockers.push('SOCIETY_CUTOVER_NOT_APPROVED');
  if (auditedOwnershipTransfer !== true) blockers.push('OWNERSHIP_AUDIT_INCOMPLETE');
  if (essentialOperationsApproved !== true) blockers.push('ESSENTIAL_OPERATIONS_POLICY_UNAPPROVED');
  for (const essential of essentialIfAlreadyEnabled) {
    if (historical.has(essential) && !proposed.has(essential)) {
      blockers.push('ESSENTIAL_FEATURE_REMOVED_' + essential);
    }
  }
  return Object.freeze({
    eligibleForFutureReviewedCutover: blockers.length === 0,
    blockers: Object.freeze(blockers),
    // The current legacy features remain authoritative in ALL results.
    unchangedLegacyFeatures: Object.freeze([...current]),
  });
}

function requestIdentity(request) {
  // Idempotency binds the submitted ownership and license preconditions.
  return [
    request.partnerId, request.societyId, request.planRevisionId,
    request.expectedOwnershipVersion, request.expectedAllocationVersion,
  ].join(':');
}

/**
 * Given an authoritative snapshot *provided by a test*, calculate the next
 * reservation proposal. Sequential calls model optimistic concurrency only:
 * actual workers require a DB lock, scoped authorization and unique receipts.
 */
export function simulatePartnerCapacityReservation(state, request) {
  ensure(state && typeof state === 'object' && request && typeof request === 'object',
    'Invalid commercial simulation request');
  for (const id of [state.partnerId, state.planRevisionId, request.partnerId,
    request.ownerPartnerId, request.planRevisionId, request.societyId,
    request.idempotencyKey]) {
    ensure(validId(id), 'Invalid commercial identity');
  }
  ensure(safeNonnegative(state.maximumSocieties) &&
    safeNonnegative(state.allocationVersion) &&
    Number.isSafeInteger(request.expectedAllocationVersion) &&
    Number.isSafeInteger(request.ownershipVersion) && request.ownershipVersion > 0 &&
    Number.isSafeInteger(request.expectedOwnershipVersion) &&
    request.expectedOwnershipVersion > 0, 'Invalid version/capacity');
  ensure(Array.isArray(state.allocatedSocietyIds) &&
    state.allocatedSocietyIds.length <= state.maximumSocieties &&
    state.allocatedSocietyIds.every(validId) &&
    new Set(state.allocatedSocietyIds).size === state.allocatedSocietyIds.length,
    'Invalid allocated society snapshot');
  ensure(Array.isArray(state.receipts) && state.receipts.length <= 10000 &&
    state.receipts.every(row => row && validId(row.key) &&
      typeof row.identity === 'string' && validId(row.societyId)),
    'Invalid idempotency receipts');
  ensure(new Set(state.receipts.map(row => row.key)).size === state.receipts.length,
    'Duplicate receipt keys');
  const identity = requestIdentity(request);
  const prior = state.receipts.find(row => row.key === request.idempotencyKey);
  if (prior) {
    ensure(prior.identity === identity && prior.societyId === request.societyId &&
      state.allocatedSocietyIds.includes(request.societyId),
    'Idempotency conflict');
    return Object.freeze({
      outcome: 'REPLAYED', allocationVersion: state.allocationVersion, state,
    });
  }
  ensure(state.partnerId === request.partnerId &&
    request.ownerPartnerId === request.partnerId, 'Cross-partner allocation denied');
  ensure(state.planRevisionId === request.planRevisionId, 'Plan revision conflict');
  ensure(request.ownershipVersion === request.expectedOwnershipVersion,
    'Ownership version conflict');
  ensure(state.allocationVersion === request.expectedAllocationVersion,
    'Allocation version conflict');
  ensure(request.partnerStatus === 'ACTIVE' && request.licensePhase === 'ACTIVE',
    'Inactive partner or license: no new allocations in grace or expiry');
  ensure(request.auditedOwnershipTransfer === true,
    'Audited ownership transfer is required');
  ensure(request.explicitCommercialApproval === true,
    'Commercial allocation approval is required');
  ensure(!state.allocatedSocietyIds.includes(request.societyId),
    'Society already allocated');
  ensure(state.allocatedSocietyIds.length < state.maximumSocieties,
    'Partner allocation capacity exceeded');
  ensure(state.allocationVersion < Number.MAX_SAFE_INTEGER,
    'Allocation version exhausted');
  const nextVersion = state.allocationVersion + 1;
  const next = Object.freeze({
    partnerId: state.partnerId,
    planRevisionId: state.planRevisionId,
    maximumSocieties: state.maximumSocieties,
    allocationVersion: nextVersion,
    allocatedSocietyIds: Object.freeze([...state.allocatedSocietyIds, request.societyId]),
    receipts: Object.freeze([...state.receipts, Object.freeze({
      key: request.idempotencyKey, identity, societyId: request.societyId,
    })]),
  });
  return Object.freeze({ outcome: 'RESERVED_IN_SIMULATION',
    allocationVersion: nextVersion, state: next });
}
