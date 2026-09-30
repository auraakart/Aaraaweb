#!/usr/bin/env bash
set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN is required}"
: "${REPOSITORY:?REPOSITORY is required}"
: "${EXPECTED_CANDIDATE_SHA:?EXPECTED_CANDIDATE_SHA is required}"

api(){
  gh api -H "Accept: application/vnd.github+json" "$@"
}

owner="${REPOSITORY%%/*}"
staging="$(api "/repos/$REPOSITORY/branches/staging")"
main="$(api "/repos/$REPOSITORY/branches/main")"
candidate="$(api "/repos/$REPOSITORY/git/commits/$EXPECTED_CANDIDATE_SHA")"

staging_sha="$(jq -r '.commit.sha' <<<"$staging")"
main_sha="$(jq -r '.commit.sha' <<<"$main")"
staging_tree="$(jq -r '.commit.commit.tree.sha' <<<"$staging")"
main_tree="$(jq -r '.commit.commit.tree.sha' <<<"$main")"
candidate_tree="$(jq -r '.tree.sha' <<<"$candidate")"

if [ "$staging_tree" != "$candidate_tree" ]; then
  echo "Staging has not reached the exact tested candidate yet; main promotion PR creation is deferred."
  exit 0
fi

if [ "$staging_tree" = "$main_tree" ]; then
  echo "Main already has the exact staging source tree; no promotion PR is needed."
  exit 0
fi

existing="$(api --method GET "/repos/$REPOSITORY/pulls" \
  -f state=open \
  -f head="$owner:staging" \
  -f base=main \
  -f per_page=100)"
existing_number="$(jq -r '.[0].number // empty' <<<"$existing")"

if [ -n "$existing_number" ]; then
  existing_author="$(jq -r '.[0].user.login // empty' <<<"$existing")"
  if [ "$existing_author" != "github-actions[bot]" ]; then
    echo "Open staging -> main PR #$existing_number is authored by $existing_author." >&2
    echo "Close it before release orchestration creates the bot-authored PR required for independent human approval." >&2
    exit 1
  fi
  echo "Bot-authored main promotion PR #$existing_number already exists."
  exit 0
fi

subject="$(jq -r '.message' <<<"$candidate" | head -n 1)"
version="$(grep -oE 'V[0-9]+(\.[0-9]+)+' <<<"$subject" | head -n 1 || true)"
release_label="${version:-validated staging}"

body="$(cat <<EOF
Promote the exact validated staging source tree to main.

- staging SHA: `$staging_sha`
- staging tree: `$staging_tree`
- tested candidate SHA: `$EXPECTED_CANDIDATE_SHA`
- current main rollback SHA: `$main_sha`
- current main tree: `$main_tree`

This PR is intentionally created by GitHub Actions so the repository's independent-review rule can be satisfied by a human reviewer. Main promotion remains manual: protected checks and explicit human approval are required before merge. This controller never merges main.
EOF
)"

set +e
created="$(api --method POST "/repos/$REPOSITORY/pulls" \
  -f title="Release Aaraagate $release_label staging to main" \
  -f head=staging \
  -f base=main \
  -f body="$body" 2>/tmp/aaraagate-main-pr-create.err)"
create_status=$?
set -e

if [ "$create_status" -ne 0 ]; then
  raced="$(api --method GET "/repos/$REPOSITORY/pulls" \
    -f state=open \
    -f head="$owner:staging" \
    -f base=main \
    -f per_page=100)"
  raced_number="$(jq -r '.[0].number // empty' <<<"$raced")"
  raced_author="$(jq -r '.[0].user.login // empty' <<<"$raced")"
  if [ -n "$raced_number" ] && [ "$raced_author" = "github-actions[bot]" ]; then
    echo "Main promotion PR #$raced_number was created by the companion release controller."
    exit 0
  fi
  cat /tmp/aaraagate-main-pr-create.err >&2
  exit "$create_status"
fi

created_number="$(jq -r '.number' <<<"$created")"
created_author="$(jq -r '.user.login' <<<"$created")"
test "$created_author" = "github-actions[bot]"
echo "Created bot-authored main promotion PR #$created_number for staging $staging_sha."
