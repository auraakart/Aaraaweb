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


class _ResilientPrivacyApi extends ApiClient {
  _ResilientPrivacyApi({this.contextFails = false, this.failFirstPost = false})
      : super(baseUrl: 'http://127.0.0.1:3000', accessToken: 'test');

  final bool contextFails;
  final bool failFirstPost;
  final List<Map<String, dynamic>> posts = [];
  int _postAttempts = 0;

  @override
  Future<dynamic> get(String path) async {
    if (path == '/api/v1/privacy/self/requests') {
      return [
        {
          'id': 'req-open',
          'requestType': 'ACCESS',
          'status': 'OPEN',
          'requestSummary': 'Provide my data',
          'legalHold': false,
          'createdAt': '2026-10-05T00:00:00.000Z',
        },
      ];
    }
    if (path == '/api/v1/privacy/self/context') {
      if (contextFails) throw ApiException(503, 'Privacy context unavailable');
      return {
        'privacyProgram': {
          'activeConsentCount': 1,
          'categories': [
            {
              'code': 'ACCOUNT',
              'name': 'Account data',
              'purpose': 'Account and society access',
              'retentionTrigger': 'account closure',
              'retentionDays': 30,
            },
          ],
          'consents': [
            {
              'status': 'ACTIVE',
              'dataCategoryCode': 'ACCOUNT',
              'purpose': 'Account and society access',
            },
          ],
          'boundary': 'Configured privacy evidence only.',
        },
      };
    }
    throw ApiException(404, 'Not found');
  }

  @override
  Future<dynamic> post(String path, [Map<String, dynamic>? body]) async {
    if (path != '/api/v1/privacy/self/requests') throw ApiException(404, 'Not found');
    _postAttempts += 1;
    posts.add(Map<String, dynamic>.from(body ?? const {}));
    if (failFirstPost && _postAttempts == 1) {
      throw ApiException(503, 'Submission outcome unknown');
    }
    return {'id': 'created'};
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


  testWidgets('privacy request list remains available when optional context metadata fails', (tester) async {
    final api = _ResilientPrivacyApi(contextFails: true);
    await tester.pumpWidget(MaterialApp(home: PrivacyDataScreen(apiClient: api)));
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(find.text('Privacy request status'), 250);
    expect(find.text('Could not load privacy requests'), findsNothing);
    await tester.scrollUntilVisible(find.text('Data access request'), 250);
    expect(find.text('Submitted and waiting for privacy-team review.'), findsOneWidget);
  });

  testWidgets('privacy retry reuses the same request key after an uncertain submission', (tester) async {
    final api = _ResilientPrivacyApi(failFirstPost: true);
    await tester.pumpWidget(MaterialApp(home: PrivacyDataScreen(apiClient: api)));
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(find.text('Privacy controls snapshot'), 250);
    expect(find.textContaining('1 active data categories'), findsOneWidget);

    await tester.scrollUntilVisible(find.text('Get a copy of my data'), 250);
    await tester.tap(find.text('Get a copy of my data'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Submit request'));
    await tester.pumpAndSettle();

    expect(api.posts, hasLength(1));
    final firstKey = api.posts.single['requestKey'];
    expect(firstKey, isNotNull);
    expect(find.textContaining('Retrying the same request is safe.'), findsOneWidget);

    await tester.scrollUntilVisible(find.text('Get a copy of my data'), 250);
    await tester.tap(find.text('Get a copy of my data'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Submit request'));
    await tester.pumpAndSettle();

    expect(api.posts, hasLength(2));
    expect(api.posts[1]['requestKey'], firstKey);
  });

  testWidgets('correction request requires details and submits the reviewed text', (tester) async {
    final api = _ResilientPrivacyApi();
    await tester.pumpWidget(MaterialApp(home: PrivacyDataScreen(apiClient: api)));
    await tester.pumpAndSettle();

    final correctionTile = find.widgetWithText(ListTile, 'Correct my information');
    await tester.scrollUntilVisible(correctionTile, 250);
    await tester.ensureVisible(correctionTile);
    await tester.pumpAndSettle();
    await tester.tap(correctionTile);
    await tester.pumpAndSettle();

    var submit = tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Submit request'));
    expect(submit.onPressed, isNull);

    await tester.enterText(find.byType(TextField), 'My surname is incorrect');
    await tester.pump();
    submit = tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Submit request'));
    expect(submit.onPressed, isNotNull);

    await tester.tap(find.widgetWithText(FilledButton, 'Submit request'));
    await tester.pumpAndSettle();

    expect(api.posts.last['requestType'], 'CORRECTION');
    expect(api.posts.last['requestSummary'], contains('My surname is incorrect'));
  });

}
