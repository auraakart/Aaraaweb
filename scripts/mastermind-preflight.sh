#!/usr/bin/env bash
set -euo pipefail

BASE_SHA="${1:-${BASE_SHA:-}}"
HEAD_SHA="${2:-${HEAD_SHA:-HEAD}}"

if [ -z "$BASE_SHA" ]; then
  if git rev-parse --verify origin/develop >/dev/null 2>&1; then
    BASE_SHA="$(git merge-base "$HEAD_SHA" origin/develop)"
  else
    BASE_SHA="$(git rev-parse "$HEAD_SHA^")"
  fi
fi

git rev-parse --verify "$BASE_SHA^{commit}" >/dev/null
git rev-parse --verify "$HEAD_SHA^{commit}" >/dev/null

mapfile -t CHANGED_FILES < <(git diff --name-only "$BASE_SHA" "$HEAD_SHA")

has_prefix() {
  local prefix="$1"
  printf '%s
' "${CHANGED_FILES[@]}" | grep -q "^$prefix"
}

RUN_API="${RUN_API:-auto}"
RUN_ADMIN="${RUN_ADMIN:-auto}"
RUN_RESIDENT="${RUN_RESIDENT:-auto}"
RUN_GUARD="${RUN_GUARD:-auto}"

if [ "$RUN_API" = "auto" ]; then has_prefix 'services/api/' && RUN_API=true || RUN_API=false; fi
if [ "$RUN_ADMIN" = "auto" ]; then has_prefix 'apps/admin/' && RUN_ADMIN=true || RUN_ADMIN=false; fi
if [ "$RUN_RESIDENT" = "auto" ]; then has_prefix 'apps/resident/' && RUN_RESIDENT=true || RUN_RESIDENT=false; fi
if [ "$RUN_GUARD" = "auto" ]; then has_prefix 'apps/guard/' && RUN_GUARD=true || RUN_GUARD=false; fi

if [ "$RUN_API" = "true" ] || [ "$RUN_ADMIN" = "true" ]; then
  pnpm install --frozen-lockfile
fi

if [ "$RUN_API" = "true" ]; then
  pnpm --filter @aaraagate/api prisma:generate
  pnpm --filter @aaraagate/api lint
  pnpm --filter @aaraagate/api typecheck

  mapfile -t API_SOURCE_FILES < <(
    printf '%s
' "${CHANGED_FILES[@]}" |
      grep '^services/api/src/.*\.ts$' |
      grep -v '\.spec\.ts$' |
      sed 's#^services/api/##' || true
  )
  mapfile -t API_SPEC_FILES < <(
    printf '%s
' "${CHANGED_FILES[@]}" |
      grep '^services/api/src/.*\.spec\.ts$' |
      sed 's#^services/api/##' || true
  )

  if [ "${#API_SOURCE_FILES[@]}" -gt 0 ]; then
    (
      cd services/api
      pnpm exec vitest related "${API_SOURCE_FILES[@]}" --run --passWithNoTests
    )
  fi
  if [ "${#API_SPEC_FILES[@]}" -gt 0 ]; then
    (
      cd services/api
      pnpm exec vitest run "${API_SPEC_FILES[@]}" --passWithNoTests
    )
  fi
fi

if [ "$RUN_ADMIN" = "true" ]; then
  pnpm --filter @aaraagate/admin typecheck
fi

if [ "$RUN_RESIDENT" = "true" ]; then
  (
    cd apps/resident
    flutter pub get
    flutter analyze
    flutter test       test/multi_property_isolation_test.dart       test/gate_screen_test.dart       test/billing_screen_test.dart       test/privacy_data_screen_test.dart       test/home_action_inbox_dedup_test.dart       test/community_poll_participation_test.dart       test/amenities_screen_test.dart       test/family_member_recovery_test.dart       test/emergency_contact_recovery_test.dart       test/workforce_modal_lifecycle_test.dart       test/notices_acknowledgement_test.dart
  )
fi

if [ "$RUN_GUARD" = "true" ]; then
  (
    cd apps/guard
    flutter pub get
    flutter analyze
    flutter test       test/offline_recovery_test.dart       test/guard_realtime_lifecycle_test.dart       test/guard_workforce_assignment_test.dart
  )
fi

echo "Mastermind preflight passed for $BASE_SHA..$HEAD_SHA"
