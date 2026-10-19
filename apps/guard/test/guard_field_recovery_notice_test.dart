import 'package:aaraagate_guard/theme/aaraagate_guard_theme.dart';
import 'package:aaraagate_guard/widgets/guard_field_recovery_notice.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const message =
      'The action status could not be confirmed. Refresh the latest status before trying again.';

  for (final dark in <bool>[false, true]) {
    for (final scale in <double>[1, 2]) {
      testWidgets(
        'Guard retry remains accessible dark=$dark scale=$scale',
        (tester) async {
          tester.view.physicalSize = Size(scale == 2 ? 320 : 390, 900);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          var refreshes = 0;

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
              body: Padding(
                padding: const EdgeInsets.all(16),
                child: GuardFieldRecoveryNotice(
                  message: message,
                  onRefresh: () => refreshes++,
                ),
              ),
            ),
          ));
          await tester.pumpAndSettle();

          expect(find.text(message), findsOneWidget);
          final action = find.widgetWithText(
            OutlinedButton,
            'Refresh status',
          );
          expect(action, findsOneWidget);
          expect(
            tester.getSize(action).height,
            greaterThanOrEqualTo(AaraagateGuardTokens.minTouchTarget),
          );
          expect(tester.takeException(), isNull);
          await tester.tap(action);
          await tester.pumpAndSettle();
          expect(refreshes, 1);
          expect(tester.takeException(), isNull);
        },
      );
    }
  }

  testWidgets('Guard busy refresh stays disabled and message remains', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: GuardFieldRecoveryNotice(
          message: 'Field operations could not be refreshed.',
          onRefresh: null,
        ),
      ),
    ));
    final action = tester.widget<OutlinedButton>(
      find.widgetWithText(OutlinedButton, 'Refresh status'),
    );
    expect(action.onPressed, isNull);
    expect(find.text('Field operations could not be refreshed.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
