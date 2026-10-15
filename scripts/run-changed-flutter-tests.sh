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
for path in "${changed[@]}"; do
  if [[ "$path" == *_test.dart ]] && [ -f "$path" ]; then tests+=("${path#apps/$APP/}"); fi
done
if [ "${#tests[@]}" -eq 0 ]; then echo "No changed $APP widget tests; broad regression remains required."; exit 0; fi
(cd "apps/$APP" && flutter test "${tests[@]}")
