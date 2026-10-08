import 'package:aaraagate_guard/theme/aaraagate_guard_theme.dart';
import 'package:aaraagate_guard/widgets/guard_operation_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

double contrast(Color a, Color b) {
  final x = a.computeLuminance(), y = b.computeLuminance();
  return ((x > y ? x : y) + .05) / ((x > y ? y : x) + .05);
}

void main() {
  test('Guard label pairs meet AA in both themes', () {
    for (final theme in [AaraagateGuardTheme.light(), AaraagateGuardTheme.dark()]) {
      final c = theme.colorScheme;
      for (final pair in [(c.primary, c.onPrimary), (c.primaryContainer, c.onPrimaryContainer),
        (c.secondaryContainer, c.onSecondaryContainer), (c.errorContainer, c.onErrorContainer),
        (c.surfaceContainerHigh, c.onSurfaceVariant)]) {
        expect(contrast(pair.$1, pair.$2), greaterThanOrEqualTo(4.5));
      }
      expect(contrast(c.outline, c.surface), greaterThanOrEqualTo(3));
    }
  });
  testWidgets('operational feedback respects reduced motion', (tester) async {
    await tester.pumpWidget(MaterialApp(theme: AaraagateGuardTheme.light(), home: const MediaQuery(
      data: MediaQueryData(disableAnimations: true),
      child: Scaffold(body: GuardOperationSurface(child: Text('Ready'))),
    )));
    expect(tester.widget<AnimatedContainer>(find.byType(AnimatedContainer)).duration, Duration.zero);
  });
}
