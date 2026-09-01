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
  String? gateId;
  Map<String, dynamic>? verifiedAccess;
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
    gates = (await api.gates()).where((g) => g['active'] != false).toList(growable: false);
    if (gateId == null || !gates.any((g) => g['id']?.toString() == gateId)) {
      gateId = gates.isEmpty ? null : gates.first['id']?.toString();
    }
    notifyListeners();
  }

  void selectGate(String? value) {
    gateId = value;
    verifiedAccess = null;
    notifyListeners();
  }

  Future<void> verifyCredential(String credential) => _run(() async {
        final gate = _requireGate();
        final value = credential.trim();
        if (value.isEmpty) throw StateError('Scan or enter an access credential');
        verifiedAccess = await api.verifyAccess(gate, value);
      });

  Future<void> checkIn(String credential) => _gateMutation('CHECK_IN', credential, () => api.checkIn(_requireGate(), credential.trim()));
  Future<void> checkOut(String credential) => _gateMutation('CHECK_OUT', credential, () => api.checkOut(_requireGate(), credential.trim()));

  Future<void> _gateMutation(String type, String credential, Future<Map<String, dynamic>> Function() execute) async {
    await _run(() async {
      final value = credential.trim();
      if (value.isEmpty) throw StateError('Scan or enter an access credential');
      try {
        verifiedAccess = await execute();
      } on GuardApiException catch (e) {
        if (!e.transport) rethrow;
        await offlineQueue.enqueue(QueuedGateAction(
          type: type,
          gateId: _requireGate(),
          credential: value,
          createdAt: DateTime.now(),
        ));
        queuedActions = (await offlineQueue.read()).length;
        throw StateError('Network unavailable. Action saved for supervisor review/sync.');
      }
    });
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
    gateId = null;
    verifiedAccess = null;
    notifyListeners();
  }

  Future<void> _refresh(GuardSession stored) async {
    final result = await api.refresh(stored.sessionId, stored.refreshToken);
    final refreshed = GuardSession(
      sessionId: result['sessionId']?.toString() ?? stored.sessionId,
      accessToken: result['accessToken']?.toString() ?? '',
      refreshToken: result['refreshToken']?.toString() ?? stored.refreshToken,
      userId: stored.userId,
      societyId: stored.societyId,
    );
    if (refreshed.accessToken.isEmpty) throw StateError('Session refresh failed');
    session = refreshed;
    api.accessToken = refreshed.accessToken;
    await sessions.save(refreshed);
    await loadGates();
  }

  Future<void> _acceptSession(Map<String, dynamic> value, String societyId) async {
    final accepted = GuardSession(
      sessionId: value['sessionId']?.toString() ?? '',
      accessToken: value['accessToken']?.toString() ?? '',
      refreshToken: value['refreshToken']?.toString() ?? '',
      userId: userId ?? '',
      societyId: societyId,
    );
    if (accepted.sessionId.isEmpty || accepted.accessToken.isEmpty || accepted.refreshToken.isEmpty || accepted.userId.isEmpty) {
      throw StateError('Incomplete security session');
    }
    session = accepted;
    api.accessToken = accepted.accessToken;
    await sessions.save(accepted);
  }

  String _requireGate() {
    if (gateId == null) throw StateError('Select an active gate');
    return gateId!;
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
