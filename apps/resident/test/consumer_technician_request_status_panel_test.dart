import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/widgets/consumer_technician_request_status_panel.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _StatusClient extends ApiClient {
  _StatusClient() : super(baseUrl: 'http://test', accessToken: 'token');
  String status = 'AWAITING_ASSIGNMENT';
  bool deny = false;
  int reads = 0;

  @override
  Future<dynamic> get(String path) async {
    if (!path.endsWith('/technician-request-status')) throw StateError('Unexpected GET $path');
    reads++;
    if (deny) throw StateError('Access denied');
    return {
      'requestStatus': status,
      'requestedTechnicianName': 'Ravi',
      'assignedTechnicianName': 'Anil',
      'canChangeRequest': status == 'AWAITING_ASSIGNMENT' || status == 'NO_REQUEST',
      'statusSnapshotOnly': true,
      'assignmentByRequestProven': false,
    };
  }
}

Widget _host(ApiClient api, {ValueChanged<bool>? editability}) => MaterialApp(
  home: Scaffold(body: SingleChildScrollView(
    child: ConsumerTechnicianRequestStatusPanel(
      apiClient: api, bookingId: '11111111-1111-4111-8111-111111111111',
      onEditabilityChanged: editability,
    ),
  )),
);

void main() {
  for (final scenario in <String, String>{
    'NO_REQUEST': 'No technician requested',
    'AWAITING_ASSIGNMENT': 'Waiting for technician assignment',
    'REQUESTED_TECHNICIAN_ASSIGNED': 'Requested technician assigned',
    'OTHER_TECHNICIAN_ASSIGNED': 'Different technician assigned',
    'REQUEST_CLOSED': 'Technician request closed',
  }.entries) {
    testWidgets('reconciles ${scenario.key} with explicit resident-friendly copy', (tester) async {
      final api = _StatusClient()..status = scenario.key;
      final editing = <bool>[];
      await tester.pumpWidget(_host(api, editability: editing.add));
      await tester.pumpAndSettle();
      expect(find.text(scenario.value), findsOneWidget);
      expect(editing.last, scenario.key == 'NO_REQUEST' || scenario.key == 'AWAITING_ASSIGNMENT');
      if (scenario.key == 'AWAITING_ASSIGNMENT') {
        expect(find.textContaining('not a confirmed assignment'), findsOneWidget);
      }
      if (scenario.key == 'OTHER_TECHNICIAN_ASSIGNED') {
        expect(find.textContaining('Requested: Ravi.'), findsOneWidget);
        expect(find.textContaining('Assigned: Anil.'), findsOneWidget);
      }
      if (scenario.key == 'REQUESTED_TECHNICIAN_ASSIGNED') {
        expect(find.textContaining('does not prove how'), findsOneWidget);
      }
      api.close();
    });
  }

  testWidgets('denied read does not fabricate assignment or enable changing a request', (tester) async {
    final api = _StatusClient()..deny = true;
    final editing = <bool>[];
    await tester.pumpWidget(_host(api, editability: editing.add));
    await tester.pumpAndSettle();
    expect(find.text('Retry technician status'), findsOneWidget);
    expect(find.text('Requested technician assigned'), findsNothing);
    expect(editing.last, false);
    api.deny = false;
    await tester.tap(find.text('Retry technician status'));
    await tester.pumpAndSettle();
    expect(find.text('Waiting for technician assignment'), findsOneWidget);
    expect(editing.last, true);
    api.close();
  });

  testWidgets('new widget key refreshes stale assignment evidence', (tester) async {
    final api = _StatusClient();
    Widget host(int revision) => MaterialApp(
      home: Scaffold(body: ConsumerTechnicianRequestStatusPanel(
        key: ValueKey('status-$revision'), apiClient: api, bookingId: 'booking',
      )),
    );
    await tester.pumpWidget(host(0));
    await tester.pumpAndSettle();
    expect(find.text('Waiting for technician assignment'), findsOneWidget);
    api.status = 'OTHER_TECHNICIAN_ASSIGNED';
    await tester.pumpWidget(host(1));
    await tester.pumpAndSettle();
    expect(find.text('Different technician assigned'), findsOneWidget);
    expect(api.reads, 2);
    api.close();
  });
}
