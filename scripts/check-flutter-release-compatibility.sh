#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CI_WORKFLOW="$ROOT_DIR/.github/workflows/ci.yml"
DEMO_WORKFLOW="$ROOT_DIR/.github/workflows/resident-demo-apk.yml"
RELEASE_WORKFLOW="$ROOT_DIR/.github/workflows/resident-release-aab.yml"
RESIDENT_THEME="$ROOT_DIR/apps/resident/lib/theme/aaraagate_theme.dart"
GUARD_THEME="$ROOT_DIR/apps/guard/lib/theme/aaraagate_guard_theme.dart"
RESIDENT_PUBSPEC="$ROOT_DIR/apps/resident/pubspec.yaml"
GUARD_PUBSPEC="$ROOT_DIR/apps/guard/pubspec.yaml"

for workflow in "$CI_WORKFLOW" "$DEMO_WORKFLOW" "$RELEASE_WORKFLOW"; do
  grep -Fq "flutter-version: '3.47.0'" "$workflow"
  ! grep -Fq "flutter-version: '3.24.0'" "$workflow"
  ! grep -Fq "flutter-version: '3.32.8'" "$workflow"
done

for theme in "$RESIDENT_THEME" "$GUARD_THEME"; do
  grep -Fq 'cardTheme: CardThemeData(' "$theme"
  grep -Fq 'dialogTheme: DialogThemeData(' "$theme"
  ! grep -Fq 'cardTheme: CardTheme(' "$theme"
  ! grep -Fq 'dialogTheme: DialogTheme(' "$theme"
done

grep -Fq "flutter: '>=3.47.0'" "$RESIDENT_PUBSPEC"
grep -Fq "flutter: '>=3.47.0'" "$GUARD_PUBSPEC"
! grep -Fq "sed -i 's/cardTheme: CardTheme(/cardTheme: CardThemeData(/'" "$DEMO_WORKFLOW"
! grep -Fq "sed -i 's/cardTheme: CardTheme(/cardTheme: CardThemeData(/'" "$RELEASE_WORKFLOW"
