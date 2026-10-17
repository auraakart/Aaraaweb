import 'dart:async';

import 'package:aaraagate_guard/data/guard_api.dart';
import 'package:aaraagate_guard/data/guard_session_store.dart';
import 'package:aaraagate_guard/data/models/guard_boundary_models.dart';
import 'package:aaraagate_guard/data/offline_action_queue.dart';
import 'package:aaraagate_guard/data/workforce_offline_queue.dart';
import 'package:aaraagate_guard/guard_controller.dart';
import 'package:aaraagate_guard/screens/guard_workforce_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

class _RecoveryApi extends GuardApi {
  _RecoveryApi({this.transport = false}) : super(baseUrl: 'http://localhost:3000');
  final bool transport;
  int calls = 0;

  @override
  Future<Map<String, dynamic>> workforceCheckIn({required String gateId, required String assignmentId, required String idempotencyKey}) async {
    calls++;
    throw GuardApiException(transport ? 'No network' : 'Attendance conflict', statusCode: transport ? null : 409, transport: transport);
  }

  @override
  Future<List<GuardWorkforceAssignment>> eligibleWorkforce({String? query}) async => const [];
  @override
  Future<List<GuardSocietyWorker>> eligibleSocietyWorkforce({required String gateId, String? query}) async => const [];
}

class _PendingReplayApi extends _RecoveryApi {
  final first = Completer<Map<String, dynamic>>();
  final keys = <String>[];
  @override
  Future<Map<String, dynamic>> workforceCheckIn({required String gateId, required String assignmentId, required String idempotencyKey}) {
    calls++;
    keys.add(idempotencyKey);
    return calls == 1 ? first.future : Future.value(<String, dynamic>{});
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  Future<void> seed() async {
    await const WorkforceOfflineQueue().enqueue(QueuedWorkforceAction(
      type: 'CHECK_IN', gateId: 'gate-1', assignmentId: 'assignment-1',
      idempotencyKey: 'stable-key', createdAt: DateTime.now().toUtc(),
      societyId: 'society-1', guardUserId: 'guard-1',
    ));
  }

  GuardController controller(_RecoveryApi api) => GuardController(
    api: api,
    sessions: const GuardSessionStore(),
    offlineQueue: const OfflineActionQueue(),
  )..session = const GuardSession(
    sessionId: 'session-1', accessToken: 'token', refreshToken: 'refresh',
    userId: 'guard-1', societyId: 'society-1',
  )..gateId = 'gate-1';

  testWidgets('overlapping searches share one attendance replay', (tester) async {
    await seed();
    final api = _PendingReplayApi();
    final c = controller(api);
    await tester.pumpWidget(MaterialApp(home: GuardWorkforceScreen(controller: c)));
    await tester.pump(const Duration(milliseconds: 100));
    expect(api.calls, 1);
    await tester.enterText(find.widgetWithText(TextField, 'Search staff'), 'Maid');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pump(const Duration(milliseconds: 100));
    expect(api.calls, 1);
    api.first.complete(<String, dynamic>{});
    await tester.pumpAndSettle();
    expect(api.keys, ['stable-key']);
    expect(await const WorkforceOfflineQueue().read(), isEmpty);
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));
    c.dispose();
  });

  testWidgets('guard switch stops the remaining replay and preserves original retry keys', (tester) async {
    await seed();
    await const WorkforceOfflineQueue().enqueue(QueuedWorkforceAction(
      type: 'CHECK_IN', gateId: 'gate-1', assignmentId: 'assignment-2',
      idempotencyKey: 'second-key', createdAt: DateTime.now().toUtc(),
      societyId: 'society-1', guardUserId: 'guard-1',
    ));
    final api = _PendingReplayApi();
    final c = controller(api);
    await tester.pumpWidget(MaterialApp(home: GuardWorkforceScreen(controller: c)));
    await tester.pump(const Duration(milliseconds: 100));
    expect(api.calls, 1);
    c.session = const GuardSession(sessionId: 'session-2', accessToken: 'next-token', refreshToken: 'next-refresh', userId: 'guard-2', societyId: 'society-2');
    c.gateId = 'gate-2';
    api.accessToken = 'next-token';
    await tester.enterText(find.widgetWithText(TextField, 'Search staff'), 'New guard');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    api.first.complete(<String, dynamic>{});
    await tester.pumpAndSettle();
    expect(api.keys, ['stable-key']);
    final stored = await const WorkforceOfflineQueue().read();
    expect(stored.map((action) => action.idempotencyKey), ['stable-key', 'second-key']);
    expect(stored.every((action) => action.guardUserId == 'guard-1' && action.societyId == 'society-1'), isTrue);
    expect(find.textContaining('actions synced.'), findsNothing);
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));
    c.dispose();
  });

  testWidgets('a rejected attendance action is not resent on refresh', (tester) async {
    await seed();
    final api = _RecoveryApi();
    final c = controller(api);
    await tester.pumpWidget(MaterialApp(home: GuardWorkforceScreen(controller: c)));
    await tester.pumpAndSettle();
    expect(api.calls, 1);
    final stored = (await const WorkforceOfflineQueue().read()).single;
    expect(stored.reviewRequired, isTrue);
    expect(stored.failureKind, 'CONFLICT');
    expect(find.textContaining('supervisor review'), findsWidgets);

    await tester.tap(find.byTooltip('Search'));
    await tester.pumpAndSettle();
    expect(api.calls, 1);
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));
    c.dispose();
  });

  testWidgets('a transport failure is deferred rather than replayed on each search', (tester) async {
    await seed();
    final api = _RecoveryApi(transport: true);
    final c = controller(api);
    await tester.pumpWidget(MaterialApp(home: GuardWorkforceScreen(controller: c)));
    await tester.pumpAndSettle();
    expect(api.calls, 1);
    final stored = (await const WorkforceOfflineQueue().read()).single;
    expect(stored.reviewRequired, isFalse);
    expect(stored.nextAttemptAt, isNotNull);

    await tester.tap(find.byTooltip('Search'));
    await tester.pumpAndSettle();
    expect(api.calls, 1);
    await tester.pumpWidget(const MaterialApp(home: SizedBox()));
    c.dispose();
  });
}
