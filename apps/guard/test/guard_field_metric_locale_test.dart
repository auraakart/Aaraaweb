import 'package:aaraagate_guard/localization/guard_strings.dart';
import 'package:aaraagate_guard/theme/aaraagate_guard_theme.dart';
import 'package:aaraagate_guard/widgets/guard_field_metric.dart';
import 'package:aaraagate_guard/widgets/guard_operation_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const codes = <String>['en', 'hi', 'ta', 'te', 'kn', 'ml', 'mr', 'bn'];
  for (final code in codes) {
    for (final dark in <bool>[false, true]) {
      testWidgets(
        'Guard count labels and single spoken values: $code dark=$dark 320dp 200%',
        (tester) async {
          tester.view.physicalSize = const Size(320, 900);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          final semantics = tester.ensureSemantics();
          final strings = GuardStrings(code);
          final labels = [
            strings.get('fieldOverstays'),
            strings.get('fieldWatchlist'),
            strings.get('fieldOpenPasses'),
            strings.get('fieldIncidents'),
            strings.get('fieldCheckpoints'),
          ];
          await tester.pumpWidget(MaterialApp(
            theme: dark ? AaraagateGuardTheme.dark() : AaraagateGuardTheme.light(),
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context).copyWith(
                textScaler: const TextScaler.linear(2),
                disableAnimations: true,
              ),
              child: child!,
            ),
            home: Scaffold(body: SingleChildScrollView(child: Padding(
              padding: const EdgeInsets.all(16),
              child: GuardOperationSurface(child: Wrap(
                spacing: 10, runSpacing: 10,
                children: [
                  for (final label in labels)
                    GuardFieldMetric(label: label, value: 7),
                ],
              )),
            ))),
          ));
          await tester.pumpAndSettle();
          final metrics = find.byType(GuardFieldMetric);
          expect(metrics, findsNWidgets(5));
          for (final label in labels) {
            expect(label, isNotEmpty);
            expect(find.text(label), findsOneWidget);
            expect(find.bySemanticsLabel('$label: 7'), findsOneWidget);
          }
          final first = tester.getTopLeft(metrics.first);
          final second = tester.getTopLeft(metrics.at(1));
          expect(second.dy, greaterThan(first.dy));
          expect(tester.takeException(), isNull);
          semantics.dispose();
        },
      );
    }
  }
}
