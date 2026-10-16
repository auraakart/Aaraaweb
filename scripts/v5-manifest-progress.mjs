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
    if (typeof slice.name !== 'string' || slice.name.length === 0 ||
        typeof slice.status !== 'string' || slice.status.length === 0) {
      fail('unnamed or untracked V5.5 slice');
    }
  }
  const latest = build.slices.at(-1);
  if (build.currentSlice !== latest.id) fail('stale V5.5 currentSlice pointer');
  return Object.freeze({
    latestSlice:latest.id, currentStatus:latest.status,
    remainingExternalBlockers:build.remaining.length,
    buildExecutionAuthorized:false, partnerArtifactsVerified:false,
    stagingPromoted:false, mainPromoted:false
  });
}
