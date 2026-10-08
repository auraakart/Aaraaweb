import 'dart:async';
import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/screens/independent_services_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class RecoveryServicesApi extends ApiClient {
  RecoveryServicesApi() : super(baseUrl: 'http://test', accessToken: 'token');
  Completer<dynamic>? locationsPending;
  Completer<dynamic>? trustPending;
  final slowOfferings = Completer<dynamic>();
  bool configured = true;

  List<Map<String, dynamic>> offering(String name) => [{
    'id': name, 'name': name, 'providerId': 'provider-1', 'pricePaise': 50000,
    'provider': {'id': 'provider-1', 'businessName': 'Local services'},
  }];

  @override
  Future<dynamic> get(String path) async {
    if (path.endsWith('/categories')) return [
      {'id': 'slow', 'name': 'Slow category'}, {'id': 'fast', 'name': 'Fast category'},
    ];
    if (path.endsWith('/locations')) {
      if (locationsPending != null) return locationsPending!.future;
      return [{
        'type': 'HOME', 'id': 'home-1', 'label': 'Selected home',
        'addressLine1': 'Main Road', 'locality': 'Chennai', 'city': 'Chennai',
        'serviceAddressConfigured': configured,
      }];
    }
    if (path.contains('/offerings?')) {
      final category = Uri.parse(path).queryParameters['categoryId'];
      if (category == 'slow') return slowOfferings.future;
      return offering(category == 'fast' ? 'Latest category provider' : 'Home cleaning');
    }
    if (path.endsWith('/providers/trust') && trustPending != null) return trustPending!.future;
    return <Map<String, dynamic>>[];
  }
}

Future<void> showServices(WidgetTester tester, RecoveryServicesApi api) async {
  await tester.pumpWidget(MaterialApp(home: IndependentServicesScreen(apiClient: api)));
  await tester.pump();
}

void main() {
  testWidgets('slow optional trust does not delay core provider discovery', (tester) async {
    final api = RecoveryServicesApi()..trustPending = Completer<dynamic>();
    await showServices(tester, api);
    await tester.pumpAndSettle();
    expect(find.text('Home cleaning'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    api.trustPending!.complete(<Map<String, dynamic>>[]);
    await tester.pumpAndSettle();
  });

  testWidgets('an older category response cannot replace the latest selection', (tester) async {
    final api = RecoveryServicesApi();
    await showServices(tester, api);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Slow category'));
    await tester.pump();
    await tester.tap(find.text('Fast category'));
    await tester.pumpAndSettle();
    expect(find.text('Latest category provider'), findsOneWidget);
    api.slowOfferings.complete(api.offering('Stale category provider'));
    await tester.pumpAndSettle();
    expect(find.text('Latest category provider'), findsOneWidget);
    expect(find.text('Stale category provider'), findsNothing);
  });

  testWidgets('a stalled location lookup exits loading and offers a working retry', (tester) async {
    final pending = Completer<dynamic>();
    final api = RecoveryServicesApi()..locationsPending = pending;
    await showServices(tester, api);
    await tester.pump(const Duration(seconds: 21));
    await tester.pumpAndSettle();
    expect(find.text('Retry'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    api.locationsPending = null;
    await tester.ensureVisible(find.text('Retry'));
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text('Home cleaning'), findsOneWidget);
    pending.complete(<Map<String, dynamic>>[]);
    await tester.pumpAndSettle();
  });

  testWidgets('an address without service configuration does not query providers', (tester) async {
    final api = RecoveryServicesApi()..configured = false;
    await showServices(tester, api);
    await tester.pumpAndSettle();
    expect(find.textContaining('Choose or add a service location'), findsOneWidget);
    expect(find.text('Home cleaning'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
