import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/widgets/consumer_technician_preference_panel.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

const bookingId = '11111111-1111-4111-8111-111111111111';
const technicianId = '22222222-2222-4222-8222-222222222222';

class FakeTechnicianClient extends ApiClient {
  FakeTechnicianClient() : super(baseUrl: 'http://test', accessToken: 'token');
  List<Map<String, dynamic>> candidates = [
    {'agentId': technicianId, 'displayName': 'Ravi', 'completedVisits': 2}
  ];
  String? savedId;
  String? savedName;
  bool failReads = false;
  bool failWrites = false;
  final putBodies = <Map<String, dynamic>>[];
  final paths = <String>[];

  @override
  Future<dynamic> get(String path) async {
    paths.add(path);
    if (failReads) throw StateError('No current booking access');
    if (path.endsWith('/technician-candidates')) {
      return {'candidates': candidates, 'availabilityConfirmed': false};
    }
    if (path.endsWith('/technician-preference')) {
      return {'agentId': savedId, 'displayName': savedName,
        'technicianRecordActive': savedId != null};
    }
    throw StateError('Unexpected GET $path');
  }

  @override
  Future<dynamic> put(String path, [Map<String, dynamic>? body]) async {
    if (failWrites) throw StateError('Booking assigned concurrently');
    paths.add(path);
    putBodies.add(body ?? {});
    savedId = body?['agentId']?.toString();
    savedName = savedId == null ? null : 'Ravi';
    return {'agentId': savedId, 'requestOnly': true, 'assignmentGuaranteed': false};
  }
}

Widget host(ApiClient client, {String id = bookingId}) => MaterialApp(
  home: Scaffold(
    body: SingleChildScrollView(
      child: ConsumerTechnicianPreferencePanel(apiClient: client, bookingId: id),
    ),
  ),
);

void main() {
  testWidgets('loads booking-scoped choices and does not automatically request anyone', (tester) async {
    final client = FakeTechnicianClient();
    await tester.pumpWidget(host(client));
    await tester.pumpAndSettle();
    expect(client.paths, contains('/api/v1/consumer/services/bookings/$bookingId/technician-candidates'));
    expect(client.paths, contains('/api/v1/consumer/services/bookings/$bookingId/technician-preference'));
    expect(find.text('Request a familiar technician'), findsOneWidget);
    expect(find.textContaining('Ravi · 2 past completed visit(s)'), findsOneWidget);
    expect(find.textContaining('assignment are not guaranteed'), findsOneWidget);
    expect(client.putBodies, isEmpty);
    client.close();
  });

  testWidgets('parent is notified only after a confirmed server save', (tester) async {
    final client = FakeTechnicianClient();
    var notified = 0;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: ConsumerTechnicianPreferencePanel(
        apiClient: client, bookingId: bookingId,
        onSaved: () => notified++,
      )),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(ChoiceChip));
    await tester.pumpAndSettle();
    client.failWrites = true;
    await tester.tap(find.text('Save technician request'));
    await tester.pumpAndSettle();
    expect(notified, 0);
    client.failWrites = false;
    await tester.tap(find.text('Save technician request'));
    await tester.pumpAndSettle();
    expect(notified, 1);
    client.close();
  });

  testWidgets('explicitly saves a technician then re-reads server state', (tester) async {
    final client = FakeTechnicianClient();
    await tester.pumpWidget(host(client));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(ChoiceChip));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save technician request'));
    await tester.pumpAndSettle();
    expect(client.putBodies.single['agentId'], technicianId);
    expect(client.savedId, technicianId);
    expect(client.paths.where((p) => p.endsWith('/technician-preference')).length, 3);
    client.close();
  });

  testWidgets('explicitly clears a saved preference', (tester) async {
    final client = FakeTechnicianClient()..savedId = technicianId..savedName = 'Ravi';
    await tester.pumpWidget(host(client));
    await tester.pumpAndSettle();
    await tester.tap(find.text('No technician preference'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save technician request'));
    await tester.pumpAndSettle();
    expect(client.putBodies.single, {'agentId': null});
    expect(client.savedId, isNull);
    client.close();
  });

  testWidgets('empty eligible history offers no invented technician request', (tester) async {
    final client = FakeTechnicianClient()..candidates = [];
    await tester.pumpWidget(host(client));
    await tester.pumpAndSettle();
    expect(find.textContaining('No technician from your completed visits'), findsOneWidget);
    expect(tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Save technician request')).onPressed, isNull);
    expect(client.putBodies, isEmpty);
    client.close();
  });

  testWidgets('access/network denial hides choices and offers retry', (tester) async {
    final client = FakeTechnicianClient()..failReads = true;
    await tester.pumpWidget(host(client));
    await tester.pumpAndSettle();
    expect(find.text('Retry technician choices'), findsOneWidget);
    expect(find.byType(ChoiceChip), findsNothing);
    client.failReads = false;
    await tester.tap(find.text('Retry technician choices'));
    await tester.pumpAndSettle();
    expect(find.byType(ChoiceChip), findsOneWidget);
    client.close();
  });

  testWidgets('failed write never claims success and permits retry', (tester) async {
    final client = FakeTechnicianClient()..failWrites = true;
    await tester.pumpWidget(host(client));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(ChoiceChip));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save technician request'));
    await tester.pumpAndSettle();
    expect(client.savedId, isNull);
    client.failWrites = false;
    await tester.tap(find.text('Save technician request'));
    await tester.pumpAndSettle();
    expect(client.savedId, technicianId);
    client.close();
  });
}
