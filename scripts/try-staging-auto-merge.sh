#!/usr/bin/env bash
set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN is required}"
: "${REPOSITORY:?REPOSITORY is required}"
: "${PR_NUMBER:?PR_NUMBER is required}"
: "${EXPECTED_HEAD_SHA:?EXPECTED_HEAD_SHA is required}"
: "${EXPECTED_BASE_SHA:?EXPECTED_BASE_SHA is required}"
: "${COMPANION_WORKFLOW:?COMPANION_WORKFLOW is required}"
: "${COMPANION_JOB:?COMPANION_JOB is required}"

api(){
  gh api -H "Accept: application/vnd.github+json" "$@"
}

current="$(api "/repos/$REPOSITORY/pulls/$PR_NUMBER")"
current_head="$(jq -r '.head.sha' <<<"$current")"
current_base="$(jq -r '.base.ref' <<<"$current")"
current_base_sha="$(jq -r '.base.sha' <<<"$current")"
current_state="$(jq -r '.state' <<<"$current")"
current_draft="$(jq -r '.draft' <<<"$current")"
current_repo="$(jq -r '.head.repo.full_name' <<<"$current")"
current_ref="$(jq -r '.head.ref' <<<"$current")"

if [ "$current_repo" != "$REPOSITORY" ]; then
  echo "Staging auto-merge is disabled for forked pull requests."
  exit 0
fi

test "$current_head" = "$EXPECTED_HEAD_SHA"
test "$current_base" = "staging"
test "$current_base_sha" = "$EXPECTED_BASE_SHA"
test "$current_state" = "open"
test "$current_draft" = "false"

case "$current_ref" in
  develop|release/*-staging-candidate) ;;
  *)
    echo "Staging auto-merge source is outside the approved promotion path: $current_ref" >&2
    exit 1
    ;;
esac

develop="$(api "/repos/$REPOSITORY/branches/develop")"
staging="$(api "/repos/$REPOSITORY/branches/staging")"
candidate="$(api "/repos/$REPOSITORY/git/commits/$EXPECTED_HEAD_SHA")"

develop_sha="$(jq -r '.commit.sha' <<<"$develop")"
develop_tree="$(jq -r '.commit.commit.tree.sha' <<<"$develop")"
staging_sha="$(jq -r '.commit.sha' <<<"$staging")"
candidate_tree="$(jq -r '.tree.sha' <<<"$candidate")"

test "$staging_sha" = "$EXPECTED_BASE_SHA"
test "$candidate_tree" = "$develop_tree"

if [ "$current_ref" = "develop" ]; then
  test "$EXPECTED_HEAD_SHA" = "$develop_sha"
else
  ancestry="$(api "/repos/$REPOSITORY/compare/$EXPECTED_BASE_SHA...$EXPECTED_HEAD_SHA")"
  test "$(jq -r '.behind_by' <<<"$ancestry")" = "0"
  test "$(jq -r '.merge_base_commit.sha' <<<"$ancestry")" = "$EXPECTED_BASE_SHA"
fi

runs="$(api "/repos/$REPOSITORY/actions/runs?head_sha=$EXPECTED_HEAD_SHA&event=pull_request&per_page=100")"
companion="$(jq -c --arg name "$COMPANION_WORKFLOW" '[.workflow_runs[] | select(.name == $name)] | sort_by(.run_number) | last // empty' <<<"$runs")"

if [ -z "$companion" ]; then
  echo "Companion workflow '$COMPANION_WORKFLOW' has not started for $EXPECTED_HEAD_SHA; leaving PR open."
  exit 0
fi

companion_run_id="$(jq -r '.id' <<<"$companion")"
companion_jobs="$(api "/repos/$REPOSITORY/actions/runs/$companion_run_id/jobs?per_page=100")"
companion_job="$(jq -c --arg name "$COMPANION_JOB" '[.jobs[] | select(.name == $name)] | sort_by(.id) | last // empty' <<<"$companion_jobs")"

if [ -z "$companion_job" ]; then
  echo "Companion job '$COMPANION_JOB' has not started in workflow '$COMPANION_WORKFLOW'; leaving PR open."
  exit 0
fi

companion_status="$(jq -r '.status' <<<"$companion_job")"
companion_conclusion="$(jq -r '.conclusion // ""' <<<"$companion_job")"
if [ "$companion_status" != "completed" ] || [ "$companion_conclusion" != "success" ]; then
  echo "Companion job '$COMPANION_JOB' is $companion_status/$companion_conclusion; leaving PR open for the other release controller to retry."
  exit 0
fi

latest="$(api "/repos/$REPOSITORY/pulls/$PR_NUMBER")"
test "$(jq -r '.state' <<<"$latest")" = "open"
test "$(jq -r '.head.sha' <<<"$latest")" = "$EXPECTED_HEAD_SHA"
test "$(jq -r '.base.sha' <<<"$latest")" = "$EXPECTED_BASE_SHA"

set +e
api --method PUT "/repos/$REPOSITORY/pulls/$PR_NUMBER/merge" \
  -f merge_method=merge \
  -f sha="$EXPECTED_HEAD_SHA" \
  -f commit_title="Release: promote exact develop tree to staging (#$PR_NUMBER)" \
  -f commit_message="Automatically merged after Staging smoke and Backup restore smoke succeeded for exact candidate $EXPECTED_HEAD_SHA. Main is not changed by this workflow." \
  >/tmp/aaraagate-staging-merge.json 2>/tmp/aaraagate-staging-merge.err
merge_status=$?
set -e

if [ "$merge_status" -ne 0 ]; then
  latest_after_race="$(api "/repos/$REPOSITORY/pulls/$PR_NUMBER")"
  if [ "$(jq -r '.state' <<<"$latest_after_race")" = "closed" ] \
    && [ "$(jq -r '.merged_at // ""' <<<"$latest_after_race")" != "" ] \
    && [ "$(jq -r '.head.sha' <<<"$latest_after_race")" = "$EXPECTED_HEAD_SHA" ]; then
    echo "Staging PR #$PR_NUMBER was already merged at the exact tested head by the companion release controller."
    exit 0
  fi
  cat /tmp/aaraagate-staging-merge.err >&2
  exit "$merge_status"
fi

test "$(jq -r '.merged' /tmp/aaraagate-staging-merge.json)" = "true"
echo "Merged staging PR #$PR_NUMBER at exact tested head $EXPECTED_HEAD_SHA after both release gates passed."
