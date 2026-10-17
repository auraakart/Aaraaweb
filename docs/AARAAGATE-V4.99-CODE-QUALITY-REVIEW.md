# V4.99 — shared session and import boundary review

Owner authorization: 17 October full-stack review, root-cause fixes and next-subversion consolidation. Baseline develop `923e2f1bb866726a98c56b70c8c8a42a9f5cc55f`. Target develop; root/API/Admin `4.99.0`, Resident/Guard `4.99.0+49900`. Staging/main are separate promotions.

## Scan and diff scope

Reviewed V4.95–V4.98 diffs against `82f6cfbd99dd89f9590ae0dc43e8c9870625c7f9`, recent implementation history and the affected legacy call paths: Admin canonical session/refresh/logout, console/auditor lifecycle, onboarding/import contracts and API preview/batch normalization. Inspected recent Resident consent/recurring state isolation, REST/SSE deadline/closure code and visitor/access/billing/amenity/Guard controller authorization boundaries. This is a targeted source and regression review, not an exhaustive proof that every module or external integration is defect-free.

The new UI guards did not remove legacy shared-client credential substitution or server-side normalization ambiguity. No additional Flutter regression was demonstrated in the reviewed changes. No speculative Flutter rewrite, cache, index or database migration is introduced. The verified fixes add no SQL/query, endpoint, financial authority or schema change; existing tenant, permission, transaction and idempotency boundaries remain authoritative.

## Issue 1 — requests and refreshes can cross a login boundary

**Issue Summary:** High-priority client intent/isolation defect. An old callback could submit with a replacement login's credentials; a late refresh could overwrite that replacement. This does not demonstrate a bypass of server authorization: the server authorizes the substituted actor, but that actor did not originate the old action.

**Affected Files:** `apps/admin/lib/admin-client.ts`; focused regression `apps/admin/scripts/v4.99-admin-session-regression.mjs`.

**Root Cause:** `storedFor` matched audience/society/role without authentication lineage. Refresh single-flight keys also omitted session ID. `performRefresh` saved credentials unconditionally after its await. A before-fix replay against the actual baseline module demonstrated both replacement-credential use and late-refresh overwrite.

**Corrected Code:** Selected before/after excerpts; the full implementation also rejects missing/changed browser context before return/retry, validates credential strings and keeps society/partner storage separate.

```diff
-function contextKey(session:Session){return `${session.audience??'SOCIETY'}:${session.societyId}:${session.role}`}
+function contextKey(session:Session){return `${session.audience??'SOCIETY'}:${session.societyId}:${session.role}:${session.sessionId}`}
```

```ts
// After: only a matching login or a rotation performed by this client can proceed.
if (stored && sameScope(stored, session) && stored.accessToken && stored.refreshToken && stored.sessionId &&
    (stored.sessionId === session.sessionId || rotations.get(key)?.ids.has(session.sessionId))) return stored;
throw new Error('Sign-in or society changed. Reopen this workspace before continuing.');

// After the refresh await, revalidate ownership before storing its credentials.
const latest = storedFor(current);
if (latest.sessionId !== current.sessionId || latest.refreshToken !== current.refreshToken) return latest;
```

Before, the refresh path built `fresh`, called `save(fresh)` and returned without rechecking storage. After, known rotations preserve legacy component callers and same-login one-refresh/one-retry behavior; unrelated logins are rejected. Rotation registries contain IDs only, are separated by storage namespace and are discarded on observed replacement/logout. Server-side explicit-session use remains supported when browser storage is absent.

## Issue 2 — late UI cleanup can erase a newer login or retain stale workspace state

**Issue Summary:** High-priority session lifecycle race in both the Admin console and read-only Auditor workspace.

**Affected Files:** `apps/admin/app/admin-console.tsx`, `apps/admin/app/audit/page.tsx`; real-surface browser fixtures/tests under `apps/admin/tests/admin-ui/auth-*`.

**Root Cause:** Restore rejection and logout completion unconditionally removed the shared storage key. The surfaces did not invalidate old local state on storage/focus context changes. Fixing the shared client alone would still let an old UI catch handler erase the protected replacement session.

**Corrected Code:**

```diff
-.catch(()=>sessionStorage.removeItem('aaraagate.admin.session'))
+.catch(()=>clearAdminSessionIfCurrent(stored)) // Clear only the captured login's lineage.
```

```ts
// After logout, preserve any newer local login and discard obsolete workspace state.
clearAdminSessionIfCurrent(session);
setSession(value => value && !isAdminSessionCurrent(value) ? null : value);
```

Restore applies a result only while `isAdminSessionCurrent(fresh)` holds. Storage/focus invalidation uses the same predicate and removes its listeners on unmount. Normal logout still waits for its owned in-flight refresh and revokes the rotated credentials; stale logout never switches to an unrelated login.

## Issue 3 — normalized import columns silently overwrite data

**Issue Summary:** High-priority data-integrity defect in API preview and batch creation. Distinct input headers such as `Amount (Paise)` and `amount_paise`, or `Code` and `code`, normalize to the same key; only the later value survived.

**Affected Files:** `services/api/src/migration/migration-preview.service.ts` and its specification; `migration-batch.service.spec.ts`; regenerated tenant inventory.

**Root Cause:** The normalization loop assigned `normalized[key]` without checking an existing own key. Browser exact-header checks and response-shape validation cannot prevent direct API calls or semantic header collisions. Batch creation invokes this normalizer before reference reads and transactions.

**Corrected Code:**

```diff
 const key = rawKey.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
 if (!key) continue;
+// Reject ambiguity before projection can silently overwrite import data.
+if (Object.prototype.hasOwnProperty.call(normalized, key)) {
+  throw new BadRequestException(`Migration row ${rowNumber} contains columns that normalize to the same field: ${key}`);
+}
 const value = rawValue == null ? '' : String(rawValue).trim();
 normalized[key] = value;
```

Errors identify the record ordinal and canonical field without exposing values. Unique legacy aliases, trimming, generated source provenance and the 10,000-row boundary remain supported. Only ambiguous input is newly rejected; no persisted batch, row ID, checksum algorithm, API route or legacy schema changes. The batch regression asserts no reference query or persistence occurs for rejected data.

## Validation and release ledger

Status: IN_PROGRESS. Eighteen focused production-client cases pass locally: stale sign-in/society/role, signed-out calls, late reads/401 writes/refreshes/logout, independent replacement refresh, same-login deduplication, two legitimate rotations, malformed credentials, partner separation and server-side compatibility. Ten browser cases exercise actual console/auditor restore, logout and focus invalidation. Eight API cases cover normalization collisions and pre-persistence rejection. The historical migration browser session fixture is completed with its required session/refresh/society fields, retaining all interaction assertions.

Original TypeScript AST tenant-inventory generator ran with the lockfile's TypeScript 5.9.3; only `sourceDigest` changed. Route/access/table entries and SQL are unchanged. Run stable/current release checks and protected full API/Admin/Resident/Guard/security milestone CI before merging. No local Flutter/browser bootstrap is repeated.

Existing independent accountant/user/device/onboarding/AI acceptance and Services commercial decisions remain open in the consolidated backlog. Actual external V5 TEST/partner evidence remains #1380; no CI result supplies that evidence. No product rating or whole-system security certification is inferred. Staging/main, published demo, productionization and iOS remain unchanged.
