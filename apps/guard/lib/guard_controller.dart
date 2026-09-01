import 'dart:convert';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'data/guard_api.dart';
import 'data/guard_session_store.dart';
import 'data/offline_action_queue.dart';

class GuardController extends ChangeNotifier {
  GuardController({required this.api, required this.sessions, required this.offlineQueue});

  final GuardApi api;
  final GuardSessionStore sessions;
  final OfflineActionQueue offlineQueue;

  bool booting = true;
  bool busy = false;
  String? error;
  String? challengeId;
  String? userId;
  String? selectionToken;
  GuardSession? session;
  List<Map<String, dynamic>> memberships = const [];
  List<Map<String, dynamic>> gates = const [];
  List<Map<String, dynamic>> units = const [];
  String? gateId;
  Map<String, dynamic>? verifiedAccess;
  Map<String, dynamic>? walkInAccess;
  int queuedActions = 0;

  bool get signedIn => session != null;
  bool get needsSocietySelection => session == null && userId != null && memberships.length > 1 && selectionToken != null;
  String? get gateName {
    final match = gates.where((g) => g['id']?.toString() == gateId).toList();
    return match.isEmpty ? null : (match.first['name'] ?? match.first['code'])?.toString();
  }

  Future<void> bootstrap() async {
    try {
      queuedActions = (await offlineQueue.read()).length;
      final stored = await sessions.read();
      if (stored != null) {
        session = stored;
        userId = stored.userId;
        api.accessToken = stored.accessToken;
        try {
          await loadGates();
          if (queuedActions > 0) await syncQueuedActions();
        } on GuardApiException catch (e) {
          if (e.statusCode == 401) {
            await _refresh(stored);
          } else {
            rethrow;
          }
        }
      }
    } catch (e) {
      error = e.toString();
    } finally {
      booting = false;
      notifyListeners();
    }
  }

  Future<void> requestOtp(String phone) => _run(() async {
        final result = await api.requestOtp(phone.trim());
        challengeId = result['challengeId']?.toString();
        if (challengeId == null) throw StateError('OTP challenge was not returned');
      });

  Future<void> verifyOtp(String code) => _run(() async {
        if (challengeId == null) throw StateError('Request an OTP first');
        final result = await api.verifyOtp(challengeId!, code.trim());
        userId = result['userId']?.toString();
        selectionToken = result['selectionToken']?.toString();
        memberships = _guardMemberships(_maps(result['memberships']));
        if (memberships.isEmpty) throw StateError('This account does not have an active security guard role');

        final rawSession = result['session'];
        if (rawSession is Map && memberships.length == 1) {
          final societyId = memberships.first['societyId']?.toString();
          if (societyId == null) throw StateError('Society membership is missing');
          await _acceptSession(Map<String, dynamic>.from(rawSession), societyId);
          await loadGates();
        } else if (memberships.length == 1) {
          if (selectionToken == null) throw StateError('Society selection token was not returned');
          await selectSociety(memberships.first['societyId'].toString());
        }
      });

  Future<void> selectSociety(String societyId) => _run(() async {
        if (userId == null || selectionToken == null) throw StateError('OTP verification is required');
        final selected = memberships.where((m) => m['societyId']?.toString() == societyId).toList();
        if (selected.isEmpty) throw StateError('Selected society is not available for this guard account');
        final result = await api.selectSociety(userId: userId!, societyId: societyId, selectionToken: selectionToken!);
        final rawSession = result['session'];
        if (rawSession is! Map) throw StateError('Session was not returned');
        await _acceptSession(Map<String, dynamic>.from(rawSession), societyId);
        selectionToken = null;
        memberships = const [];
        await loadGates();
      });

  Future<void> loadGates() async {
    final results = await Future.wait([api.gates(), api.gateUnits()]);
    gates = results[0].where((g) => g['active'] != false).toList(growable: false);
    units = results[1];
    if (gateId == null || !gates.any((g) => g['id']?.toString() == gateId)) {
      gateId = gates.isEmpty ? null : gates.first['id']?.toString();
    }
    notifyListeners();
  }

  void selectGate(String? value) {
    gateId = value;
    verifiedAccess = null;
    walkInAccess = null;
    notifyListeners();
  }

  Future<void> createWalkIn({required String unitId, required String name, String? phone, String? purpose}) => _run(() async {
        final gate = _requireGate();
        walkInAccess = await api.createWalkIn(gateId: gate, unitId: unitId, name: name.trim(), phone: phone, purpose: purpose);
      });

  Future<void> refreshWalkIn() => _run(() async {
        final requestId = walkInAccess?['id']?.toString();
        if (requestId == null) throw StateError('No walk-in approval is active');
        walkInAccess = await api.requestStatus(_requireGate(), requestId);
      });

  Future<void> checkInWalkIn() => _walkInMutation('CHECK_IN');
  Future<void> checkOutWalkIn() => _walkInMutation('CHECK_OUT');

  Future<void> _walkInMutation(String type) => _run(() async {
        final requestId = walkInAccess?['id']?.toString();
        if (requestId == null) throw StateError('No walk-in approval is active');
        final gate = _requireGate();
        final key = _idempotencyKey();
        walkInAccess = type == 'CHECK_IN'
            ? await api.checkInRequest(gate, requestId, key)
            : await api.checkOutRequest(gate, requestId, key);
      });

