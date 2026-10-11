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
