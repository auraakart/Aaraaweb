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
  final credentialCheckIn = Completer<Map<String, dynamic>>();
  final credentialCheckOut = Completer<Map<String, dynamic>>();
  final walkInCheckIn = Completer<Map<String, dynamic>>();
  final walkInCheckOut = Completer<Map<String, dynamic>>();

  @override
  Future<Map<String, dynamic>> createWalkIn({required String gateId, required String unitId, required String name, String? phone, String? purpose}) => walkIn.future;

  @override
  Future<Map<String, dynamic>> createGateArrival({required String gateId, required String unitId, required String subjectType, required String name, String? provider, String? phone, String? vehicleNumber, String? note}) => arrival.future;

  @override
  Future<Map<String, dynamic>> verifyAccess(String gateId, String credential) => verify.future;

  @override
  Future<Map<String, dynamic>> requestStatus(String gateId, String requestId) => status.future;

  @override
  Future<Map<String, dynamic>> checkIn(String gateId, String credential, String idempotencyKey) => credentialCheckIn.future;

  @override
  Future<Map<String, dynamic>> checkOut(String gateId, String credential, String idempotencyKey) => credentialCheckOut.future;

  @override
  Future<Map<String, dynamic>> checkInRequest(String gateId, String requestId, String idempotencyKey) => walkInCheckIn.future;

  @override
  Future<Map<String, dynamic>> checkOutRequest(String gateId, String requestId, String idempotencyKey) => walkInCheckOut.future;
}

class _MemoryOfflineQueue extends OfflineActionQueue {
  final actions = <QueuedGateAction>[];

  @override
  Future<void> enqueue(QueuedGateAction action) async => actions.add(action);

  @override
  Future<List<QueuedGateAction>> read() async => List.unmodifiable(actions);
}

const _originalSession = GuardSession(
  sessionId: 'session-old', accessToken: 'token', refreshToken: 'refresh',
  userId: 'guard-old', societyId: 'society-1',
);

GuardController _controller(_DelayedGateApi api, {OfflineActionQueue? offlineQueue}) => GuardController(
  api: api,
  sessions: const GuardSessionStore(),
  offlineQueue: offlineQueue ?? const OfflineActionQueue(),
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
  test('late credential check-in cannot replace the next gate verified card', () async {
    final api = _DelayedGateApi();
    final controller = _controller(api);
    final pending = controller.checkIn('credential-old');
    controller.selectGate('gate-new');
    api.credentialCheckIn.complete({'id': 'old-entry', 'status': 'CHECKED_IN'});
    await pending;
    expect(controller.verifiedAccess, isNull);
    expect(controller.error, isNull);
    expect(controller.gateId, 'gate-new');
    controller.dispose();
  });

  test('late credential check-out cannot replace a new guard session', () async {
    final api = _DelayedGateApi();
    final controller = _controller(api);
    final pending = controller.checkOut('credential-old');
    controller.session = const GuardSession(
      sessionId: 'session-new', accessToken: 'token-new', refreshToken: 'refresh-new',
      userId: 'guard-new', societyId: 'society-2',
    );
    api.credentialCheckOut.complete({'id': 'old-exit', 'status': 'CHECKED_OUT'});
    await pending;
    expect(controller.verifiedAccess, isNull);
    expect(controller.error, isNull);
    controller.dispose();
  });

  test('uncertain credential mutation retains the originating guard and gate after a session switch', () async {
    final api = _DelayedGateApi();
    final queue = _MemoryOfflineQueue();
    final controller = _controller(api, offlineQueue: queue);
    final pending = controller.checkIn('credential-old');
    controller.session = const GuardSession(
      sessionId: 'session-new', accessToken: 'token-new', refreshToken: 'refresh-new',
      userId: 'guard-new', societyId: 'society-2',
    );
    controller.selectGate('gate-new');
    api.credentialCheckIn.completeError(GuardApiException('connection dropped', transport: true));
    await pending;
    expect(queue.actions, hasLength(1));
    final original = queue.actions.single;
    expect(original.societyId, _originalSession.societyId);
    expect(original.guardUserId, _originalSession.userId);
    expect(original.gateId, 'gate-old');
    expect(original.credential, 'credential-old');
    expect(original.idempotencyKey, isNotEmpty);
    expect(controller.queuedActions, 0);
    expect(controller.offlineSyncMessage, isNull);
    expect(controller.error, isNull);
    controller.dispose();
  });

  test('current guard still gets a recoverable offline confirmation', () async {
    final api = _DelayedGateApi();
    final queue = _MemoryOfflineQueue();
    final controller = _controller(api, offlineQueue: queue);
    final pending = controller.checkIn('credential-old');
    api.credentialCheckIn.completeError(GuardApiException('connection dropped', transport: true));
    await pending;
    expect(queue.actions, hasLength(1));
    expect(controller.queuedActions, 1);
    expect(controller.error, contains('saved and will sync safely'));
    controller.dispose();
  });

  test('a late walk-in check-in cannot resurrect the previous gate request', () async {
    final api = _DelayedGateApi();
    final controller = _controller(api);
    controller.walkInAccess = {'id': 'old-request', 'status': 'APPROVED'};
    final pending = controller.checkInWalkIn();
    controller.selectGate('gate-new');
    api.walkInCheckIn.complete({'id': 'old-request', 'status': 'CHECKED_IN'});
    await pending;
    expect(controller.walkInAccess, isNull);
    expect(controller.error, isNull);
    controller.dispose();
  });

  test('a late walk-in check-out cannot overwrite a newer active request', () async {
    final api = _DelayedGateApi();
    final controller = _controller(api);
    controller.walkInAccess = {'id': 'old-request', 'status': 'CHECKED_IN'};
    final pending = controller.checkOutWalkIn();
    controller.walkInAccess = {'id': 'new-request', 'status': 'APPROVED'};
    api.walkInCheckOut.complete({'id': 'old-request', 'status': 'CHECKED_OUT'});
    await pending;
    expect(controller.walkInAccess?['id'], 'new-request');
    expect(controller.walkInAccess?['status'], 'APPROVED');
    expect(controller.error, isNull);
    controller.dispose();
  });

  test('a late failed walk-in write is silent after switching gates', () async {
    final api = _DelayedGateApi();
    final controller = _controller(api);
    controller.walkInAccess = {'id': 'old-request', 'status': 'APPROVED'};
    final pending = controller.checkInWalkIn();
    controller.selectGate('gate-new');
    api.walkInCheckIn.completeError(GuardApiException('offline', transport: true));
    await pending;
    expect(controller.walkInAccess, isNull);
    expect(controller.error, isNull);
    controller.dispose();
  });

}
