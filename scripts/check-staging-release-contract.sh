#!/usr/bin/env bash
set -euo pipefail

WORKFLOW=".github/workflows/staging-smoke.yml"
BACKUP_WORKFLOW=".github/workflows/backup-restore-smoke.yml"
AUTOMERGE_SCRIPT="scripts/try-staging-auto-merge.sh"

test -f "$WORKFLOW"
test -f "$BACKUP_WORKFLOW"
test -f "$AUTOMERGE_SCRIPT"
bash -n "$AUTOMERGE_SCRIPT"

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
  'STAGING_ONLY_SUBJECTS="$(git log --format='\''%s'\'' "${DEVELOP_SHA}..${TARGET_SHA}")"'
  "node scripts/check-staging-release-history.mjs"
  'superseding stale release-only candidate history'
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

test -f scripts/check-staging-release-history.mjs
node scripts/check-staging-release-history.mjs --self-test
printf '%s\n' 'Release V4.78 exact develop tree to staging (#969)' | node scripts/check-staging-release-history.mjs

if ! grep -Fq "node scripts/check-staging-release-history.mjs" "$WORKFLOW"; then
  echo "Staging release contract must delegate release-history classification to the version-tolerant validator." >&2
  exit 1
fi

echo "Staging release contract validated."

for workflow in "$WORKFLOW" "$BACKUP_WORKFLOW"; do
  for literal in     "actions: read"     "contents: write"     "pull-requests: write"     "Auto-merge exact staging candidate after companion gate"     "bash scripts/try-staging-auto-merge.sh"; do
    if ! grep -Fq "$literal" "$workflow"; then
      echo "Staging auto-merge contract is missing from $workflow: $literal" >&2
      exit 1
    fi
  done
done

for literal in \
  'if [ "$BASE_REF" = "staging" ]; then' \
  "needs.change-scope.outputs.run_backup == 'true'" \
  'ref: ${{ github.event.pull_request.head.sha || github.sha }}' \
  'echo "commit=${CANDIDATE_SHA}"'; do
  if ! grep -Fq "$literal" "$BACKUP_WORKFLOW"; then
    echo "Backup restore staging scope is missing: $literal" >&2
    exit 1
  fi
done
if grep -Fq "paths:" "$BACKUP_WORKFLOW"; then
  echo "Backup restore trigger must not path-filter away staging pull requests; non-staging scope belongs in the scope job." >&2
  exit 1
fi
for literal in   'current_base" = "staging"'   'candidate_tree" = "$develop_tree"'   'staging_sha" = "$EXPECTED_BASE_SHA"'   'COMPANION_WORKFLOW'   'head_sha=$EXPECTED_HEAD_SHA&event=pull_request'   'merge_base_commit.sha'   'merge_method=merge'   'sha="$EXPECTED_HEAD_SHA"'   'commit_title="Release: promote exact develop tree to staging (#$PR_NUMBER)"'; do
  if ! grep -Fq "$literal" "$AUTOMERGE_SCRIPT"; then
    echo "Staging auto-merge script is missing: $literal" >&2
    exit 1
  fi
done
if grep -Fq '/branches/main' "$AUTOMERGE_SCRIPT"; then
  echo "Staging auto-merge must never mutate or promote main." >&2
  exit 1
fi

echo "Staging auto-merge contract validated."
