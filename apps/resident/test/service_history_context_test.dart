import 'dart:async';

import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/screens/service_history_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _DelayedHistoryClient extends ApiClient {
  _DelayedHistoryClient() : super(baseUrl: 'http://localhost:3000', accessToken: 'test-token');

  final paths = <String>[];
  final requests = <Completer<dynamic>>[];

  @override
  Future<dynamic> get(String path) {
    paths.add(path);
    final completer = Completer<dynamic>();
    requests.add(completer);
    return completer.future;
  }
}

Widget history(_DelayedHistoryClient api, String id) => MaterialApp(
      home: ServiceHistoryScreen(
        apiClient: api,
        location: {'type': 'SOCIETY_UNIT', 'id': id, 'label': 'Unit $id'},
        offeringsById: const {},
        onRebook: (_) async {},
      ),
    );

void main() {
  testWidgets('old property results and errors cannot overwrite the new selected property', (tester) async {
    final api = _DelayedHistoryClient();
    await tester.pumpWidget(history(api, 'unit-old'));
    await tester.pump();
    expect(api.paths, hasLength(1));
    expect(api.paths.single, contains('locationId=unit-old'));

    await tester.pumpWidget(history(api, 'unit-new'));
    await tester.pump();
    expect(api.paths, hasLength(2));
    expect(api.paths.last, contains('locationId=unit-new'));
    expect(find.text('Unit unit-new'), findsOneWidget);

    api.requests.last.complete([]);
    await tester.pump();
    expect(find.text('No completed external services yet.'), findsOneWidget);

    // A successful old response must be ignored instead of replacing the
    // current property's empty state.
    api.requests.first.complete([{'id': 'stale-booking', 'offeringName': 'Wrong unit'}]);
    await tester.pump();
    expect(find.text('No completed external services yet.'), findsOneWidget);
    expect(find.text('Wrong unit'), findsNothing);

    await tester.pumpWidget(const SizedBox());
    api.close();
  });

  testWidgets('changing the authenticated API client starts a new scoped history read', (tester) async {
    final oldApi = _DelayedHistoryClient();
    final newApi = _DelayedHistoryClient();
    await tester.pumpWidget(history(oldApi, 'unit-1'));
    await tester.pump();
    await tester.pumpWidget(history(newApi, 'unit-1'));
    await tester.pump();
    expect(oldApi.requests, hasLength(1));
    expect(newApi.requests, hasLength(1));
    newApi.requests.single.complete([]);
    await tester.pump();
    oldApi.requests.single.completeError(StateError('Old session must not render'));
    await tester.pump();
    expect(find.textContaining('Old session must not render'), findsNothing);
    expect(find.text('No completed external services yet.'), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    oldApi.close();
    newApi.close();
  });
}
