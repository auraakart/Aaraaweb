#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-}"
REVIEWER="${MAIN_RELEASE_REVIEWER:-ganeshcatch-ux}"

if [ -z "$VERSION" ]; then
  echo "Usage: scripts/open-main-release-pr.sh <version>" >&2
  exit 2
fi

case "$VERSION" in
  V*) ;;
  *) VERSION="V$VERSION" ;;
esac

for command_name in git gh node; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "$command_name is required to open a protected main release PR." >&2
    exit 2
  }
done

git fetch origin main staging --no-tags

STAGING_SHA="$(git rev-parse origin/staging)"
MAIN_SHA="$(git rev-parse origin/main)"
STAGING_TREE="$(git rev-parse "${STAGING_SHA}^{tree}")"
REPO="${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"

if ! git merge-base --is-ancestor "$MAIN_SHA" "$STAGING_SHA"; then
  echo 'Staging is behind main. Prepare the candidate with scripts/prepare-staging-candidate.sh before promotion.' >&2
  exit 1
fi
node scripts/check-staging-promotion-evidence.mjs "$REPO" "$STAGING_SHA"
# Re-check both refs after API verification; never open a release against a moving baseline.
git fetch origin main staging --no-tags
[ "$(git rev-parse origin/staging)" = "$STAGING_SHA" ] && [ "$(git rev-parse origin/main)" = "$MAIN_SHA" ] || {
  echo 'Release baseline moved. Re-run the helper with the final staging head.' >&2; exit 1;
}

PR_NUMBER="$(
  gh pr list \
    --repo "$REPO" \
    --state open \
    --base main \
    --head staging \
    --json number \
    --jq '.[0].number // empty'
)"

BODY_FILE="$(mktemp)"
trap 'rm -f "$BODY_FILE"' EXIT
cat > "$BODY_FILE" <<EOF
Promote the exact validated ${VERSION} staging tree to main.

- staging: \`${STAGING_SHA}\`
- staging tree: \`${STAGING_TREE}\`
- previous main: \`${MAIN_SHA}\`

This release PR must pass protected main checks and receive approval from someone other than the last pusher. The helper requests \`@${REVIEWER}\` but never approves or merges main.
EOF

STARTED_CHECKS=false
if [ -z "$PR_NUMBER" ]; then
  CLOSED_NUMBER="$(gh pr list --repo "$REPO" --state closed --base main --head staging \
    --json number,mergedAt --jq '[.[] | select(.mergedAt == null)][0].number // empty')"
  if [ -n "$CLOSED_NUMBER" ]; then
    gh pr reopen "$CLOSED_NUMBER" --repo "$REPO"
    PR_NUMBER="$CLOSED_NUMBER"
    STARTED_CHECKS=true
  fi
fi

if [ -z "$PR_NUMBER" ]; then
  gh pr create \
    --repo "$REPO" \
    --base main \
    --head staging \
    --title "Release Aaraagate ${VERSION} staging to main" \
    --body-file "$BODY_FILE" \
    --reviewer "$REVIEWER"

  STARTED_CHECKS=true
  PR_NUMBER="$(
    gh pr list \
      --repo "$REPO" \
      --state open \
      --base main \
      --head staging \
      --json number \
      --jq '.[0].number // empty'
  )"
fi

if [ -z "$PR_NUMBER" ]; then
  echo "Main release PR was not found after creation." >&2
  exit 1
fi

gh pr edit "$PR_NUMBER" --repo "$REPO" --title "Release Aaraagate ${VERSION} staging to main" \
  --body-file "$BODY_FILE" --add-reviewer "$REVIEWER"

# GitHub pauses synchronize runs initiated by the automation account. Only refresh
# a confirmed action_required run at this exact head through the release operator.
# Never repeat successful/pending checks or submit an approval.
BLOCKED="$(gh api "/repos/$REPO/actions/runs?head_sha=$STAGING_SHA&event=pull_request&per_page=100" \
  --jq '[.workflow_runs | group_by(.workflow_id)[] | max_by(.id) | select(.conclusion == "action_required")] | length')"
if [ "$STARTED_CHECKS" = "false" ] && [ "$BLOCKED" -gt 0 ]; then
  gh pr close "$PR_NUMBER" --repo "$REPO"
  gh pr reopen "$PR_NUMBER" --repo "$REPO"
fi
[ "$(gh pr view "$PR_NUMBER" --repo "$REPO" --json headRefOid --jq .headRefOid)" = "$STAGING_SHA" ] || {
  echo 'Main PR head changed during preparation; re-verify staging before review.' >&2; exit 1;
}

# Idempotently route the established independent reviewer even when an open PR was reused.
gh pr edit "$PR_NUMBER" --repo "$REPO" --add-reviewer "$REVIEWER"

REQUESTED_REVIEWERS="$(
  gh pr view "$PR_NUMBER" \
    --repo "$REPO" \
    --json reviewRequests \
    --jq '.reviewRequests[].login'
)"

if ! grep -Fxq "$REVIEWER" <<<"$REQUESTED_REVIEWERS"; then
  echo "Independent reviewer @$REVIEWER is not requested on PR #$PR_NUMBER." >&2
  exit 1
fi

echo "Main release PR #$PR_NUMBER is open from staging with @$REVIEWER requested."
echo "No merge was attempted; branch protection and independent approval remain authoritative."
