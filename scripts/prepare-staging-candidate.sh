#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-}"
[[ "$VERSION" =~ ^V?[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Usage: scripts/prepare-staging-candidate.sh <version>' >&2; exit 2; }
VERSION="${VERSION#V}"
BRANCH="${2:-release/v${VERSION}-staging-candidate}"
case "$BRANCH" in release/v"$VERSION"-staging-candidate|release/v"$VERSION"-*-staging-candidate) ;; *) echo 'Candidate branch must use this release version and end with -staging-candidate.' >&2; exit 2 ;; esac
git check-ref-format --branch "$BRANCH" >/dev/null
git fetch origin develop staging main --no-tags
DEVELOP_SHA="$(git rev-parse origin/develop)"
STAGING_SHA="$(git rev-parse origin/staging)"
MAIN_SHA="$(git rev-parse origin/main)"
TREE="$(git rev-parse "${DEVELOP_SHA}^{tree}")"
RELEASE_VERSION="$(git show "$DEVELOP_SHA:package.json" | node -e 'let data=""; process.stdin.on("data", chunk => data += chunk); process.stdin.on("end", () => process.stdout.write(JSON.parse(data).version));')"
[ "$RELEASE_VERSION" = "$VERSION" ] || { echo 'Candidate label must match the develop release identity.' >&2; exit 1; }

# Capture all release ancestry before publishing a candidate or opening main.
parents=(-p "$STAGING_SHA")
if [ "$DEVELOP_SHA" != "$STAGING_SHA" ]; then parents+=(-p "$DEVELOP_SHA"); fi
if [ "$MAIN_SHA" != "$STAGING_SHA" ] && [ "$MAIN_SHA" != "$DEVELOP_SHA" ]; then parents+=(-p "$MAIN_SHA"); fi
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  CANDIDATE="$(git rev-parse "refs/heads/$BRANCH")"
else
  CANDIDATE="$(git commit-tree "$TREE" "${parents[@]}" -m "Release: V${VERSION} exact develop tree staging candidate")"
  git update-ref "refs/heads/$BRANCH" "$CANDIDATE" "$(printf '%040d' 0)"
fi
[ "$(git rev-parse "${CANDIDATE}^{tree}")" = "$TREE" ] || { echo 'Existing candidate differs from current develop; use a fresh release branch.' >&2; exit 1; }
for baseline in "$STAGING_SHA" "$DEVELOP_SHA" "$MAIN_SHA"; do
  git merge-base --is-ancestor "$baseline" "$CANDIDATE" || { echo 'Candidate ancestry is stale; prepare a fresh candidate before promotion.' >&2; exit 1; }
done
printf 'Branch: %s\nCandidate: %s\nTree: %s\nDevelop: %s\nStaging: %s\nMain: %s\n' "$BRANCH" "$CANDIDATE" "$TREE" "$DEVELOP_SHA" "$STAGING_SHA" "$MAIN_SHA"
echo 'Publish this branch through the protected staging PR. Open main only after staging merges and both smoke workflows pass.'
