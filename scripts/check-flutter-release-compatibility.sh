#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKFLOW="$ROOT_DIR/.github/workflows/resident-release-aab.yml"
THEME="$ROOT_DIR/apps/resident/lib/theme/aaraagate_theme.dart"

grep -Fq "flutter-version: '3.32.8'" "$WORKFLOW"
grep -Fq "s/cardTheme: CardTheme(/cardTheme: CardThemeData(/" "$WORKFLOW"
grep -Fq "s/dialogTheme: DialogTheme(/dialogTheme: DialogThemeData(/" "$WORKFLOW"

TEMP_THEME="$(mktemp)"
trap 'rm -f "$TEMP_THEME"' EXIT
cp "$THEME" "$TEMP_THEME"
sed -i 's/cardTheme: CardTheme(/cardTheme: CardThemeData(/' "$TEMP_THEME"
sed -i 's/dialogTheme: DialogTheme(/dialogTheme: DialogThemeData(/' "$TEMP_THEME"

grep -Fq 'cardTheme: CardThemeData(' "$TEMP_THEME"
grep -Fq 'dialogTheme: DialogThemeData(' "$TEMP_THEME"
! grep -Fq 'cardTheme: CardTheme(' "$TEMP_THEME"
! grep -Fq 'dialogTheme: DialogTheme(' "$TEMP_THEME"
