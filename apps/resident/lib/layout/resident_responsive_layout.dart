int residentQuickActionColumns({
  required double maxWidth,
  required double textScale,
}) {
  if (maxWidth < 340 || textScale >= 1.3) return 1;
  return 2;
}

/// Home-only compact icon-grid. Retains the wider touch-friendly layout when
/// users increase text scaling, while preserving other modules' columns.
int residentCompactHomeQuickActionColumns({
  required double maxWidth,
  required double textScale,
}) => maxWidth >= 280 && textScale <= 1.15
    ? 4
    : residentQuickActionColumns(maxWidth: maxWidth, textScale: textScale);
