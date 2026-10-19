import 'package:aaraagate_guard/theme/aaraagate_guard_theme.dart';
import 'package:aaraagate_guard/widgets/guard_field_handover_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const identity =
      'Anand Krishnamurthy Ramanathan · North residential visitor and deliveries gate';

  for (final dark in <bool>[false, true]) {
    for (final open in <bool>[false, true]) {
      for (final scale in <double>[1, 2]) {
        testWidgets(
          'Handover identity, status and action dark=$dark open=$open scale=$scale',
          (tester) async {
            tester.view.physicalSize = Size(scale == 2 ? 320 : 390, 900);
            tester.view.devicePixelRatio = 1;
            addTearDown(tester.view.resetPhysicalSize);
            addTearDown(tester.view.resetDevicePixelRatio);
            var acknowledgements = 0;
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
                    child: GuardFieldHandoverCard(
                      handover: {
                        'id': 'handover-1',
                        'status': open ? 'OPEN' : 'ACKNOWLEDGED',
                        'outgoingGuardName': 'Anand Krishnamurthy Ramanathan',
                        'gateName': 'North residential visitor and deliveries gate',
                        'summary': 'Two deliveries require handover review',
                        'openItems': ['Gate patrol pending'],
                      },
                      busy: false,
                      onAcknowledge: () => acknowledgements++,
                    ),
                  ),
                ),
              ),
            ));
            await tester.pumpAndSettle();

            final name = find.byKey(const ValueKey('guard-handover-identity'));
            final status = find.byKey(const ValueKey('guard-handover-status'));
            expect(tester.widget<Text>(name).data, identity);
            expect(
              tester.widget<Text>(status).data,
              open ? 'OPEN' : 'ACKNOWLEDGED',
            );
            expect(find.text('Gate patrol pending'), findsNothing);
            expect(find.text('• Gate patrol pending'), findsOneWidget);
            if (scale == 2) {
              expect(
                tester.getTopLeft(status).dy,
                greaterThan(tester.getBottomLeft(name).dy),
              );
            } else {
              expect(
                tester.getTopLeft(status).dy,
                lessThan(tester.getBottomLeft(name).dy),
              );
            }
            final action = find.widgetWithText(FilledButton, 'ACKNOWLEDGE');
            if (open) {
              expect(action, findsOneWidget);
              if (scale == 2) {
                expect(
                  tester.getSize(action).width,
                  greaterThanOrEqualTo(200),
                );
              }
              await tester.ensureVisible(action);
              await tester.tap(action);
              await tester.pumpAndSettle();
              expect(acknowledgements, 1);
            } else {
              expect(action, findsNothing);
              expect(acknowledgements, 0);
            }
            expect(tester.takeException(), isNull);
          },
        );
      }
    }
  }

  testWidgets('Acknowledgement remains unavailable while an operation runs',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: GuardFieldHandoverCard(
          handover: {'status': 'OPEN'},
          busy: true,
          onAcknowledge: _unusedCallback,
        ),
      ),
    ));
    final action = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'ACKNOWLEDGE'),
    );
    expect(action.onPressed, isNull);
  });
}

void _unusedCallback() {}
