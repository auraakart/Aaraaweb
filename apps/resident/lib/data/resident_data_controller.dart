import 'dart:async';
import 'package:flutter/foundation.dart';
import 'push_registration_service.dart';
import 'resident_repository.dart';

class ResidentDataController extends ChangeNotifier {
  ResidentDataController(this.repository) : push = PushRegistrationService(repository);
  final ResidentRepository repository;
  final PushRegistrationService push;

  bool loading = false;
  bool realtimeConnected = false;
  bool pushEnabled = false;
  String? authError;
  String? householdError;
  String? accessError;
  String? noticesError;
  String? servicesError;
  String? workforceError;
  List<Map<String, dynamic>> households = const [];
  List<Map<String, dynamic>> accessRequests = const [];
  List<Map<String, dynamic>> notices = const [];
  List<Map<String, dynamic>> serviceCategories = const [];
  List<Map<String, dynamic>> serviceOfferings = const [];
  List<Map<String, dynamic>> bookings = const [];
  List<Map<String, dynamic>> workforceAssignments = const [];
  List<Map<String, dynamic>> workforceLeaves = const [];
  List<Map<String, dynamic>> workforceRatings = const [];
  Map<String, dynamic>? lastIssuedVisitorPass;
  Map<String, dynamic>? latestAccessEvent;
  StreamSubscription<Map<String, dynamic>>? _accessEvents;
  bool _disposed = false;

  String? get primaryUnitId => households.isEmpty ? null : households.first['unitId']?.toString();
  Map<String, dynamic>? get firstPendingAccess {
    for (final request in accessRequests) {
      if (request['status']?.toString() == 'PENDING') return request;
    }
    return null;
  }

  Future<void> load() async {
    loading = true;
    authError = null;
    householdError = null;
    accessError = null;
    noticesError = null;
    servicesError = null;
    workforceError = null;
    notifyListeners();
    await Future.wait([_loadHouseholds(), _loadAccess(), _loadNotices(), _loadServices(), _loadWorkforce()]);
    loading = false;
    notifyListeners();
    startRealtime();
    pushEnabled = await push.start(onOpened: _handlePushOpened);
    if (!_disposed) notifyListeners();
  }

  Future<void> refreshNotices() async {
    noticesError = null;
    await _loadNotices();
    if (!_disposed) notifyListeners();
  }

  Future<void> refreshWorkforce() async {
    workforceError = null;
    await Future.wait([_loadWorkforce(), _loadAccess()]);
    if (!_disposed) notifyListeners();
  }

  void startRealtime() {
    _accessEvents?.cancel();
    _accessEvents = repository.accessEvents().listen(
      (event) async {
        realtimeConnected = true;
        if (event['type']?.toString() != 'CONNECTED') {
          latestAccessEvent = event;
          await _loadAccess();
        }
        if (!_disposed) notifyListeners();
      },
      onError: (_) {
        realtimeConnected = false;
        if (!_disposed) {
          notifyListeners();
          Future<void>.delayed(const Duration(seconds: 3), startRealtime);
        }
      },
      onDone: () {
        realtimeConnected = false;
        if (!_disposed) Future<void>.delayed(const Duration(seconds: 3), startRealtime);
      },
      cancelOnError: true,
    );
  }

  Future<void> _handlePushOpened(Map<String, dynamic> data) async {
    final requestId = data['requestId']?.toString();
    if (requestId == null) return;
    latestAccessEvent = data;
    await _loadAccess();
    if (!_disposed) notifyListeners();
  }

  Future<void> stopPushNotifications() async {
    await push.stop();
    pushEnabled = false;
    if (!_disposed) notifyListeners();
  }

  Future<void> _loadHouseholds() async {
    try {
      households = await repository.households();
    } catch (e) {
      _capture(e, (message) => householdError = message);
    }
  }

  Future<void> _loadAccess() async {
    try {
      accessRequests = await repository.accessRequests();
    } catch (e) {
      _capture(e, (message) => accessError = message);
    }
  }

  Future<void> _loadNotices() async {
    try {
      notices = await repository.notices();
    } catch (e) {
      _capture(e, (message) => noticesError = message);
    }
  }

  Future<void> _loadServices() async {
    try {
      final results = await Future.wait([
        repository.serviceCategories(),
        repository.serviceOfferings(),
        repository.bookings(),
      ]);
      serviceCategories = results[0];
      serviceOfferings = results[1];
      bookings = results[2];
    } catch (e) {
      _capture(e, (message) => servicesError = message);
    }
  }

