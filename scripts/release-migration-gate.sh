#!/usr/bin/env bash
set -euo pipefail

BASE_REF="${1:-}"
HEAD_REF="${2:-}"
EVIDENCE_DIR="${3:-release-evidence}"

if [[ -z "$BASE_REF" || -z "$HEAD_REF" ]]; then
  echo "Usage: $0 <base-ref> <head-ref> [evidence-dir]" >&2
  exit 2
fi

git cat-file -e "${BASE_REF}^{commit}"
git cat-file -e "${HEAD_REF}^{commit}"

mkdir -p "$EVIDENCE_DIR"
MIGRATION_ROOT="services/api/prisma/migrations"
CHANGES_FILE="$(mktemp)"
trap 'rm -f "$CHANGES_FILE"' EXIT

git diff --name-status "$BASE_REF" "$HEAD_REF" -- "$MIGRATION_ROOT" > "$CHANGES_FILE"

non_additive=0
added=0
while IFS=$'\t' read -r status path rest; do
  [[ -z "${status:-}" ]] && continue
  case "$status" in
    A)
      added=$((added + 1))
      ;;
    *)
      echo "Release migration gate: existing migration history must be immutable; found ${status} ${path}${rest:+ -> ${rest}}" >&2
      non_additive=1
      ;;
  esac
done < "$CHANGES_FILE"

{
  echo "# Migration release gate"
  echo
  echo "- Base: ${BASE_REF}"
  echo "- Candidate: ${HEAD_REF}"
  echo "- Added migration files: ${added}"
  echo "- Existing migration files modified/deleted/renamed: ${non_additive}"
  echo
  if [[ -s "$CHANGES_FILE" ]]; then
    echo "## Migration changes"
    echo '```text'
    cat "$CHANGES_FILE"
    echo '```'
  else
    echo "No migration-file changes in this release candidate."
  fi
} > "$EVIDENCE_DIR/migration-gate.md"

if [[ "$non_additive" -ne 0 ]]; then
  exit 1
fi

echo "Migration release gate passed. Existing migration history is immutable."
