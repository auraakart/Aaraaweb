#!/usr/bin/env bash
set -euo pipefail
VERSION="${1:-}"
BRANCH="${2:-release/v${VERSION#V}-staging-candidate}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
command -v gh >/dev/null || { echo 'The release operator needs gh to publish a staging candidate.' >&2; exit 2; }
bash "$SCRIPT_DIR/prepare-staging-candidate.sh" "$VERSION" "$BRANCH"
REPO="${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
# Suspend the old release review before staging changes. The main helper reuses it
# after the final head passes smoke; bot synchronize events cannot waste CI runs.
OLD_MAIN_NUMBERS="$(gh pr list --repo "$REPO" --state open --base main --head staging --json number --jq '.[].number')"
while IFS= read -r number; do
  [ -n "$number" ] || continue
  gh pr close "$number" --repo "$REPO"
done <<< "$OLD_MAIN_NUMBERS"
git push origin "$BRANCH"
EXISTING="$(gh pr list --repo "$REPO" --state open --base staging --head "$BRANCH" --json number --jq '.[0].number // empty')"
if [ -n "$EXISTING" ]; then
  echo "Staging candidate PR #$EXISTING already exists; wait for its required smoke gates."
else
  BODY_FILE="$(mktemp)"
  trap 'rm -f "$BODY_FILE"' EXIT
  printf 'Promote exact develop tree %s with staging, develop and main ancestry.\n\nCandidate: %s\n\nMain remains suspended until exact-candidate API and backup/restore smoke succeed. Independent main approval remains required.\n' \
    "$(git rev-parse "$BRANCH^{tree}")" "$(git rev-parse "$BRANCH")" > "$BODY_FILE"
  gh pr create --repo "$REPO" --base staging --head "$BRANCH" \
    --title "Release V${VERSION#V} exact develop tree to staging" --body-file "$BODY_FILE"
fi
