#!/usr/bin/env bash
set -euo pipefail

WORKFLOW=".github/workflows/staging-smoke.yml"
BACKUP_WORKFLOW=".github/workflows/backup-restore-smoke.yml"
AUTOMERGE_SCRIPT="scripts/try-staging-auto-merge.sh"
HISTORY_SUBJECT_SCRIPT="scripts/list-staging-only-release-subjects.sh"
MAIN_PR_SCRIPT="scripts/ensure-main-promotion-pr.sh"

test -f "$WORKFLOW"
test -f "$BACKUP_WORKFLOW"
test -f "$AUTOMERGE_SCRIPT"
test -f "$HISTORY_SUBJECT_SCRIPT"
test -f "$MAIN_PR_SCRIPT"
bash -n "$AUTOMERGE_SCRIPT"
bash -n "$HISTORY_SUBJECT_SCRIPT"
bash -n "$MAIN_PR_SCRIPT"

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
  'STAGING_ONLY_SUBJECTS="$(bash scripts/list-staging-only-release-subjects.sh "$DEVELOP_SHA" "$TARGET_SHA" "$MAIN_SHA")"'
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

# Regression: history inherited from current main must not be classified as
# staging-only, while a genuinely staging-only product commit must still fail.
ROOT_DIR="$(pwd)"
HISTORY_TEST_REPO="$(mktemp -d)"
trap 'rm -rf "$HISTORY_TEST_REPO"' EXIT

git -C "$HISTORY_TEST_REPO" init -q
git -C "$HISTORY_TEST_REPO" config user.name "Aaraagate CI"
git -C "$HISTORY_TEST_REPO" config user.email "ci@aaraagate.invalid"
git -C "$HISTORY_TEST_REPO" commit --allow-empty -qm "feat: common baseline"
COMMON_SHA="$(git -C "$HISTORY_TEST_REPO" rev-parse HEAD)"

git -C "$HISTORY_TEST_REPO" checkout -qb develop
git -C "$HISTORY_TEST_REPO" commit --allow-empty -qm "feat: current develop"

git -C "$HISTORY_TEST_REPO" checkout -qb main "$COMMON_SHA"
git -C "$HISTORY_TEST_REPO" commit --allow-empty -qm "Merge pull request #869 from auraakart/staging"

git -C "$HISTORY_TEST_REPO" checkout -qb staging
git -C "$HISTORY_TEST_REPO" commit --allow-empty -qm "Release V4.80.10 exact develop tree to staging"

STAGING_ONLY_SUBJECTS="$(
  cd "$HISTORY_TEST_REPO"
  bash "$ROOT_DIR/$HISTORY_SUBJECT_SCRIPT" develop staging main
)"
if [ "$STAGING_ONLY_SUBJECTS" != "Release V4.80.10 exact develop tree to staging" ]; then
  echo "Staging-only history must exclude commits already reachable from current main." >&2
  printf 'Observed subjects:\n%s\n' "$STAGING_ONLY_SUBJECTS" >&2
  exit 1
fi
printf '%s\n' "$STAGING_ONLY_SUBJECTS" | node "$ROOT_DIR/scripts/check-staging-release-history.mjs"

git -C "$HISTORY_TEST_REPO" commit --allow-empty -qm "feat: staging-only product change"
if (
  cd "$HISTORY_TEST_REPO"
  bash "$ROOT_DIR/$HISTORY_SUBJECT_SCRIPT" develop staging main
) | node "$ROOT_DIR/scripts/check-staging-release-history.mjs"; then
  echo "A genuine staging-only product commit must still be rejected." >&2
  exit 1
fi

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

for literal in \
  'staging-auto-merge:' \
  'needs: staging-smoke' \
  'needs.staging-smoke.result == '\''success'\''' \
  'COMPANION_JOB: PostgreSQL backup restore drill'; do
  if ! grep -Fq "$literal" "$WORKFLOW"; then
    echo "Staging protected-check orchestration is missing from $WORKFLOW: $literal" >&2
    exit 1
  fi
done

for literal in \
  'staging-auto-merge:' \
  'needs: backup-restore' \
  'needs.backup-restore.result == '\''success'\''' \
  'COMPANION_JOB: Staging API smoke'; do
  if ! grep -Fq "$literal" "$BACKUP_WORKFLOW"; then
    echo "Staging protected-check orchestration is missing from $BACKUP_WORKFLOW: $literal" >&2
    exit 1
  fi
done

for literal in \
  'COMPANION_JOB' \
  '/actions/runs/$companion_run_id/jobs?per_page=100' \
  'Companion job' \
  'already merged at the exact tested head by the companion release controller'; do
  if ! grep -Fq "$literal" "$AUTOMERGE_SCRIPT"; then
    echo "Staging race-safe controller is missing: $literal" >&2
    exit 1
  fi
done

if grep -Fq "if: github.event_name == 'pull_request' && github.base_ref == 'staging' && success()" "$WORKFLOW" \
  || grep -Fq "if: github.event_name == 'pull_request' && github.base_ref == 'staging' && success()" "$BACKUP_WORKFLOW"; then
  echo "Staging auto-merge must run only in downstream jobs after protected checks complete." >&2
  exit 1
fi

echo "Staging protected-check orchestration contract validated."


for workflow in "$WORKFLOW" "$BACKUP_WORKFLOW"; do
  for literal in \
    "Ensure bot-authored main promotion PR" \
    "bash scripts/ensure-main-promotion-pr.sh"; do
    if ! grep -Fq "$literal" "$workflow"; then
      echo "Main promotion PR orchestration is missing from $workflow: $literal" >&2
      exit 1
    fi
  done
done

for literal in \
  'EXPECTED_CANDIDATE_SHA' \
  '/branches/staging' \
  '/branches/main' \
  '-f head=staging' \
  '-f base=main' \
  'github-actions[bot]' \
  'independent human approval' \
  'This controller never merges main.'; do
  if ! grep -Fq -- "$literal" "$MAIN_PR_SCRIPT"; then
    echo "Main promotion PR controller is missing: $literal" >&2
    exit 1
  fi
done

if grep -Fq '/merge' "$MAIN_PR_SCRIPT" || grep -Fq 'merge_method' "$MAIN_PR_SCRIPT"; then
  echo "Main promotion PR controller must never merge main." >&2
  exit 1
fi

echo "Bot-authored main promotion PR contract validated."
