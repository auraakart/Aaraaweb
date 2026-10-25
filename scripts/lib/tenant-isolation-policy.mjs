/** Catalog prerequisites only: policy existence cannot prove policy semantics. */
export function evaluateTenantIsolationCatalog(roles, tables, requiredTables) {
  if (!Array.isArray(roles) || !Array.isArray(tables) || !Array.isArray(requiredTables)
      || roles.length === 0 || requiredTables.length === 0
      || requiredTables.some(name => typeof name !== 'string' || !name)) {
    throw new Error('Incomplete tenant isolation catalog evidence');
  }
  const unsafeRoles = roles.filter(role => role.superuser !== false || role.bypassRls !== false);
  const names = new Set();
  for (const table of tables) {
    if (!table || typeof table.name !== 'string' || names.has(table.name)) {
      throw new Error('Ambiguous tenant table catalog evidence');
    }
    names.add(table.name);
  }
  const gaps = [...new Set(requiredTables)].sort().flatMap(name => {
    const table = tables.find(item => item.name === name);
    if (!table) return [{ table: name, reasons: ['TABLE_MISSING'] }];
    const reasons = [];
    if (table.rlsEnabled !== true) reasons.push('RLS_DISABLED');
    if (table.rlsForced !== true) reasons.push('RLS_NOT_FORCED');
    if (!Number.isSafeInteger(table.policyCount) || table.policyCount < 1) reasons.push('POLICY_MISSING');
    if (table.ownerReachable !== false) reasons.push('OWNER_ROLE_REACHABLE');
    return reasons.length ? [{ table: name, reasons }] : [];
  });
  return {
    status: unsafeRoles.length || gaps.length ? 'CATALOG_REVIEW_REQUIRED' : 'CATALOG_PREREQUISITES_MET',
    isolationProven: false,
    requiredTableCount: new Set(requiredTables).size,
    unsafeRoleCount: unsafeRoles.length,
    gaps,
    remainingAcceptance: ['POLICY_SEMANTICS', 'CROSS_TENANT_NEGATIVES', 'POOLED_CONTEXT', 'JOBS_AND_STORAGE'],
  };
}
