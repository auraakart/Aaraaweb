int residentQuickActionColumns({
  required double maxWidth,
  required double textScale,
}) {
  if (maxWidth < 340 || textScale >= 1.3) return 1;
  return 2;
}
