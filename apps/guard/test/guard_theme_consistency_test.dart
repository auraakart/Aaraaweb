import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:aaraagate_guard/theme/aaraagate_guard_theme.dart';

void main() {
  test('guard theme preserves Aaraagate palette with field-sized controls', () {
    final theme = AaraagateGuardTheme.light();

    expect(AaraagateGuardTheme.brand, const Color(0xFF0EABBE));
    expect(AaraagateGuardTheme.brandDeep, const Color(0xFF05879A));
    expect(AaraagateGuardTheme.ink, const Color(0xFF17323A));
    expect(AaraagateGuardTheme.line, const Color(0xFFD5E8EB));

    expect(AaraagateGuardTokens.radiusSmall, 12);
    expect(AaraagateGuardTokens.radiusControl, 16);
    expect(AaraagateGuardTokens.radiusCard, 20);
    expect(AaraagateGuardTokens.radiusSheet, 24);
    expect(AaraagateGuardTokens.minTouchTarget, 56);
    expect(AaraagateGuardTokens.primaryActionHeight, 64);

    final textButtonMinimum =
        theme.textButtonTheme.style?.minimumSize?.resolve(<WidgetState>{});
    expect(textButtonMinimum, const Size(56, 56));

    expect(theme.chipTheme.selectedColor, theme.colorScheme.primaryContainer);
    expect(theme.chipTheme.checkmarkColor, theme.colorScheme.onPrimaryContainer);
    expect(theme.tooltipTheme.waitDuration, const Duration(milliseconds: 450));
  });

  test('guard dark theme retains shared selected-chip semantics', () {
    final theme = AaraagateGuardTheme.dark();

    expect(theme.chipTheme.selectedColor, theme.colorScheme.primaryContainer);
    expect(theme.chipTheme.checkmarkColor, theme.colorScheme.onPrimaryContainer);
    expect(
      theme.chipTheme.secondaryLabelStyle?.color,
      theme.colorScheme.onPrimaryContainer,
    );
  });
}
