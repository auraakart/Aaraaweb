#!/usr/bin/env bash
set -euo pipefail

WORKFLOW=".github/workflows/staging-smoke.yml"

test -f "$WORKFLOW"

required_literals=(
  'CANDIDATE_SHA: ${{ github.event.pull_request.head.sha || github.sha }}'
  "Enforce develop-equivalent staging promotion path"
  'git fetch origin develop staging main --no-tags'
  'DEVELOP_SHA="$(git rev-parse refs/remotes/origin/develop)"'
  'STAGING_SHA="$(git rev-parse refs/remotes/origin/staging)"'
  'MAIN_SHA="$(git rev-parse refs/remotes/origin/main)"'
  'DEVELOP_TREE="$(git rev-parse "${DEVELOP_SHA}^{tree}")"'
  'CANDIDATE_TREE="$(git rev-parse "${CANDIDATE_SHA}^{tree}")"'
  'STAGING_TREE="$(git rev-parse "${STAGING_SHA}^{tree}")"'
  'MAIN_TREE="$(git rev-parse "${MAIN_SHA}^{tree}")"'
  'Candidate tree SHA: ${CHECKED_OUT_TREE}'
  'Current develop tree SHA: ${DEVELOP_TREE}'
  'if [ "$SOURCE_REF" = "develop" ] && [ "$CANDIDATE_SHA" != "$DEVELOP_SHA" ]; then'
  'if [ "$SOURCE_REF" != "develop" ] && [ "$CANDIDATE_TREE" != "$DEVELOP_TREE" ]; then'
  'git merge-base --is-ancestor "$TARGET_SHA" "$CANDIDATE_SHA"'
  'if [ "$TARGET_SHA" != "$STAGING_SHA" ]; then'
  'git diff --quiet "$TARGET_SHA" "$MAIN_SHA" -- .'
  'ref: ${{ github.event.pull_request.head.sha || github.sha }}'
  'test "$CHECKED_OUT_SHA" = "$CANDIDATE_SHA"'
  "Publish exact-SHA staging evidence"
  "Upload exact-SHA staging evidence"
  'staging-evidence-${{ github.run_id }}'
)

for literal in "${required_literals[@]}"; do
  if ! grep -Fq "$literal" "$WORKFLOW"; then
    echo "Staging release contract is missing: $literal" >&2
    exit 1
  fi
done

if ! grep -Fq 'develop|release/*-staging-candidate)' "$WORKFLOW"; then
  echo "Staging release contract must allow only develop or exact-tree staging candidates." >&2
  exit 1
fi

if ! grep -Fq 'Release candidate source tree must exactly match current develop.' "$WORKFLOW"; then
  echo "Staging release contract must enforce develop tree equivalence for release candidates." >&2
  exit 1
fi

echo "Staging release contract validated."
