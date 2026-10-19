import 'package:aaraagate_guard/theme/aaraagate_guard_theme.dart';
import 'package:aaraagate_guard/widgets/guard_field_metric.dart';
import 'package:aaraagate_guard/widgets/guard_operation_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  for (final dark in <bool>[false, true]) {
    for (final scale in <double>[1, 2]) {
      for (final count in <int>[0, 135]) {
        testWidgets(
          'Field metrics keep counts legible and spoken: dark=$dark scale=$scale count=$count',
          (tester) async {
            tester.view.physicalSize = Size(scale == 2 ? 320 : 390, 900);
            tester.view.devicePixelRatio = 1;
            addTearDown(tester.view.resetPhysicalSize);
            addTearDown(tester.view.resetDevicePixelRatio);
            final semantics = tester.ensureSemantics();

            await tester.pumpWidget(MaterialApp(
              theme: dark
                  ? AaraagateGuardTheme.dark()
                  : AaraagateGuardTheme.light(),
              builder: (context, child) => MediaQuery(
                data: MediaQuery.of(context).copyWith(
                  textScaler: TextScaler.linear(scale),
                  disableAnimations: true,
                ),
                child: child!,
              ),
              home: Scaffold(
                body: SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: GuardOperationSurface(
                      child: Wrap(
                        spacing: 10,
                        runSpacing: 10,
                        children: [
                          GuardFieldMetric(label: 'Overstays', value: count),
                          const GuardFieldMetric(
                            label: 'Open passes',
                            value: 7,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ));
            await tester.pumpAndSettle();

            final first = find.byType(GuardFieldMetric).first;
            final second = find.byType(GuardFieldMetric).last;
            expect(find.text('Overstays'), findsOneWidget);
            expect(find.text('Open passes'), findsOneWidget);
            expect(find.bySemanticsLabel('Overstays: $count'), findsOneWidget);
            expect(find.bySemanticsLabel('Open passes: 7'), findsOneWidget);
            if (scale == 2) {
              expect(tester.getSize(first).width, greaterThan(200));
              expect(
                tester.getTopLeft(second).dy,
                greaterThan(tester.getTopLeft(first).dy),
              );
            } else {
              expect(tester.getSize(first).width, 128);
              expect(
                tester.getTopLeft(second).dy,
                tester.getTopLeft(first).dy,
              );
            }
            expect(tester.takeException(), isNull);
            // Flutter verifies semantics handles before addTearDown callbacks.
            // Dispose within the test body, not during test teardown.
            semantics.dispose();
          },
        );
      }
    }
  }
}
