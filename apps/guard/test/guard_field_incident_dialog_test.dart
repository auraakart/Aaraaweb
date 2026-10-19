import 'package:aaraagate_guard/theme/aaraagate_guard_theme.dart';
import 'package:aaraagate_guard/widgets/guard_field_incident_dialog.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  for (final dark in <bool>[false, true]) {
    for (final scale in <double>[1, 2]) {
      testWidgets(
        'Incident form validates before reporting dark=$dark scale=$scale',
        (tester) async {
          tester.view.physicalSize = Size(scale == 2 ? 320 : 390, 900);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);

          Map<String, String>? payload;
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
                    payload = await showDialog<Map<String, String>>(
                      context: context,
                      builder: (_) => const GuardFieldIncidentDialog(),
                    );
                  },
                  child: const Text('OPEN FORM'),
                ),
              ),
            ),
          ));

          await tester.tap(find.text('OPEN FORM'));
          await tester.pumpAndSettle();
          expect(find.text('Report incident'), findsOneWidget);

          final report = find.widgetWithText(FilledButton, 'REPORT');
          final category = find.widgetWithText(TextField, 'Category');
          final title = find.widgetWithText(TextField, 'Title');
          expect(tester.widget<FilledButton>(report).onPressed, isNull);
          await tester.ensureVisible(category);
          await tester.enterText(category, '   ');
          await tester.pump();
          expect(tester.widget<FilledButton>(report).onPressed, isNull);

          await tester.ensureVisible(title);
          await tester.enterText(title, '  Smoke near gate  ');
          await tester.pump();
          expect(tester.widget<FilledButton>(report).onPressed, isNull);

          await tester.ensureVisible(category);
          await tester.enterText(category, '  Safety  ');
          await tester.pumpAndSettle();
          expect(tester.widget<FilledButton>(report).onPressed, isNotNull);
          expect(tester.takeException(), isNull);

          await tester.ensureVisible(report);
          await tester.tap(report);
          await tester.pumpAndSettle();
          expect(payload, {
            'severity': 'MEDIUM',
            'category': 'Safety',
            'title': 'Smoke near gate',
            'description': '',
            'mediaRefs': '',
          });
          expect(tester.takeException(), isNull);
        },
      );
    }
  }

  testWidgets('Incident form preserves severity and evidence values',
      (tester) async {
    Map<String, String>? payload;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (context) => TextButton(
            onPressed: () async {
              payload = await showDialog<Map<String, String>>(
                context: context,
                builder: (_) => const GuardFieldIncidentDialog(),
              );
            },
            child: const Text('OPEN FORM'),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('OPEN FORM'));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(DropdownButton<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('CRITICAL').last);
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextField, 'Category'), '  Fire  ');
    await tester.enterText(find.widgetWithText(TextField, 'Title'), '  Smoke  ');
    await tester.enterText(
      find.widgetWithText(TextField, 'Details'),
      '  Security verified visible smoke  ',
    );
    final refs = find.widgetWithText(TextField, 'Evidence references');
    await tester.ensureVisible(refs);
    await tester.enterText(refs, '  image-1\\nimage-2  ');
    await tester.pumpAndSettle();

    final report = find.widgetWithText(FilledButton, 'REPORT');
    await tester.ensureVisible(report);
    await tester.tap(report);
    await tester.pumpAndSettle();
    expect(payload, {
      'severity': 'CRITICAL',
      'category': 'Fire',
      'title': 'Smoke',
      'description': 'Security verified visible smoke',
      'mediaRefs': 'image-1\\nimage-2',
    });
    expect(tester.takeException(), isNull);
  });

  testWidgets('Cancelling the incident dialog returns no report',
      (tester) async {
    Map<String, String>? payload;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (context) => TextButton(
            onPressed: () async {
              payload = await showDialog<Map<String, String>>(
                context: context,
                builder: (_) => const GuardFieldIncidentDialog(),
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
    expect(payload, isNull);
    expect(find.byType(GuardFieldIncidentDialog), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
