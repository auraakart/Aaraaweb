import 'package:aaraagate_guard/theme/aaraagate_guard_theme.dart';
import 'package:aaraagate_guard/widgets/guard_operation_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
  for (final dark in [false, true]) {
    testWidgets('quick action is labelled, keyboard operable and fits 320px at 200% in ${dark ? "dark" : "light"} mode', (tester) async {
      tester.view.physicalSize = const Size(320, 800);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final semantics = tester.ensureSemantics();
      addTearDown(semantics.dispose);
      var calls = 0;
      await tester.pumpWidget(MaterialApp(
        theme: dark ? AaraagateGuardTheme.dark() : AaraagateGuardTheme.light(),
        home: MediaQuery(
          data: const MediaQueryData(textScaler: TextScaler.linear(2), disableAnimations: true),
          child: Scaffold(body: SingleChildScrollView(child: GuardQuickAction(
            icon: Icons.person_add,
            label: 'WALK-IN VISITOR',
            onTap: () => calls++,
          ))),
        ),
      ));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.bySemanticsLabel('WALK-IN VISITOR'), findsOneWidget);
      final action = find.byType(InkWell);
      expect(tester.getSize(action).height, greaterThanOrEqualTo(48));
      expect(tester.getSize(action).width, greaterThanOrEqualTo(48));
      await tester.sendKeyEvent(LogicalKeyboardKey.tab);
      await tester.pump();
      await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      await tester.pumpAndSettle();
      expect(calls, 1);
    });
  }

}