  void clearWalkIn() {
    walkInAccess = null;
    notifyListeners();
  }

  Future<void> verifyCredential(String credential) => _run(() async {
        final gate = _requireGate();
        final value = credential.trim();
        if (value.isEmpty) throw StateError('Scan or enter an access credential');
        verifiedAccess = await api.verifyAccess(gate, value);
      });

  Future<void> checkIn(String credential) => _gateMutation('CHECK_IN', credential);
  Future<void> checkOut(String credential) => _gateMutation('CHECK_OUT', credential);

  Future<void> _gateMutation(String type, String credential) async {
    await _run(() async {
      final value = credential.trim();
      if (value.isEmpty) throw StateError('Scan or enter an access credential');
      final gate = _requireGate();
      final key = _idempotencyKey();
      try {
        verifiedAccess = type == 'CHECK_IN' ? await api.checkIn(gate, value, key) : await api.checkOut(gate, value, key);
      } on GuardApiException catch (e) {
        if (!e.transport) rethrow;
        await offlineQueue.enqueue(QueuedGateAction(type: type, gateId: gate, credential: value, idempotencyKey: key, createdAt: DateTime.now()));
        queuedActions = (await offlineQueue.read()).length;
        throw StateError('Network unavailable. Action saved and will sync safely when connectivity returns.');
      }
    });
  }

  Future<void> syncQueuedActions() async {
    final pending = await offlineQueue.read();
    if (pending.isEmpty) {
      queuedActions = 0;
      notifyListeners();
      return;
    }
    final remaining = <QueuedGateAction>[];
    for (var index = 0; index < pending.length; index++) {
      final action = pending[index];
      try {
        if (action.type == 'CHECK_IN') {
          await api.checkIn(action.gateId, action.credential, action.idempotencyKey);
        } else if (action.type == 'CHECK_OUT') {
          await api.checkOut(action.gateId, action.credential, action.idempotencyKey);
        } else {
          continue;
        }
      } on GuardApiException catch (e) {
        if (e.transport) {
          remaining.addAll(pending.sublist(index));
          break;
        }
        remaining.add(action);
      }
    }
    await offlineQueue.replace(remaining);
    queuedActions = remaining.length;
    notifyListeners();
  }

  Future<void> signOut() async {
    final current = session;
    if (current != null) {
      try {
        await api.logout(current.sessionId);
      } catch (_) {}
    }
    await sessions.clear();
    api.accessToken = '';
    session = null;
    userId = null;
    selectionToken = null;
    memberships = const [];
    gates = const [];
    units = const [];
    gateId = null;
    verifiedAccess = null;
    walkInAccess = null;
    notifyListeners();
  }

  Future<void> _refresh(GuardSession stored) async {
    final result = await api.refresh(stored.sessionId, stored.refreshToken);
    final refreshed = GuardSession(sessionId: result['sessionId']?.toString() ?? stored.sessionId, accessToken: result['accessToken']?.toString() ?? '', refreshToken: result['refreshToken']?.toString() ?? stored.refreshToken, userId: stored.userId, societyId: stored.societyId);
    if (refreshed.accessToken.isEmpty) throw StateError('Session refresh failed');
    session = refreshed;
    api.accessToken = refreshed.accessToken;
    await sessions.save(refreshed);
    await loadGates();
    if (queuedActions > 0) await syncQueuedActions();
  }

  Future<void> _acceptSession(Map<String, dynamic> value, String societyId) async {
    final accepted = GuardSession(sessionId: value['sessionId']?.toString() ?? '', accessToken: value['accessToken']?.toString() ?? '', refreshToken: value['refreshToken']?.toString() ?? '', userId: userId ?? '', societyId: societyId);
    if (accepted.sessionId.isEmpty || accepted.accessToken.isEmpty || accepted.refreshToken.isEmpty || accepted.userId.isEmpty) throw StateError('Incomplete security session');
    session = accepted;
    api.accessToken = accepted.accessToken;
    await sessions.save(accepted);
  }

  String _requireGate() {
    if (gateId == null) throw StateError('Select an active gate');
    return gateId!;
  }

  String _idempotencyKey() {
    final random = Random.secure();
    final bytes = List<int>.generate(18, (_) => random.nextInt(256));
    return base64Url.encode(bytes).replaceAll('=', '');
  }

  Future<void> _run(Future<void> Function() action) async {
    busy = true;
    error = null;
    notifyListeners();
    try {
      await action();
    } catch (e) {
      error = e.toString().replaceFirst('Bad state: ', '');
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  List<Map<String, dynamic>> _maps(dynamic value) {
    if (value is! List) return const [];
    return value.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList(growable: false);
  }

  List<Map<String, dynamic>> _guardMemberships(List<Map<String, dynamic>> input) {
    const allowed = {'SECURITY_GUARD', 'SECURITY_SUPERVISOR'};
    return input.where((m) => allowed.contains(m['role']?.toString())).toList(growable: false);
  }
}
