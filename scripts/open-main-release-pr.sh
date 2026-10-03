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

for command_name in git gh; do
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

PR_NUMBER="$(
  gh pr list \
    --repo "$REPO" \
    --state open \
    --base main \
    --head staging \
    --json number \
    --jq '.[0].number // empty'
)"

BODY="$(cat <<EOF
Promote the exact validated ${VERSION} staging tree to main.

- staging: \`${STAGING_SHA}\`
- staging tree: \`${STAGING_TREE}\`
- previous main: \`${MAIN_SHA}\`

This release PR must pass protected main checks and receive approval from someone other than the last pusher. The helper requests \`@${REVIEWER}\` but never approves or merges main.
EOF
)"

if [ -z "$PR_NUMBER" ]; then
  gh pr create \
    --repo "$REPO" \
    --base main \
    --head staging \
    --title "Release Aaraagate ${VERSION} staging to main" \
    --body "$BODY" \
    --reviewer "$REVIEWER"

  PR_NUMBER="$(
    gh pr list \
      --repo "$REPO" \
      --state open \
      --base main \
      --head staging \
      --json number \
      --jq '.[0].number // empty'
  )"
else
  gh pr edit "$PR_NUMBER" --repo "$REPO" --body "$BODY" --add-reviewer "$REVIEWER"
fi

if [ -z "$PR_NUMBER" ]; then
  echo "Main release PR was not found after creation." >&2
  exit 1
fi

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
