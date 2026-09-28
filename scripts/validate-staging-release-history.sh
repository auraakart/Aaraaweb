#!/usr/bin/env bash
set -euo pipefail

while IFS= read -r subject; do
  [ -z "$subject" ] && continue
  normalized_subject="$(printf '%s' "$subject" | tr '[:upper:]' '[:lower:]')"
  case "$normalized_subject" in
    release:*|release\(v*\):*|chore\(release\):*) ;;
    *)
      echo "Staging contains non-release-only history that cannot be superseded automatically: $subject" >&2
      exit 1
      ;;
  esac
done
