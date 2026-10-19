import 'package:aaraagate_guard/theme/aaraagate_guard_theme.dart';
import 'package:aaraagate_guard/widgets/guard_field_handover_dialog.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  for (final dark in <bool>[false, true]) {
    for (final scale in <double>[1, 2]) {
      testWidgets(
        'Guard shift handover requires useful summary dark=$dark scale=$scale',
        (tester) async {
          tester.view.physicalSize = Size(scale == 2 ? 320 : 390, 900);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          Map<String, dynamic>? payload;
          await tester.pumpWidget(MaterialApp(
            theme: dark ? AaraagateGuardTheme.dark() : AaraagateGuardTheme.light(),
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context).copyWith(
                textScaler: TextScaler.linear(scale),
                disableAnimations: true,
              ),
              child: child!,
            ),
            home: Scaffold(
              body: Builder(
                builder: (context) => TextButton(
                  onPressed: () async {
                    payload = await showDialog<Map<String, dynamic>>(
                      context: context,
                      builder: (_) => const GuardFieldHandoverDialog(),
                    );
                  },
                  child: const Text('OPEN HANDOVER'),
                ),
              ),
            ),
          ));

          await tester.tap(find.text('OPEN HANDOVER'));
          await tester.pumpAndSettle();
          expect(find.text('Shift handover'), findsOneWidget);
          final action = find.widgetWithText(FilledButton, 'HAND OVER');
          final summary = find.widgetWithText(TextField, 'Shift summary');
          expect(tester.widget<FilledButton>(action).onPressed, isNull);
          await tester.enterText(summary, '  ab  ');
          await tester.pump();
          expect(tester.widget<FilledButton>(action).onPressed, isNull);
          await tester.enterText(summary, '  Gate 1 has two pending items  ');
          await tester.pumpAndSettle();
          expect(tester.widget<FilledButton>(action).onPressed, isNotNull);
          expect(tester.takeException(), isNull);

          final items = find.widgetWithText(TextField, 'Open items');
          await tester.ensureVisible(items);
          await tester.enterText(items, '  Parcel pickup  \n  \n  Visitor call  ');
          await tester.pumpAndSettle();
          await tester.ensureVisible(action);
          await tester.tap(action);
          await tester.pumpAndSettle();
          expect(payload, {
            'summary': 'Gate 1 has two pending items',
            'openItems': ['Parcel pickup', 'Visitor call'],
          });
          expect(tester.takeException(), isNull);
        },
      );
    }
  }

  testWidgets('Whitespace-only shift summary never enables handover',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(body: GuardFieldHandoverDialog()),
    ));
    await tester.enterText(
      find.widgetWithText(TextField, 'Shift summary'),
      '   \n    ',
    );
    await tester.pumpAndSettle();
    expect(
      tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'HAND OVER'),
      ).onPressed,
      isNull,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('Cancelling shift handover does not create a record',
      (tester) async {
    Map<String, dynamic>? payload;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (context) => TextButton(
            onPressed: () async {
              payload = await showDialog<Map<String, dynamic>>(
                context: context,
                builder: (_) => const GuardFieldHandoverDialog(),
              );
            },
            child: const Text('OPEN HANDOVER'),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('OPEN HANDOVER'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('CANCEL'));
    await tester.pumpAndSettle();
    expect(payload, isNull);
    expect(find.byType(GuardFieldHandoverDialog), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
