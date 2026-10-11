import 'dart:async';

import 'package:aaraagate_guard/data/guard_api.dart';
import 'package:aaraagate_guard/data/guard_session_store.dart';
import 'package:aaraagate_guard/data/models/guard_boundary_models.dart';
import 'package:aaraagate_guard/data/offline_action_queue.dart';
import 'package:aaraagate_guard/guard_controller.dart';
import 'package:aaraagate_guard/screens/guard_workforce_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

class _DelayedWorkforceApi extends GuardApi {
  _DelayedWorkforceApi() : super(baseUrl: 'http://localhost:3000');

  final requests = <Completer<List<GuardWorkforceAssignment>>>[];
  final requestedGates = <String>[];

  @override
  Future<List<GuardWorkforceAssignment>> eligibleWorkforce({String? query}) {
    final completer = Completer<List<GuardWorkforceAssignment>>();
    requests.add(completer);
    return completer.future;
  }

  @override
  Future<List<GuardSocietyWorker>> eligibleSocietyWorkforce({required String gateId, String? query}) async {
    requestedGates.add(gateId);
    return [
      GuardSocietyWorker.fromJson({
        'id': 'society-worker-$gateId',
        'name': gateId == 'gate-new' ? 'Current Gate Worker' : 'Former Gate Worker',
        'role': 'GARDENER',
        'department': 'GARDENING',
        'present': false,
      }),
    ];
  }

  @override
  Future<List<GuardSocietyWorker>> lookupSocietyWorkforce({required String gateId, required String query}) async => const [];
}

GuardWorkforceAssignment _assignment(String name) => GuardWorkforceAssignment.fromJson({
      'id': name,
      'worker': {'name': name, 'role': 'MAID'},
      'household': {
        'unit': {
          'number': 'A-101',
          'building': {'name': 'Alpha', 'code': 'A'},
        },
      },
    });

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  testWidgets('a previous gate response cannot overwrite the latest staff search', (tester) async {
    final api = _DelayedWorkforceApi();
    final controller = GuardController(
      api: api,
      sessions: const GuardSessionStore(),
      offlineQueue: const OfflineActionQueue(),
    )
      ..session = const GuardSession(
        sessionId: 'session-1',
        accessToken: 'test-token',
        refreshToken: 'refresh-token',
        userId: 'guard-1',
        societyId: 'society-1',
      )
      ..gateId = 'gate-old';

    await tester.pumpWidget(MaterialApp(home: GuardWorkforceScreen(controller: controller)));
    await tester.pump(const Duration(milliseconds: 100));
    expect(api.requests, hasLength(1));

    controller.gateId = 'gate-new';
    await tester.enterText(find.widgetWithText(TextField, 'Search staff'), 'Ravi');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pump(const Duration(milliseconds: 100));
    expect(api.requests, hasLength(2));

    api.requests.last.complete([_assignment('Current Household Worker')]);
    await tester.pump(const Duration(milliseconds: 100));
    expect(api.requestedGates, ['gate-new']);
    expect(find.text('Current Gate Worker'), findsOneWidget);

    api.requests.first.complete([_assignment('Stale Household Worker')]);
    await tester.pump(const Duration(milliseconds: 100));
    expect(api.requestedGates, ['gate-new']);
    expect(find.text('Current Gate Worker'), findsOneWidget);
    expect(find.text('Stale Household Worker'), findsNothing);

    await tester.pumpWidget(const MaterialApp(home: SizedBox()));
    controller.dispose();
  });

  testWidgets('a missing gate never retains the previous workforce list', (tester) async {
    final api = _DelayedWorkforceApi();
    final controller = GuardController(
      api: api,
      sessions: const GuardSessionStore(),
      offlineQueue: const OfflineActionQueue(),
    )
      ..session = const GuardSession(
        sessionId: 'session-2',
        accessToken: 'test-token',
        refreshToken: 'refresh-token',
        userId: 'guard-1',
        societyId: 'society-1',
      )
      ..gateId = 'gate-new';

    await tester.pumpWidget(MaterialApp(home: GuardWorkforceScreen(controller: controller)));
    await tester.pump(const Duration(milliseconds: 100));
    api.requests.single.complete([_assignment('Former Household Worker')]);
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Current Gate Worker'), findsOneWidget);

    controller.gateId = null;
    await tester.tap(find.byTooltip('Search'));
    await tester.pump();
    expect(find.text('Select an active gate first.'), findsOneWidget);
    expect(find.text('Current Gate Worker'), findsNothing);
    expect(find.text('Former Household Worker'), findsNothing);

    await tester.pumpWidget(const MaterialApp(home: SizedBox()));
    controller.dispose();
  });
}
