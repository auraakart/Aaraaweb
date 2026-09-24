#!/usr/bin/env bash
set -euo pipefail

WORKFLOW=".github/workflows/staging-smoke.yml"

test -f "$WORKFLOW"

required_literals=(
  'CANDIDATE_SHA: ${{ github.event.pull_request.head.sha || github.sha }}'
  "Enforce develop to staging promotion path"
  'git fetch origin develop staging main --no-tags'
  'DEVELOP_SHA="$(git rev-parse refs/remotes/origin/develop)"'
  'STAGING_SHA="$(git rev-parse refs/remotes/origin/staging)"'
  'MAIN_SHA="$(git rev-parse refs/remotes/origin/main)"'
  'if [ "$CANDIDATE_SHA" != "$DEVELOP_SHA" ]; then'
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

if ! grep -Fq 'if [ "$SOURCE_REF" != "develop" ] || [ "$TARGET_REF" != "staging" ]; then' "$WORKFLOW"; then
  echo "Staging release contract must restrict promotions to develop -> staging." >&2
  exit 1
fi

echo "Staging release contract validated."
