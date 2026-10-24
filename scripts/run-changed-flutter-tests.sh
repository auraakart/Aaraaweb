#!/usr/bin/env bash
set -euo pipefail
APP="${1:-}"
BASE_SHA="${2:-}"
HEAD_SHA="${3:-}"
case "$APP" in resident|guard) ;; *) echo 'App must be resident or guard.' >&2; exit 2 ;; esac
[ -n "$BASE_SHA" ] && [ -n "$HEAD_SHA" ] || { echo 'Base and head commits are required.' >&2; exit 2; }
git rev-parse --verify "$BASE_SHA^{commit}" >/dev/null
git rev-parse --verify "$HEAD_SHA^{commit}" >/dev/null
mapfile -t changed < <(git diff --diff-filter=AM --name-only "$BASE_SHA" "$HEAD_SHA" -- "apps/$APP/test/")
tests=()
declare -A selected=()
add_test() {
  local target="$1"
  if [ -f "apps/$APP/$target" ] && [ -z "${selected[$target]:-}" ]; then
    tests+=("$target")
    selected["$target"]=1
  fi
}
for path in "${changed[@]}"; do
  if [[ "$path" == *_test.dart ]]; then add_test "${path#apps/$APP/}"; fi
done
# Repository/transport changes can invalidate an unchanged critical test fixture.
# Exercise the affected billing/helpdesk flows early; retain the full suite below.
if [ "$APP" = resident ]; then
  while IFS= read -r path; do
    case "$path" in
      apps/resident/lib/screens/helpdesk_screen.dart|apps/resident/lib/widgets/history_search_dialog.dart|apps/resident/lib/data/resident_repository.dart|apps/resident/lib/data/resident_history.dart)
        add_test test/helpdesk_service_recovery_test.dart
        add_test test/helpdesk_refresh_history_test.dart
        add_test test/property_scoped_screens_test.dart ;;
    esac
    case "$path" in
      apps/resident/lib/screens/billing_screen.dart|apps/resident/lib/widgets/billing_*.dart|apps/resident/lib/data/resident_repository.dart|apps/resident/lib/data/resident_history.dart)
        add_test test/billing_screen_test.dart
        add_test test/property_scoped_screens_test.dart ;;
    esac
  done < <(git diff --diff-filter=AM --name-only "$BASE_SHA" "$HEAD_SHA" -- apps/resident/lib/)
fi
if [ "${#tests[@]}" -eq 0 ]; then echo "No changed $APP widget tests; broad regression remains required."; exit 0; fi
(cd "apps/$APP" && flutter test "${tests[@]}")
