import 'package:aaraagate_guard/localization/guard_strings.dart';
import 'package:aaraagate_guard/theme/aaraagate_guard_theme.dart';
import 'package:aaraagate_guard/widgets/guard_field_more_records.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  for (final language in guardLanguages) {
    for (final dark in <bool>[false, true]) {
      testWidgets('Guard long queue is discoverable: ${language.code} dark=$dark 320dp 200%', (tester) async {
        tester.view.physicalSize = const Size(320, 850);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final strings = GuardStrings(language.code);
        var shown = 20;
        await tester.pumpWidget(MaterialApp(
          theme: dark ? AaraagateGuardTheme.dark() : AaraagateGuardTheme.light(),
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(
              textScaler: const TextScaler.linear(2), disableAnimations: true,
            ),
            child: child!,
          ),
          home: Scaffold(body: ListView(
            children: [StatefulBuilder(builder: (context, setState) =>
              GuardFieldMoreRecords(
                sectionLabel: strings.get('fieldWatchlist'),
                shown: shown,
                total: 47,
                showingTemplate: strings.get('fieldShowing'),
                showNextTemplate: strings.get('fieldShowNext'),
                onPressed: () => setState(() => shown += 20),
              ),
            )],
          )),
        ));
        await tester.pumpAndSettle();
        final expectedCaption = strings.get('fieldShowing')
            .replaceAll('{shown}', '20').replaceAll('{total}', '47');
        expect(find.text('${strings.get('fieldWatchlist')} · $expectedCaption'), findsOneWidget);
        final action = find.widgetWithText(OutlinedButton,
            strings.get('fieldShowNext').replaceAll('{count}', '20'));
        expect(action, findsOneWidget);
        expect(tester.getSize(action).height,
            greaterThanOrEqualTo(AaraagateGuardTokens.minTouchTarget));
        await tester.tap(action);
        await tester.pumpAndSettle();
        expect(shown, 40);
        expect(find.text(strings.get('fieldShowNext').replaceAll('{count}', '7')), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets('Completed queue hides disclosure and never repeats operations', (tester) async {
    var calls = 0;
    await tester.pumpWidget(MaterialApp(home: Scaffold(
      body: GuardFieldMoreRecords(
        sectionLabel: 'Watchlist', shown: 20, total: 20,
        showingTemplate: 'Showing {shown} of {total}',
        showNextTemplate: 'Show next {count}',
        onPressed: () => calls++,
      ),
    )));
    expect(find.byType(OutlinedButton), findsNothing);
    expect(calls, 0);
    expect(tester.takeException(), isNull);
  });
}
