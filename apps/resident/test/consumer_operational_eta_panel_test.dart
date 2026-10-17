import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/widgets/consumer_operational_eta_panel.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class EtaClient extends ApiClient {
  EtaClient() : super(baseUrl: 'http://test', accessToken: 'token');
  bool stale = false, invalid = false, deny = false;
  int reads = 0;
  @override
  Future<dynamic> get(String path) async {
    reads++;
    if (deny) throw StateError('Denied');
    final now = DateTime.now().toUtc();
    return {
      'bookingId': 'booking',
      'asOf': now.toIso8601String(),
      'lastMilestoneAt': now
          .subtract(Duration(minutes: stale ? 16 : 1))
          .toIso8601String(),
      'liveTracking': invalid,
      'guaranteedArrival': false,
      'etaMinutes': 10,
      'estimatedArrivalAt': now
          .add(const Duration(minutes: 10))
          .toIso8601String(),
      'assignmentStatus': 'EN_ROUTE',
      'reason': 'HISTORICAL_ESTIMATE_ONLY',
      'confidence': 'LOW',
      'source': 'PROVIDER_HISTORICAL_EN_ROUTE_TO_ARRIVED',
      'sampleSize': 5,
      'milestoneFresh': true,
    };
  }
}

Widget host(EtaClient api) => MaterialApp(
  home: Scaffold(
    body: ConsumerOperationalEtaPanel(apiClient: api, bookingId: 'booking'),
  ),
);
void main() {
  testWidgets(
    'shows only qualified fresh historical estimate and expires without polling',
    (tester) async {
      final api = EtaClient();
      await tester.pumpWidget(host(api));
      await tester.pumpAndSettle();
      expect(find.textContaining('About 10 minutes'), findsOneWidget);
      expect(find.textContaining('No live GPS'), findsOneWidget);
      await tester.pump(const Duration(minutes: 11));
      expect(find.textContaining('About 10 minutes'), findsNothing);
      expect(api.reads, 1);
      await tester.pumpWidget(const SizedBox());
      api.close();
    },
  );
  testWidgets(
    'rejects stale or misleading live estimates and recovers on refresh',
    (tester) async {
      final api = EtaClient()..stale = true;
      await tester.pumpWidget(host(api));
      await tester.pumpAndSettle();
      expect(find.textContaining('About 10 minutes'), findsNothing);
      api.stale = false;
      api.invalid = true;
      await tester.tap(find.text('Refresh arrival update'));
      await tester.pumpAndSettle();
      expect(find.textContaining('About 10 minutes'), findsNothing);
      api.invalid = false;
      await tester.tap(find.text('Refresh arrival update'));
      await tester.pumpAndSettle();
      expect(find.textContaining('About 10 minutes'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      api.close();
    },
  );
}