  Future<void> _loadWorkforce() async {
    try {
      final results = await Future.wait([
        repository.workforce(),
        repository.workforceLeaves(),
        repository.workforceRatings(),
      ]);
      workforceAssignments = results[0];
      workforceLeaves = results[1];
      workforceRatings = results[2];
    } catch (e) {
      _capture(e, (message) => workforceError = message);
    }
  }

  bool isWorkforcePresent(String assignmentId) {
    for (final request in accessRequests) {
      if (request['subjectType']?.toString() != 'DOMESTIC_HELP' || request['status']?.toString() != 'CHECKED_IN') continue;
      final metadata = request['metadata'];
      if (metadata is Map && metadata['workforceAssignmentId']?.toString() == assignmentId) return true;
    }
    return false;
  }

  Map<String, dynamic>? ratingFor(String assignmentId) =>
      workforceRatings.where((item) => item['assignmentId']?.toString() == assignmentId).firstOrNull;

  List<Map<String, dynamic>> leavesFor(String assignmentId) => workforceLeaves
      .where((item) => item['assignmentId']?.toString() == assignmentId && item['active'] != false)
      .toList(growable: false);

  Future<void> createWorkforceLeave({required String assignmentId, required DateTime startsOn, required DateTime endsOn, String? reason}) async {
    await repository.createWorkforceLeave(assignmentId: assignmentId, startsOn: startsOn, endsOn: endsOn, reason: reason);
    await _loadWorkforce();
    notifyListeners();
  }

  Future<void> cancelWorkforceLeave(String leaveId) async {
    await repository.cancelWorkforceLeave(leaveId);
    await _loadWorkforce();
    notifyListeners();
  }

  Future<void> rateWorkforce(String assignmentId, {required int score, String? comment}) async {
    await repository.rateWorkforce(assignmentId, score: score, comment: comment);
    await _loadWorkforce();
    notifyListeners();
  }

  void _capture(Object error, void Function(String message) assign) {
    final text = error.toString();
    if (text.contains('Sign in is required') || text.contains('ApiException(401)')) {
      authError = 'Sign in is required';
    } else {
      assign(text);
    }
  }

  Future<Map<String, dynamic>> approveAccess(String requestId, {Duration? duration}) async {
    final request = accessRequests.where((item) => item['id']?.toString() == requestId).firstOrNull;
    final type = request?['subjectType']?.toString();
    final effectiveDuration = duration ?? switch (type) {
      'CAB' => const Duration(minutes: 15),
      'DELIVERY' => const Duration(minutes: 30),
      _ => const Duration(hours: 4),
    };
    final now = DateTime.now();
    final result = await repository.approveAccess(requestId, validFrom: now, validUntil: now.add(effectiveDuration));
    final credential = result['credential']?.toString();
    final rawRequest = result['request'];
    if (credential != null && rawRequest is Map && rawRequest['subjectType']?.toString() == 'VISITOR') {
      lastIssuedVisitorPass = {'credential': credential, 'request': Map<String, dynamic>.from(rawRequest)};
    }
    await _loadAccess();
    notifyListeners();
    return result;
  }

  Future<void> denyAccess(String requestId) async {
    await repository.denyAccess(requestId);
    await _loadAccess();
    notifyListeners();
  }

  Future<void> cancelAccess(String requestId) async {
    await repository.cancelAccess(requestId);
    await _loadAccess();
    notifyListeners();
  }

  Future<Map<String, dynamic>> createGuest({required String name, String? phone, String? purpose, Duration duration = const Duration(hours: 4)}) async {
    final unitId = primaryUnitId;
    if (unitId == null) throw StateError('No household unit is available');
    final now = DateTime.now();
    final result = await repository.inviteVisitor(unitId: unitId, name: name, phone: phone, purpose: purpose, validFrom: now, validUntil: now.add(duration));
    final rawRequest = result['request'];
    final credential = result['credential']?.toString();
    if (rawRequest is! Map || credential == null || credential.isEmpty) throw StateError('Visitor pass was not returned');
    lastIssuedVisitorPass = {'credential': credential, 'request': Map<String, dynamic>.from(rawRequest)};
    await _loadAccess();
    notifyListeners();
    return lastIssuedVisitorPass!;
  }

  void clearIssuedVisitorPass() {
    lastIssuedVisitorPass = null;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _accessEvents?.cancel();
    push.dispose();
    super.dispose();
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
