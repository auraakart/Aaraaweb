import 'dart:async';
import 'package:aaraagate_guard/data/guard_api.dart';
import 'package:aaraagate_guard/data/guard_session_store.dart';
import 'package:aaraagate_guard/data/offline_action_queue.dart';
import 'package:aaraagate_guard/guard_controller.dart';
import 'package:flutter_test/flutter_test.dart';

class _DelayedGateApi extends GuardApi {
  _DelayedGateApi() : super(baseUrl: 'http://localhost:3000');

  final walkIn = Completer<Map<String, dynamic>>();
  final arrival = Completer<Map<String, dynamic>>();
  final verify = Completer<Map<String, dynamic>>();
  final status = Completer<Map<String, dynamic>>();

  @override
  Future<Map<String, dynamic>> createWalkIn({required String gateId, required String unitId, required String name, String? phone, String? purpose}) => walkIn.future;

  @override
  Future<Map<String, dynamic>> createGateArrival({required String gateId, required String unitId, required String subjectType, required String name, String? provider, String? phone, String? vehicleNumber, String? note}) => arrival.future;

  @override
  Future<Map<String, dynamic>> verifyAccess(String gateId, String credential) => verify.future;

  @override
  Future<Map<String, dynamic>> requestStatus(String gateId, String requestId) => status.future;
}

const _originalSession = GuardSession(
  sessionId: 'session-old', accessToken: 'token', refreshToken: 'refresh',
  userId: 'guard-old', societyId: 'society-1',
);

GuardController _controller(_DelayedGateApi api) => GuardController(
  api: api,
  sessions: const GuardSessionStore(),
  offlineQueue: const OfflineActionQueue(),
)..session = _originalSession
 ..gateId = 'gate-old';

void main() {
  test('late walk-in response cannot restore the previous gate request', () async {
    final api = _DelayedGateApi();
    final controller = _controller(api);
    final pending = controller.createWalkIn(unitId: 'unit-1', name: 'Guest');
    controller.selectGate('gate-new');
    api.walkIn.complete({'id': 'old-request', 'status': 'PENDING'});
    await pending;
    expect(controller.walkInAccess, isNull);
    expect(controller.gateId, 'gate-new');
    controller.dispose();
  });

  test('switching away and back still invalidates an in-flight arrival response', () async {
    final api = _DelayedGateApi();
    final controller = _controller(api);
    final pending = controller.createGateArrival(unitId: 'unit-1', subjectType: 'DELIVERY', name: 'Courier');
    controller.selectGate('gate-new');
    controller.selectGate('gate-old');
    api.arrival.complete({'id': 'stale-arrival', 'status': 'PENDING'});
    await pending;
    expect(controller.walkInAccess, isNull);
    controller.dispose();
  });

  test('a late verification cannot appear under another guard session', () async {
    final api = _DelayedGateApi();
    final controller = _controller(api);
    final pending = controller.verifyCredential('pass');
    controller.session = const GuardSession(
      sessionId: 'session-new', accessToken: 'new', refreshToken: 'refresh',
      userId: 'guard-new', societyId: 'society-1',
    );
    api.verify.complete({'id': 'old-person', 'status': 'APPROVED'});
    await pending;
    expect(controller.verifiedAccess, isNull);
    controller.dispose();
  });

  test('a refresh must not resurrect a cleared gate request', () async {
    final api = _DelayedGateApi();
    final controller = _controller(api);
    controller.walkInAccess = {'id': 'old-request', 'status': 'PENDING'};
    final pending = controller.refreshWalkIn();
    controller.clearWalkIn();
    api.status.complete({'id': 'old-request', 'status': 'APPROVED'});
    await pending;
    expect(controller.walkInAccess, isNull);
    controller.dispose();
  });
}
