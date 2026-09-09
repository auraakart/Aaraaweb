import 'package:aaraagate_resident/screens/privacy_data_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('privacy screen explains current data use without overstating rights automation', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: PrivacyDataScreen()));

    expect(find.text('Privacy & data use'), findsOneWidget);
    expect(find.text('Account & property context'), findsOneWidget);
    expect(find.text('Gate & visitor activity'), findsOneWidget);

    await tester.scrollUntilVisible(find.text('Payments'), 250);
    expect(find.text('Payments'), findsOneWidget);

    await tester.scrollUntilVisible(find.text('Your data requests'), 250);
    expect(find.text('Your data requests'), findsOneWidget);
    expect(find.textContaining('not implemented yet'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.textContaining('does not make a data-retention or regulatory-compliance claim'),
      250,
    );
    expect(find.textContaining('does not make a data-retention or regulatory-compliance claim'), findsOneWidget);
  });
}
