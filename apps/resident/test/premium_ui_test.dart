import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:aaraagate_resident/theme/aaraagate_theme.dart';
import 'package:aaraagate_resident/widgets/premium_ui.dart';

void main() {
  testWidgets('premium surface exposes one semantic action and press feedback', (tester) async {
    var taps = 0;
    await tester.pumpWidget(MaterialApp(
      theme: AaraagateTheme.light(),
      home: Scaffold(
        body: PremiumSurface(
          semanticLabel: 'Open society notice',
          onTap: () => taps += 1,
          child: const Text('Water maintenance'),
        ),
      ),
    ));

    final action = tester.widget<Semantics>(find.byWidgetPredicate(
      (widget) => widget is Semantics && widget.properties.label == 'Open society notice',
    ));
    expect(action.properties.button, isTrue);
    await tester.tap(find.text('Water maintenance'));
    await tester.pumpAndSettle();
    expect(taps, 1);
    expect(find.byType(AnimatedScale), findsOneWidget);
  });

  testWidgets('status pill announces its status without relying on colour', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: AaraagateTheme.dark(),
      home: const Scaffold(
        body: AaraagateStatusPill(label: 'OVERDUE', tone: AaraagateStatusTone.danger),
      ),
    ));

    expect(
      find.byWidgetPredicate((widget) => widget is Semantics && widget.properties.label == 'Status: OVERDUE'),
      findsOneWidget,
    );
    expect(find.text('OVERDUE'), findsOneWidget);
  });
}
