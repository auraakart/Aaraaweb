import 'package:aaraagate_guard/data/guard_api.dart';
import 'package:aaraagate_guard/data/guard_session_store.dart';
import 'package:aaraagate_guard/data/offline_action_queue.dart';
import 'package:aaraagate_guard/guard_controller.dart';
import 'package:flutter_test/flutter_test.dart';

class _UncertainWalkInApi extends GuardApi {
  _UncertainWalkInApi() : super(baseUrl: 'http://localhost:3000');

  final keys = <String>[];
  int statusReads = 0;
  String status = 'APPROVED';
  bool denyStatusRead = false;

  @override
  Future<Map<String, dynamic>> checkInRequest(String gateId, String requestId, String idempotencyKey) async {
    keys.add(idempotencyKey);
    if (keys.length == 1) throw GuardApiException('Timeout', transport: true);
    status = 'CHECKED_IN';
    return {'id': requestId, 'status': status};
  }

  @override
  Future<Map<String, dynamic>> requestStatus(String gateId, String requestId) async {
    statusReads++;
    if (denyStatusRead) throw GuardApiException('Offline', transport: true);
    return {'id': requestId, 'status': status};
  }
}

GuardController _controller(_UncertainWalkInApi api) {
  final c = GuardController(
    api: api, sessions: const GuardSessionStore(), offlineQueue: const OfflineActionQueue(),
  );
  c.session = const GuardSession(
    sessionId: 'session-1', accessToken: 'token', refreshToken: 'refresh',
    userId: 'guard-1', societyId: 'society-1',
  );
  c.gateId = 'gate-1';
  c.walkInAccess = {'id': 'request-1', 'status': 'APPROVED'};
  return c;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('a lost walk-in check-in response reuses its original idempotency key', () async {
    final api = _UncertainWalkInApi();
    final c = _controller(api);
    await c.checkInWalkIn();
    expect(c.error, contains('unconfirmed'));
    expect(api.keys, hasLength(1));

    await c.checkInWalkIn();
    expect(api.statusReads, 1);
    expect(api.keys, hasLength(2));
    expect(api.keys.first, api.keys.last);
    expect(c.walkInAccess?['status'], 'CHECKED_IN');
    expect(c.error, isNull);
    c.dispose();
  });

  test('server-confirmed check-in after lost response must not be submitted again', () async {
    final api = _UncertainWalkInApi();
    final c = _controller(api);
    await c.checkInWalkIn();
    api.status = 'CHECKED_IN';
    await c.checkInWalkIn();
    expect(api.keys, hasLength(1));
    expect(c.walkInAccess?['status'], 'CHECKED_IN');
    expect(api.statusReads, 1);
    c.dispose();
  });

  test('unknown status cannot trigger another access mutation', () async {
    final api = _UncertainWalkInApi();
    final c = _controller(api);
    await c.checkInWalkIn();
    api.denyStatusRead = true;
    await c.checkInWalkIn();
    expect(api.keys, hasLength(1));
    expect(c.error, contains('unconfirmed'));
    api.denyStatusRead = false;
    await c.checkInWalkIn();
    expect(api.keys, hasLength(2));
    expect(api.keys.first, api.keys.last);
    c.dispose();
  });

  test('different gate or request never inherits an uncertain mutation key', () async {
    final api = _UncertainWalkInApi();
    final c = _controller(api);
    await c.checkInWalkIn();
    final oldKey = api.keys.single;
    c.selectGate('gate-2');
    c.walkInAccess = {'id': 'request-2', 'status': 'APPROVED'};
    await c.checkInWalkIn();
    expect(api.statusReads, 0);
    expect(api.keys.last, isNot(oldKey));
    c.dispose();
  });
}
