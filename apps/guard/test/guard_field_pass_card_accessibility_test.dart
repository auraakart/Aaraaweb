import 'package:aaraagate_guard/theme/aaraagate_guard_theme.dart';
import 'package:aaraagate_guard/widgets/guard_field_pass_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const title = 'MOVE-2026-0001 · MATERIAL_OUT';
  const detail =
      'Anand Krishnamurthy Ramanathan · Household furniture and packing materials';

  for (final dark in <bool>[false, true]) {
    for (final scale in <double>[1, 2]) {
      for (final open in <bool>[false, true]) {
        testWidgets(
          'Material pass at large text: dark=$dark scale=$scale open=$open',
          (tester) async {
            tester.view.physicalSize = Size(scale == 2 ? 320 : 390, 900);
            tester.view.devicePixelRatio = 1;
            addTearDown(tester.view.resetPhysicalSize);
            addTearDown(tester.view.resetDevicePixelRatio);
            var calls = 0;

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
                body: SingleChildScrollView(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: GuardFieldPassCard(
                      title: title,
                      subtitle: detail,
                      status: open ? 'OPEN' : 'PROCESSED',
                      action: open
                          ? FilledButton(
                              onPressed: () => calls++,
                              child: const Text('PROCESS'),
                            )
                          : null,
                    ),
                  ),
                ),
              ),
            ));
            await tester.pumpAndSettle();

            expect(find.text(title), findsOneWidget);
            expect(find.text(detail), findsOneWidget);
            final process = find.widgetWithText(FilledButton, 'PROCESS');
            if (open) {
              expect(process, findsOneWidget);
              if (scale == 2) {
                expect(
                  tester.getSize(process).width,
                  greaterThanOrEqualTo(200),
                );
                expect(
                  tester.getTopLeft(process).dy,
                  greaterThan(tester.getBottomLeft(find.text(detail)).dy),
                );
              }
              await tester.tap(process);
              await tester.pumpAndSettle();
              expect(calls, 1);
            } else {
              expect(find.text('PROCESSED'), findsOneWidget);
              expect(process, findsNothing);
              expect(calls, 0);
            }
            expect(tester.takeException(), isNull);
          },
        );
      }
    }
  }

  testWidgets('Pass processing remains disabled while guard is busy',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: GuardFieldPassCard(
          title: 'MOVE-1 · MOVE_OUT',
          subtitle: 'Resident · furniture',
          status: 'OPEN',
          action: FilledButton(
            onPressed: null,
            child: Text('PROCESS'),
          ),
        ),
      ),
    ));
    expect(
      tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'PROCESS'),
      ).onPressed,
      isNull,
    );
    expect(tester.takeException(), isNull);
  });
}
