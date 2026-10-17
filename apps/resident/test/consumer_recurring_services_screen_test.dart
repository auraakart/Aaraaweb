import 'dart:async';
import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/screens/consumer_recurring_services_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
class RecurringClient extends ApiClient {
  RecurringClient() : super(baseUrl: 'http://test', accessToken: 'token');
  String status = 'ACTIVE';
  bool deny = false;
  bool loseStatusResponse = false;
  String offeringName = 'AC service';
  Completer<dynamic>? plansGate, offeringGate, patchGate, historyGate;
  final reads = <String>[];
  final writes = <Map<String, dynamic>>[];
  int patches = 0;
  @override
  Future<dynamic> get(String path) async {
    reads.add(path);
    if (deny) throw StateError('Denied');
    if (path.endsWith('/recurring-plans')) return plansGate?.future ?? plans;
    if (path.contains('/offerings?')) return offeringGate?.future ?? offerings;
    if (path.endsWith('/locations')) return [
      {'id': 'home-1', 'type': 'HOME', 'label': 'Saved home', 'serviceAddressConfigured': true},
      {'id': 'home-2', 'type': 'HOME', 'label': 'Other home', 'serviceAddressConfigured': true},
    ];
    if (path.contains('/availability?')) return {'available': true, 'remainingCapacity': 2};
    if (path.endsWith('/visits')) return historyGate?.future ?? {'planId': 'plan-1', 'planOriginVerified': false, 'automaticallyScheduled': false, 'visits': []};
    if (path.endsWith('/technician-continuity')) return {'planId': 'plan-1', 'historicalEvidenceOnly': true, 'technicianAvailabilityConfirmed': false, 'technicianAssignmentGuaranteed': false, 'bookingCreated': false, 'automaticDispatch': false, 'candidates': []};
    throw StateError('Unexpected request $path');
  }
  List<Map<String, dynamic>> get plans => [{'id': 'plan-1', 'offeringId': 'offering-1', 'offeringName': offeringName, 'locationType': 'HOME', 'locationId': 'home-1', 'locationLabel': 'Saved home', 'cadence': 'MONTHLY', 'status': status, 'pricePaise': 75000}];
  List<Map<String, dynamic>> get offerings => [{'id': 'offering-1', 'name': offeringName, 'providerName': 'Provider', 'pricePaise': 90000, 'durationMinutes': 60}];
  @override
  Future<dynamic> patch(String path, [Map<String, dynamic>? body]) async {
    expect(path, endsWith('/plan-1/status')); status = body!['status'] as String; patches++;
    if (patchGate != null) return patchGate!.future;
    if (loseStatusResponse) { loseStatusResponse = false; throw StateError('Committed response lost'); }
    return {};
  }
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
  testWidgets('replacement login closes an old preference confirmation without patching either client', (tester) async {
    final old = RecurringClient(), fresh = RecurringClient()..offeringName = 'Fresh home service';
    await tester.pumpWidget(host(old)); await tester.pumpAndSettle();
    await tester.tap(find.text('Pause preference')); await tester.pumpAndSettle();
    expect(find.text('Confirm preference change'), findsOneWidget);
    await tester.pumpWidget(host(fresh)); await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsNothing);
    expect(find.text('Fresh home service'), findsOneWidget);
    expect(old.patches, 0); expect(fresh.patches, 0);
    expect(tester.takeException(), isNull);
    old.close(); fresh.close();
  });
  testWidgets('repeated preference taps open one dialog and cancel restores actions', (tester) async {
    final api = RecurringClient();
    await tester.pumpWidget(host(api)); await tester.pumpAndSettle();
    final action = tester.widget<TextButton>(find.widgetWithText(TextButton, 'Pause preference')).onPressed!;
    action(); action(); await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsOneWidget); expect(api.patches, 0);
    await tester.tap(find.text('Keep preference')); await tester.pumpAndSettle();
    expect(tester.widget<TextButton>(find.widgetWithText(TextButton, 'Pause preference')).onPressed, isNotNull);
    api.close();
  });
  testWidgets('lost status response requires successful refresh before another mutation or visit', (tester) async {
    final api = RecurringClient()..loseStatusResponse = true;
    await tester.pumpWidget(host(api)); await tester.pumpAndSettle();
    await tester.tap(find.text('Pause preference')); await tester.pumpAndSettle();
    await tester.tap(find.text('Confirm preference change')); await tester.pumpAndSettle();
    expect(api.patches, 1); expect(api.status, 'PAUSED');
    expect(find.textContaining('Preference update could not be confirmed'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Plan one visit')).onPressed, isNull);
    expect(tester.widget<TextButton>(find.widgetWithText(TextButton, 'Cancel preference')).onPressed, isNull);
    api.deny = true;
    await tester.ensureVisible(find.text('Refresh recurring preferences')); await tester.pumpAndSettle();
    await tester.tap(find.text('Refresh recurring preferences')); await tester.pumpAndSettle();
    expect(find.text('Plan one visit'), findsNothing); expect(api.patches, 1);
    api.deny = false;
    await tester.tap(find.text('Refresh recurring preferences')); await tester.pumpAndSettle();
    expect(find.text('Plan one visit'), findsNothing);
    expect(tester.widget<TextButton>(find.widgetWithText(TextButton, 'Resume preference')).onPressed, isNotNull);
    expect(api.writes, isEmpty); api.close();
  });
  testWidgets('late old offering response cannot open booking after login replacement', (tester) async {
    final gate = Completer<dynamic>();
    final old = RecurringClient()..offeringGate = gate;
    final fresh = RecurringClient()..offeringName = 'Fresh home service';
    await tester.pumpWidget(host(old)); await tester.pumpAndSettle();
    await tester.tap(find.text('Plan one visit')); await tester.pump();
    await tester.pumpWidget(host(fresh)); await tester.pumpAndSettle();
    gate.complete(old.offerings); await tester.pumpAndSettle();
    expect(find.text('Fresh home service'), findsOneWidget);
    expect(find.text('Request service'), findsNothing);
    expect(old.writes, isEmpty); expect(fresh.writes, isEmpty);
    expect(tester.takeException(), isNull); old.close(); fresh.close();
  });
  testWidgets('late old list cannot replace fresh login preferences', (tester) async {
    final gate = Completer<dynamic>();
    final old = RecurringClient()..plansGate = gate;
    final fresh = RecurringClient()..offeringName = 'Fresh home service';
    await tester.pumpWidget(host(old)); await tester.pump();
    await tester.pumpWidget(host(fresh)); await tester.pumpAndSettle();
    gate.complete(old.plans); await tester.pumpAndSettle();
    expect(find.text('Fresh home service'), findsOneWidget); expect(find.text('AC service'), findsNothing);
    expect(tester.takeException(), isNull); old.close(); fresh.close();
  });
  testWidgets('replacement login closes old visit history and ignores its pending read', (tester) async {
    final gate = Completer<dynamic>();
    final old = RecurringClient()..historyGate = gate;
    final fresh = RecurringClient()..offeringName = 'Fresh home service';
    await tester.pumpWidget(host(old)); await tester.pumpAndSettle();
    await tester.tap(find.text('Matching visits and technicians')); await tester.pump();
    await tester.pumpWidget(host(fresh)); await tester.pumpAndSettle();
    gate.complete({'planId': 'plan-1', 'planOriginVerified': false, 'automaticallyScheduled': false, 'visits': []});
    await tester.pumpAndSettle();
    expect(find.byType(BottomSheet), findsNothing);
    expect(find.text('Fresh home service'), findsOneWidget);
    expect(tester.takeException(), isNull); old.close(); fresh.close();
  });
  testWidgets('replacement login closes an old explicit booking route', (tester) async {
    final old = RecurringClient(), fresh = RecurringClient()..offeringName = 'Fresh home service';
    await tester.pumpWidget(host(old)); await tester.pumpAndSettle();
    await tester.tap(find.text('Plan one visit')); await tester.pumpAndSettle();
    expect(find.text('₹900'), findsOneWidget);
    await tester.pumpWidget(host(fresh)); await tester.pumpAndSettle();
    expect(find.text('Fresh home service'), findsOneWidget);
    expect(find.text('₹900'), findsNothing);
    expect(old.writes, isEmpty); expect(fresh.writes, isEmpty);
    expect(tester.takeException(), isNull); old.close(); fresh.close();
  });
  testWidgets('old mutation completion cannot unlock a fresh login mutation', (tester) async {
    final oldGate = Completer<dynamic>(), freshGate = Completer<dynamic>();
    final old = RecurringClient()..patchGate = oldGate;
    final fresh = RecurringClient()..patchGate = freshGate;
    await tester.pumpWidget(host(old)); await tester.pumpAndSettle();
    await tester.tap(find.text('Pause preference')); await tester.pumpAndSettle();
    await tester.tap(find.text('Confirm preference change')); await tester.pumpAndSettle();
    await tester.pumpWidget(host(fresh)); await tester.pumpAndSettle();
    await tester.tap(find.text('Pause preference')); await tester.pumpAndSettle();
    await tester.tap(find.text('Confirm preference change')); await tester.pumpAndSettle();
    oldGate.complete({}); await tester.pumpAndSettle();
    expect(tester.widget<TextButton>(find.widgetWithText(TextButton, 'Cancel preference')).onPressed, isNull);
    expect(fresh.patches, 1);
    freshGate.complete({}); await tester.pumpAndSettle();
    expect(find.text('Resume preference'), findsOneWidget);
    expect(tester.takeException(), isNull); old.close(); fresh.close();
  });
  testWidgets('pull refresh cannot invalidate an open preference decision', (tester) async {
    final api = RecurringClient();
    await tester.pumpWidget(host(api)); await tester.pumpAndSettle();
    final refresh = tester.widget<RefreshIndicator>(find.byType(RefreshIndicator)).onRefresh;
    await tester.tap(find.text('Pause preference')); await tester.pumpAndSettle();
    final before = api.reads.length;
    await refresh(); await tester.pumpAndSettle();
    expect(api.reads, hasLength(before));
    await tester.tap(find.text('Confirm preference change')); await tester.pumpAndSettle();
    expect(api.patches, 1); expect(find.text('Resume preference'), findsOneWidget);
    api.close();
  });
  testWidgets('plans one explicit visit using fresh price, fixed location and the same retry key', (tester) async {
    final api = RecurringClient(); await tester.pumpWidget(host(api)); await tester.pumpAndSettle();
    expect(api.writes, isEmpty);
    await tester.tap(find.text('Plan one visit')); await tester.pumpAndSettle();
    expect(find.text('₹900'), findsOneWidget); expect(find.text('Other home'), findsNothing);
    await tester.scrollUntilVisible(find.text('Choose date & time'), 250, scrollable: find.byType(Scrollable).first); await tester.pumpAndSettle(); await tester.tap(find.text('Choose date & time')); await tester.pumpAndSettle();
    await tester.tap(find.text('OK')); await tester.pumpAndSettle();
    await tester.tap(find.text('OK')); await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Request service'), 250, scrollable: find.byType(Scrollable).first); await tester.pumpAndSettle(); await tester.tap(find.text('Request service')); await tester.pumpAndSettle();
    expect(api.writes, hasLength(1));
    // Allow the lost-response SnackBar to leave before the explicit retry tap.
    await tester.pump(const Duration(seconds: 5)); await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Request service'), 250, scrollable: find.byType(Scrollable).first); await tester.pumpAndSettle(); await tester.tap(find.text('Request service')); await tester.pumpAndSettle();
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
