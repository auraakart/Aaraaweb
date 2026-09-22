import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/screens/privacy_data_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';


class _NoNetworkApi extends ApiClient {
  _NoNetworkApi():super(baseUrl:'http://demo.invalid',accessToken:'demo');
  int calls=0;

  @override
  Future<dynamic> get(String path) async {
    calls++;
    throw StateError('Demo privacy screen must not call GET');
  }

  @override
  Future<dynamic> post(String path,[Map<String,dynamic>? body]) async {
    calls++;
    throw StateError('Demo privacy screen must not call POST');
  }
}

void main() {
  testWidgets('privacy screen explains current data use without overstating rights automation', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: PrivacyDataScreen()));

    expect(find.text('Privacy & data use'), findsOneWidget);
    expect(find.text('Account & property context'), findsOneWidget);
    expect(find.text('Gate & visitor activity'), findsOneWidget);

    await tester.scrollUntilVisible(find.text('Payments'), 250);
    expect(find.text('Payments'), findsOneWidget);

    await tester.scrollUntilVisible(find.text('Manage my data'), 250);
    expect(find.text('Manage my data'), findsOneWidget);
    expect(find.textContaining('Request a copy, correction, or deletion review'), findsOneWidget);

    await tester.scrollUntilVisible(
      find.textContaining('does not make a data-retention or regulatory-compliance claim'),
      250,
    );
    expect(find.textContaining('does not make a data-retention or regulatory-compliance claim'), findsOneWidget);
  });

  testWidgets('demo privacy mode stays local and does not call privacy APIs', (tester) async {
    final api=_NoNetworkApi();
    await tester.pumpWidget(MaterialApp(home: PrivacyDataScreen(apiClient: api, demoMode: true)));
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(find.text('Manage my data'), 250);
    expect(find.text('Manage my data'), findsOneWidget);
    expect(find.textContaining('Demo mode: privacy requests are shown as a product capability only'), findsOneWidget);

    await tester.scrollUntilVisible(find.text('Privacy request status'), 250);
    expect(find.text('No demo privacy requests'), findsOneWidget);
    expect(find.textContaining('does not contact the privacy service'), findsOneWidget);
    expect(find.text('Could not load privacy requests'), findsNothing);
    expect(api.calls, 0);
  });

}
