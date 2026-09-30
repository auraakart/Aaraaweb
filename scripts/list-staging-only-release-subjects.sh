#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "Usage: $0 <develop-sha> <staging-target-sha> <main-sha>" >&2
  exit 2
fi

DEVELOP_SHA="$1"
TARGET_SHA="$2"
MAIN_SHA="$3"

for revision in "$DEVELOP_SHA" "$TARGET_SHA" "$MAIN_SHA"; do
  git cat-file -e "${revision}^{commit}"
done

# Only classify history that is unique to staging. Commits already reachable
# from develop or current main are baseline history, not staging-only history.
git log --format='%s' "$TARGET_SHA" --not "$DEVELOP_SHA" "$MAIN_SHA"
