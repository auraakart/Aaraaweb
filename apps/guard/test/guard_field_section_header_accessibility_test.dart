import 'package:aaraagate_guard/theme/aaraagate_guard_theme.dart';
import 'package:aaraagate_guard/widgets/guard_field_section_header.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  for (final dark in <bool>[false, true]) {
    for (final largeText in <bool>[false, true]) {
      testWidgets(
        'Field section header keeps action accessible dark=$dark large=$largeText',
        (tester) async {
          tester.view.physicalSize = Size(largeText ? 320 : 390, 900);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);

          var pressed = 0;
          await tester.pumpWidget(MaterialApp(
            theme: dark ? AaraagateGuardTheme.dark() : AaraagateGuardTheme.light(),
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context).copyWith(
                textScaler: TextScaler.linear(largeText ? 2 : 1),
                disableAnimations: true,
              ),
              child: child!,
            ),
            home: Scaffold(
              body: SafeArea(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: GuardFieldSectionHeader(
                    title: 'Material & move passes',
                    icon: Icons.local_shipping_outlined,
                    action: TextButton.icon(
                      onPressed: () => pressed++,
                      icon: const Icon(Icons.add_rounded),
                      label: const Text('NEW PASS'),
                    ),
                  ),
                ),
              ),
            ),
          ));
          await tester.pumpAndSettle();

          final title = find.text('Material & move passes');
          final action = find.widgetWithText(TextButton, 'NEW PASS');
          expect(title, findsOneWidget);
          expect(action, findsOneWidget);
          if (largeText) {
            expect(
              tester.getTopLeft(action).dy,
              greaterThan(tester.getBottomLeft(title).dy),
            );
          } else {
            expect(
              tester.getTopLeft(action).dy,
              lessThan(tester.getBottomLeft(title).dy),
            );
          }
          expect(tester.takeException(), isNull);
          await tester.tap(action);
          await tester.pumpAndSettle();
          expect(pressed, 1);
          expect(tester.takeException(), isNull);
        },
      );
    }
  }

  testWidgets('Action-free heading does not introduce an empty action row',
      (tester) async {
    tester.view.physicalSize = const Size(320, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(MaterialApp(
      home: MediaQuery(
        data: const MediaQueryData(textScaler: TextScaler.linear(2)),
        child: const Scaffold(
          body: Padding(
            padding: EdgeInsets.all(16),
            child: GuardFieldSectionHeader(
              title: 'Overstays',
              icon: Icons.timer_outlined,
            ),
          ),
        ),
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Overstays'), findsOneWidget);
    expect(find.byType(TextButton), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
