import 'package:aaraagate_guard/theme/aaraagate_guard_theme.dart';
import 'package:aaraagate_guard/widgets/guard_operation_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('operation surface exposes a concise screen-reader summary', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: AaraagateGuardTheme.light(),
      home: const Scaffold(
        body: GuardOperationSurface(
          semanticLabel: 'Security shift active at Main gate',
          child: Text('Main gate'),
        ),
      ),
    ));

    expect(
      find.byWidgetPredicate((widget) => widget is Semantics && widget.properties.label == 'Security shift active at Main gate'),
      findsOneWidget,
    );
  });

  testWidgets('offline status is announced independently of colour', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: AaraagateGuardTheme.dark(),
      home: const Scaffold(
        body: GuardStatusPill(label: 'OFFLINE', tone: GuardStatusTone.offline),
      ),
    ));

    expect(
      find.byWidgetPredicate((widget) => widget is Semantics && widget.properties.label == 'Status: OFFLINE'),
      findsOneWidget,
    );
    expect(find.text('OFFLINE'), findsOneWidget);
  });
}
