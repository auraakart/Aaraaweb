import 'package:aaraagate_guard/theme/aaraagate_guard_theme.dart';
import 'package:aaraagate_guard/widgets/guard_field_pass_dialog.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  for (final dark in <bool>[false, true]) {
    for (final scale in <double>[1, 2]) {
      testWidgets(
        'Gate pass form keeps required actions accurate dark=$dark scale=$scale',
        (tester) async {
          tester.view.physicalSize = Size(scale == 2 ? 320 : 390, 900);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);

          Map<String, String>? result;
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
                    result = await showDialog<Map<String, String>>(
                      context: context,
                      builder: (_) => const GuardFieldPassDialog(),
                    );
                  },
                  child: const Text('OPEN FORM'),
                ),
              ),
            ),
          ));
          await tester.tap(find.text('OPEN FORM'));
          await tester.pumpAndSettle();
          expect(find.text('Create gate pass'), findsOneWidget);

          final create = find.widgetWithText(FilledButton, 'CREATE');
          expect(tester.widget<FilledButton>(create).onPressed, isNull);
          expect(tester.takeException(), isNull);

          await tester.enterText(
            find.widgetWithText(TextField, 'Reference'),
            '  MOVE-2026-01  ',
          );
          await tester.pump();
          expect(tester.widget<FilledButton>(create).onPressed, isNull);

          await tester.enterText(
            find.widgetWithText(TextField, 'Person / vendor'),
            '  Anand Kumar  ',
          );
          await tester.pump();
          expect(tester.widget<FilledButton>(create).onPressed, isNull);

          await tester.enterText(
            find.widgetWithText(TextField, 'Items / move details'),
            '  Household furniture  ',
          );
          await tester.pumpAndSettle();
          expect(tester.widget<FilledButton>(create).onPressed, isNotNull);
          expect(tester.takeException(), isNull);

          await tester.tap(create);
          await tester.pumpAndSettle();
          expect(result, {
            'movementType': 'MATERIAL_OUT',
            'referenceCode': 'MOVE-2026-01',
            'subjectName': 'Anand Kumar',
            'itemDescription': 'Household furniture',
            'vehicleNumber': '',
          });
          expect(tester.takeException(), isNull);
        },
      );
    }
  }

  testWidgets('Cancelling material pass form does not submit', (tester) async {
    Map<String, String>? result;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (context) => TextButton(
            onPressed: () async {
              result = await showDialog<Map<String, String>>(
                context: context,
                builder: (_) => const GuardFieldPassDialog(),
              );
            },
            child: const Text('OPEN FORM'),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('OPEN FORM'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('CANCEL'));
    await tester.pumpAndSettle();
    expect(result, isNull);
    expect(find.byType(GuardFieldPassDialog), findsNothing);
  });
}
