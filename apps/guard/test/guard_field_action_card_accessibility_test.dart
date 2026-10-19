import 'package:aaraagate_guard/theme/aaraagate_guard_theme.dart';
import 'package:aaraagate_guard/widgets/guard_field_action_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const longTitle =
      'Visitor Krishnamurthy Ramanathan · North residential building A-1001';
  const longSubtitle =
      'Checkpoint north entrance · Coverage overdue · 12h since scan';

  for (final dark in <bool>[false, true]) {
    for (final scale in <double>[1, 2]) {
      for (final withIcon in <bool>[false, true]) {
        testWidgets(
          'Field operational row stays actionable dark=$dark scale=$scale icon=$withIcon',
          (tester) async {
            tester.view.physicalSize = Size(scale == 2 ? 320 : 390, 900);
            tester.view.devicePixelRatio = 1;
            addTearDown(tester.view.resetPhysicalSize);
            addTearDown(tester.view.resetDevicePixelRatio);
            var pressed = 0;

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
                    child: GuardFieldActionCard(
                      title: longTitle,
                      subtitle: longSubtitle,
                      icon: withIcon ? Icons.schedule_rounded : null,
                      strongTitle: withIcon,
                      actionLabel: withIcon ? 'ESCALATE' : 'SCAN NOW',
                      onPressed: () => pressed++,
                    ),
                  ),
                ),
              ),
            ));
            await tester.pumpAndSettle();

            expect(find.text(longTitle), findsOneWidget);
            expect(find.text(longSubtitle), findsOneWidget);
            final action = find.widgetWithText(
              FilledButton,
              withIcon ? 'ESCALATE' : 'SCAN NOW',
            );
            expect(action, findsOneWidget);
            if (scale == 2) {
              expect(tester.getSize(action).width, greaterThanOrEqualTo(200));
              expect(
                tester.getTopLeft(action).dy,
                greaterThan(tester.getBottomLeft(find.text(longSubtitle)).dy),
              );
            }
            expect(tester.takeException(), isNull);
            await tester.ensureVisible(action);
            await tester.tap(action);
            await tester.pumpAndSettle();
            expect(pressed, 1);
            expect(tester.takeException(), isNull);
          },
        );
      }
    }
  }

  testWidgets('Busy or unauthorized operational action stays disabled',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: GuardFieldActionCard(
          title: 'Overstay',
          subtitle: '90 min inside',
          actionLabel: 'ESCALATE',
          onPressed: null,
        ),
      ),
    ));
    expect(
      tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'ESCALATE'),
      ).onPressed,
      isNull,
    );
    expect(tester.takeException(), isNull);
  });
}
