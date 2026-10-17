import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/screens/consumer_recurring_services_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
class RecurringClient extends ApiClient {
  RecurringClient() : super(baseUrl: 'http://test', accessToken: 'token');
  String status = 'ACTIVE';
  bool deny = false;
  final writes = <Map<String, dynamic>>[];
  int patches = 0;
  @override
  Future<dynamic> get(String path) async {
    if (deny) throw StateError('Denied');
    if (path.endsWith('/recurring-plans')) return [{'id': 'plan-1', 'offeringId': 'offering-1', 'offeringName': 'AC service', 'locationType': 'HOME', 'locationId': 'home-1', 'locationLabel': 'Saved home', 'cadence': 'MONTHLY', 'status': status, 'pricePaise': 75000}];
    if (path.contains('/offerings?')) return [{'id': 'offering-1', 'name': 'AC service', 'providerName': 'Provider', 'pricePaise': 90000, 'durationMinutes': 60}];
    if (path.endsWith('/locations')) return [
      {'id': 'home-1', 'type': 'HOME', 'label': 'Saved home', 'serviceAddressConfigured': true},
      {'id': 'home-2', 'type': 'HOME', 'label': 'Other home', 'serviceAddressConfigured': true},
    ];
    if (path.contains('/availability?')) return {'available': true, 'remainingCapacity': 2};
    if (path.endsWith('/visits')) return {'planId': 'plan-1', 'planOriginVerified': false, 'automaticallyScheduled': false, 'visits': []};
    if (path.endsWith('/technician-continuity')) return {'planId': 'plan-1', 'historicalEvidenceOnly': true, 'technicianAvailabilityConfirmed': false, 'technicianAssignmentGuaranteed': false, 'bookingCreated': false, 'automaticDispatch': false, 'candidates': []};
    throw StateError('Unexpected request $path');
  }
  @override
  Future<dynamic> patch(String path, [Map<String, dynamic>? body]) async { expect(path, endsWith('/plan-1/status')); status = body!['status'] as String; patches++; return {}; }
  @override
  Future<dynamic> post(String path, [Map<String, dynamic>? body]) async {
    expect(path, '/api/v1/consumer/services/recurring-plans/plan-1/book');
    writes.add(Map<String, dynamic>.from(body!));
    if (writes.length == 1) throw StateError('Connection lost');
    return {'id': 'booking-1'};
  }
}
Widget host(RecurringClient api) => MaterialApp(home: ConsumerRecurringServicesScreen(apiClient: api));
void main() {
  testWidgets('plans one explicit visit using fresh price, fixed location and the same retry key', (tester) async {
    final api = RecurringClient(); await tester.pumpWidget(host(api)); await tester.pumpAndSettle();
    expect(api.writes, isEmpty);
    await tester.tap(find.text('Plan one visit')); await tester.pumpAndSettle();
    expect(find.text('₹900'), findsOneWidget); expect(find.text('Other home'), findsNothing);
    await tester.ensureVisible(find.text('Choose date & time')); await tester.tap(find.text('Choose date & time')); await tester.pumpAndSettle();
    await tester.tap(find.text('OK')); await tester.pumpAndSettle();
    await tester.tap(find.text('OK')); await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Request service')); await tester.tap(find.text('Request service')); await tester.pumpAndSettle();
    expect(api.writes, hasLength(1));
    await tester.ensureVisible(find.text('Request service')); await tester.tap(find.text('Request service')); await tester.pumpAndSettle();
    expect(api.writes, hasLength(2));
    expect(api.writes[0]['idempotencyKey'], api.writes[1]['idempotencyKey']);
    expect(api.writes[0].keys, unorderedEquals(['scheduledFrom', 'scheduledUntil', 'idempotencyKey']));
    expect(api.patches, 0); api.close();
  });
  testWidgets('paused preference has history but cannot create a visit; resume needs confirmation', (tester) async {
    final api = RecurringClient()..status = 'PAUSED'; await tester.pumpWidget(host(api)); await tester.pumpAndSettle();
    expect(find.text('Plan one visit'), findsNothing);
    await tester.tap(find.text('Matching visits and technicians')); await tester.pumpAndSettle();
    expect(find.textContaining('No matching visits'), findsOneWidget); expect(api.writes, isEmpty);
    await tester.tapAt(const Offset(10, 10)); await tester.pumpAndSettle();
    await tester.tap(find.text('Resume preference')); await tester.pumpAndSettle(); expect(api.patches, 0);
    await tester.tap(find.text('Confirm preference change')); await tester.pumpAndSettle();
    expect(api.patches, 1); expect(find.text('Plan one visit'), findsOneWidget); expect(api.writes, isEmpty); api.close();
  });
  testWidgets('denied plan list can recover with explicit refresh and never creates a booking', (tester) async {
    final api = RecurringClient()..deny = true; await tester.pumpWidget(host(api)); await tester.pumpAndSettle();
    expect(find.text('Plan one visit'), findsNothing); api.deny = false;
    await tester.tap(find.text('Refresh recurring preferences')); await tester.pumpAndSettle();
    expect(find.text('Plan one visit'), findsOneWidget); expect(api.writes, isEmpty); api.close();
  });
}
