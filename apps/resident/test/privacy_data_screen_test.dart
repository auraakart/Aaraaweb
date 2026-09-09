import 'package:aaraagate_resident/screens/privacy_data_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('privacy screen explains current data use without overstating rights automation', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: PrivacyDataScreen()));

    expect(find.text('Privacy & data use'), findsOneWidget);
    expect(find.text('Account & property context'), findsOneWidget);
    expect(find.text('Gate & visitor activity'), findsOneWidget);
    expect(find.text('Payments'), findsOneWidget);
    expect(find.text('Your data requests'), findsOneWidget);
    expect(find.textContaining('not implemented yet'), findsOneWidget);
    expect(find.textContaining('does not make a data-retention or regulatory-compliance claim'), findsOneWidget);
  });
}
