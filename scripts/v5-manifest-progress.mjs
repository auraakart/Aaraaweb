// V5.5.45: offline, fail-closed manifest consistency gate.
// This proves only that the checked-in nonproduction plan is internally consistent.
// It does NOT prove remote attestation, build eligibility or deployment readiness.
const fail = message => { throw new Error('V5 manifest progress: '+message); };
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function verifyV5ManifestProgress(manifest) {
  if (!isObject(manifest) || manifest.programVersion !== '5.0.0' ||
      manifest.status !== 'IN_DEVELOPMENT' || manifest.productionizationIncluded !== false ||
      manifest.repository !== 'auraakart/Aaraaweb') {
    fail('unexpected program identity or production scope');
  }
  const promotion = manifest.promotion;
  if (!isObject(promotion) || promotion.target !== 'develop' ||
      promotion.staging !== 'CONSOLIDATED_CANDIDATE_ONLY' ||
      promotion.main !== 'EXPLICIT_OWNER_APPROVAL_REQUIRED') {
    fail('branch promotion policy changed without independent approval');
  }
  if (!Array.isArray(manifest.invariants) ||
      !manifest.invariants.includes('No productionization') ||
      !manifest.invariants.includes('No staging/main per-slice promotion')) {
    fail('nonproduction governance invariants missing');
  }
  if (!Array.isArray(manifest.milestones)) fail('milestones missing');
  const milestones = new Map();
  for (const item of manifest.milestones) {
    if (!isObject(item) || typeof item.id !== 'string' || milestones.has(item.id)) {
      fail('duplicate or malformed milestone');
    }
    milestones.set(item.id,item);
  }
  const build = milestones.get('V5.5'), closure = milestones.get('V5.6');
  if (!build || !closure || build.status !== 'IN_PROGRESS' || closure.status !== 'PLANNED') {
    fail('external TEST build and V5.6 closure cannot be claimed complete');
  }
  if (!Array.isArray(build.remaining) || build.remaining.length === 0 ||
      !build.remaining.some(x => typeof x === 'string' && x.includes('trusted TEST runner'))) {
    fail('independently trusted runner blocker was silently erased');
  }
  if (!Array.isArray(build.slices) || build.slices.length === 0) {
    fail('V5.5 slice inventory missing');
  }
  // Every historical slice must have tracked merge evidence; a new in-flight
  // head slice may be pending, but cannot masquerade as completed.
  const isMergedStatus = status => typeof status === 'string' &&
    status.startsWith('MERGED_PROTECTED_CI_PASSED');
  const SHA = /^[a-f0-9]{40}$/;
  let previous = 0;
  for (const slice of build.slices) {
    if (!isObject(slice) || typeof slice.id !== 'string' ||
        !/^V5\.5\.[1-9]\d*$/.test(slice.id)) {
      fail('malformed V5.5 slice identifier');
    }
    const seq = Number(slice.id.substring('V5.5.'.length));
    if (!Number.isSafeInteger(seq) || seq <= previous) {
      fail('duplicate or out-of-order V5.5 slice');
    }
    previous = seq;
    const isLatest = slice === build.slices.at(-1);
    if (isMergedStatus(slice.status)) {
      if (!Number.isSafeInteger(slice.pullRequest) || slice.pullRequest <= 0 ||
          !SHA.test(slice.mergeSha)) {
        fail('merged V5.5 slice missing PR or exact merge SHA evidence');
      }
    } else if (slice.status === 'PENDING_PROTECTED_CI' && isLatest) {
      if (slice.mergeSha !== undefined || slice.ciRun !== undefined) {
        fail('pending V5.5 slice contradicts recorded merge/CI evidence');
      }
    } else {
      fail('previous V5.5 slice remains pending or has unknown completion state');
    }
    if (typeof slice.name !== 'string' || slice.name.length === 0 ||
        typeof slice.status !== 'string' || slice.status.length === 0) {
      fail('unnamed or untracked V5.5 slice');
    }
  }
  // V5.6 engineering evidence is distinct from formal TEST acceptance.
  // This is a local consistency check; it cannot verify GitHub online.
  const engineering = closure.preAcceptanceEngineering;
  if (!isObject(engineering) ||
      engineering.status !== 'ENGINEERING_PROGRESS_NOT_RELEASE_ACCEPTANCE' ||
      engineering.resolvedFinanceRecoveryIssue !== 1387 ||
      engineering.financeRecoveryEngineeringClosed !== true ||
      engineering.pendingFinanceRecoveryIssue !== undefined ||
      engineering.pendingIndependentTestIssue !== 1380 ||
      engineering.externalAcceptanceVerified !== false ||
      engineering.buildExecutionAuthorized !== false ||
      engineering.partnerArtifactsVerified !== false ||
      engineering.releaseCandidateApproved !== false ||
      !Array.isArray(engineering.verifiedSlices) ||
      engineering.verifiedSlices.length === 0) {
    fail('V5.6 nonproduction engineering tracking or external blockers missing');
  }
  let lastEngineeringSequence = 0;
  let lastEngineering = null;
  const engineeringPrs = new Set();
  const engineeringMergeShas = new Set();
  for (const slice of engineering.verifiedSlices) {
    if (!isObject(slice) || typeof slice.id !== 'string' ||
        !/^V5\.6\.[1-9]\d*$/.test(slice.id)) {
      fail('malformed V5.6 engineering slice identifier');
    }
    const sequence = Number(slice.id.slice('V5.6.'.length));
    if (!Number.isSafeInteger(sequence) || sequence <= lastEngineeringSequence) {
      fail('duplicate or out-of-order V5.6 engineering slice');
    }
    if (slice.status !== 'MERGED_PROTECTED_CI_PASSED' ||
        typeof slice.name !== 'string' || !slice.name.trim() ||
        !Number.isSafeInteger(slice.pullRequest) || slice.pullRequest <= 0 ||
        !Number.isSafeInteger(slice.ciRun) || slice.ciRun <= 0 ||
        !SHA.test(slice.mergeSha) ||
        engineeringPrs.has(slice.pullRequest) ||
        engineeringMergeShas.has(slice.mergeSha)) {
      fail('V5.6 engineering slice missing unique protected merge evidence');
    }
    engineeringPrs.add(slice.pullRequest);
    engineeringMergeShas.add(slice.mergeSha);
    lastEngineeringSequence = sequence;
    lastEngineering = slice;
  }
  if (!lastEngineering ||
      engineering.lastVerifiedSlice !== lastEngineering.id ||
      engineering.lastVerifiedPr !== lastEngineering.pullRequest ||
      engineering.lastVerifiedMergeSha !== lastEngineering.mergeSha ||
      engineering.lastVerifiedCI !== lastEngineering.ciRun) {
    fail('stale V5.6 verified engineering pointer');
  }
  if (engineering.latestRegressionUnderReview !== undefined ||
      engineering.inFlightSlice !== undefined) {
    // A future in-flight slice must not be pre-declared as merged.
    fail('V5.6 in-flight slice requires a separate pending-evidence contract');
  }

  const latest = build.slices.at(-1);
  if (build.currentSlice !== latest.id) fail('stale V5.5 currentSlice pointer');
  return Object.freeze({
    latestSlice:latest.id, currentStatus:latest.status,
    remainingExternalBlockers:build.remaining.length,
    latestVerifiedEngineeringSlice:lastEngineering.id, latestVerifiedEngineeringPr:lastEngineering.pullRequest,
    buildExecutionAuthorized:false, partnerArtifactsVerified:false,
    stagingPromoted:false, mainPromoted:false
  });
}
