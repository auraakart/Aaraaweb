import 'dart:async';
import 'package:flutter/foundation.dart';
import 'push_registration_service.dart';
import 'resident_repository.dart';

class ResidentDataController extends ChangeNotifier {
  ResidentDataController(
    this.repository, {
    this.activeUnitId,
    Set<String>? initialEnabledFeatures,
    this.fetchEntitlements = true,
  })  : enabledFeatures = {...?initialEnabledFeatures},
        push = PushRegistrationService(repository);

  final ResidentRepository repository;
  final PushRegistrationService push;
  final String? activeUnitId;
  final bool fetchEntitlements;
  Set<String> enabledFeatures;

  bool loading = false;
  bool realtimeConnected = false;
  bool pushEnabled = false;
  bool entitlementsLoaded = false;
  String? authError;
  String? entitlementsError;
  String? householdError;
  String? accessError;
  String? noticesError;
  String? servicesError;
  String? workforceError;
  String? billingError;
  List<Map<String, dynamic>> households = const [];
  List<Map<String, dynamic>> accessRequests = const [];
  List<Map<String, dynamic>> notices = const [];
  List<Map<String, dynamic>> serviceCategories = const [];
  List<Map<String, dynamic>> serviceOfferings = const [];
  List<Map<String, dynamic>> bookings = const [];
  List<Map<String, dynamic>> workforceAssignments = const [];
  List<Map<String, dynamic>> workforceLeaves = const [];
  List<Map<String, dynamic>> workforceRatings = const [];
  List<Map<String, dynamic>> maintenanceInvoices = const [];
  Map<String, dynamic>? lastIssuedVisitorPass;
  Map<String, dynamic>? latestAccessEvent;
  Map<String, dynamic>? latestNotificationEvent;
  StreamSubscription<Map<String, dynamic>>? _accessEvents;
  Timer? _reconnectTimer;
  Future<void>? _loadInFlight;
  bool _disposed = false;

  bool get hasActiveProperty => activeUnitId != null && activeUnitId!.isNotEmpty;
  bool hasFeature(String feature) => enabledFeatures.contains(feature);
  bool get _canLoadAccess => hasFeature('VISITOR_MANAGEMENT') || hasFeature('DELIVERY_MANAGEMENT') || hasFeature('DOMESTIC_HELP') || hasFeature('HOUSEHOLD_SERVICES');

  Map<String, dynamic>? get activeHousehold {
    final selected = activeUnitId;
    if (selected == null) return null;
    for (final household in households) {
      if (household['unitId']?.toString() == selected) return household;
    }
    return null;
  }

  String? get primaryUnitId => activeHousehold?['unitId']?.toString();

  Map<String, dynamic>? get firstPendingAccess {
    for (final request in accessRequests) {
      if (request['status']?.toString() == 'PENDING') return request;
    }
    return null;
  }

  Future<void> load() {
    if (_disposed) return Future.value();
    final inFlight = _loadInFlight;
    if (inFlight != null) return inFlight;
    final operation = _load();
    _loadInFlight = operation;
    return operation.whenComplete(() {
      if (identical(_loadInFlight, operation)) _loadInFlight = null;
    });
  }

  Future<void> _load() async {
    loading = true;
    authError = null;
    entitlementsError = null;
    householdError = null;
    accessError = null;
    noticesError = null;
    servicesError = null;
    workforceError = null;
    billingError = null;
    notifyListeners();

    await _loadEntitlements();
    if (_disposed) return;

    final tasks = <Future<void>>[];
    if (hasFeature('NOTICES')) {
      tasks.add(_loadNotices());
    } else {
      notices = const [];
    }

    if (hasActiveProperty) {
      tasks.add(_loadHouseholds());
      if (_canLoadAccess) {
        tasks.add(_loadAccess());
      } else {
        accessRequests = const [];
        latestAccessEvent = null;
      }
      if (hasFeature('HOUSEHOLD_SERVICES')) {
        tasks.add(_loadServices());
      } else {
        serviceCategories = const [];
        serviceOfferings = const [];
        bookings = const [];
      }
      if (hasFeature('DOMESTIC_HELP')) {
        tasks.add(_loadWorkforce());
      } else {
        workforceAssignments = const [];
        workforceLeaves = const [];
        workforceRatings = const [];
      }
      if (hasFeature('MAINTENANCE_BILLING')) {
        tasks.add(_loadMaintenanceInvoices());
      } else {
        maintenanceInvoices = const [];
      }
    } else {
      _clearUnitScopedData();
    }

    await Future.wait(tasks);
    if (_disposed) return;
    loading = false;
    notifyListeners();

    if (hasFeature('NOTICES') || (hasActiveProperty && _canLoadAccess)) {
      startRealtime();
    } else {
      await _accessEvents?.cancel();
      _accessEvents = null;
      realtimeConnected = false;
    }
    pushEnabled = await push.start(onOpened: _handlePushOpened);
    if (!_disposed) notifyListeners();
  }

  Future<void> _loadEntitlements() async {
    if (!fetchEntitlements) {
      entitlementsLoaded = true;
      return;
    }
    try {
      final current = await repository.currentEntitlements();
      final raw = current['enabledFeatures'];
      enabledFeatures = raw is List ? raw.map((item) => item.toString()).toSet() : <String>{};
      entitlementsLoaded = true;
    } catch (error) {
      // Fail closed: the UI must not advertise gated modules when entitlement
      // resolution fails. Core profile/property context remains available.
      enabledFeatures = <String>{};
      entitlementsLoaded = true;
      entitlementsError = 'Available society features could not be verified.';
      _capture(error, (_) {});
    }
  }

  void _clearUnitScopedData() {
    households = const [];
    accessRequests = const [];
    serviceCategories = const [];
    serviceOfferings = const [];
    bookings = const [];
    workforceAssignments = const [];
    workforceLeaves = const [];
    workforceRatings = const [];
    maintenanceInvoices = const [];
    latestAccessEvent = null;
    lastIssuedVisitorPass = null;
  }

  Future<void> refreshNotices() async {
    noticesError = null;
    if (!hasFeature('NOTICES')) {
      notices = const [];
    } else {
      await _loadNotices();
    }
    if (!_disposed) notifyListeners();
  }

  Future<void> refreshWorkforce() async {
    workforceError = null;
    if (!hasActiveProperty || !hasFeature('DOMESTIC_HELP')) {
      workforceAssignments = const [];
      workforceLeaves = const [];
      workforceRatings = const [];
      if (!_disposed) notifyListeners();
      return;
    }
    final tasks = <Future<void>>[_loadWorkforce()];
    if (_canLoadAccess) tasks.add(_loadAccess());
    await Future.wait(tasks);
    if (!_disposed) notifyListeners();
  }

  void startRealtime() {
    if (_disposed) return;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    _accessEvents?.cancel();
    _accessEvents = repository.accessEvents().listen(
      (event) async {
        if (_disposed) return;
        realtimeConnected = true;
        final type = event['type']?.toString() ?? '';
        if (type.startsWith('ACCESS_') && hasActiveProperty && _canLoadAccess) {
          await _loadAccess();
          final requestId = event['requestId']?.toString();
          if (requestId != null && accessRequests.any((request) => request['id']?.toString() == requestId)) {
            latestAccessEvent = event;
          }
        } else if (type == 'GENERAL_NOTICE_PUBLISHED' && hasFeature('NOTICES')) {
          latestNotificationEvent = event;
          await _loadNotices();
        } else if (type == 'MAINTENANCE_DUE_ISSUED' && hasFeature('MAINTENANCE_BILLING') && _matchesActiveUnit(event)) {
          latestNotificationEvent = event;
          await _loadMaintenanceInvoices();
        }
        if (!_disposed) notifyListeners();
      },
      onError: (_) {
        realtimeConnected = false;
        if (!_disposed) {
          notifyListeners();
          _scheduleRealtimeReconnect();
        }
      },
      onDone: () {
        realtimeConnected = false;
        if (!_disposed) _scheduleRealtimeReconnect();
      },
      cancelOnError: true,
    );
  }

  void _scheduleRealtimeReconnect() {
    if (_disposed) return;
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(const Duration(seconds: 3), () {
      _reconnectTimer = null;
      if (!_disposed) startRealtime();
    });
  }

  Future<void> _handlePushOpened(Map<String, dynamic> data) async {
    if (_disposed) return;
    final type = data['type']?.toString() ?? '';
    if (type == 'GENERAL_NOTICE_PUBLISHED' && hasFeature('NOTICES')) {
      latestNotificationEvent = data;
      await _loadNotices();
      if (!_disposed) notifyListeners();
      return;
    }
    if (type == 'MAINTENANCE_DUE_ISSUED') {
      if (hasFeature('MAINTENANCE_BILLING') && _matchesActiveUnit(data)) {
        latestNotificationEvent = data;
        await _loadMaintenanceInvoices();
      }
      if (!_disposed) notifyListeners();
      return;
    }
    if (!hasActiveProperty || !_canLoadAccess) return;
    final requestId = data['requestId']?.toString();
    if (requestId == null) return;
    await _loadAccess();
    if (accessRequests.any((request) => request['id']?.toString() == requestId)) {
      latestAccessEvent = data;
    }
    if (!_disposed) notifyListeners();
  }

  bool _matchesActiveUnit(Map<String, dynamic> event) {
    final selected = activeUnitId;
    if (selected == null) return false;
    return event['unitId']?.toString() == selected;
  }

  Future<void> stopPushNotifications() async {
    await push.stop();
    pushEnabled = false;
    if (!_disposed) notifyListeners();
  }

  Future<void> _loadHouseholds() async {
    final selected = activeUnitId;
    if (selected == null) {
      households = const [];
      return;
    }
    try {
      final rows = await repository.households();
      final scoped = rows.where((item) => item['unitId']?.toString() == selected).toList(growable: false);
      households = scoped;
      if (rows.isNotEmpty && scoped.isEmpty) {
        householdError = 'The selected property is no longer available in this society session.';
      }
    } catch (e) {
      _capture(e, (message) => householdError = message);
    }
  }

  Future<void> _loadAccess() async {
    if (!hasActiveProperty || !_canLoadAccess) {
      accessRequests = const [];
      latestAccessEvent = null;
      return;
    }
    try {
      final rows = await repository.accessRequests();
      accessRequests = _filterByUnit(rows, (item) => item['unitId']);
      final current = latestAccessEvent?['requestId']?.toString();
      if (current != null && !accessRequests.any((item) => item['id']?.toString() == current)) latestAccessEvent = null;
    } catch (e) {
      _capture(e, (message) => accessError = message);
    }
  }

  Future<void> _loadNotices() async {
    if (!hasFeature('NOTICES')) {
      notices = const [];
      return;
    }
    try {
      notices = await repository.notices();
    } catch (e) {
      _capture(e, (message) => noticesError = message);
    }
  }

  Future<void> _loadServices() async {
    if (!hasActiveProperty || !hasFeature('HOUSEHOLD_SERVICES')) {
      serviceCategories = const [];
      serviceOfferings = const [];
      bookings = const [];
      return;
    }
    try {
      final results = await Future.wait([repository.serviceCategories(), repository.serviceOfferings(), repository.bookings()]);
      serviceCategories = results[0];
      serviceOfferings = results[1];
      bookings = _filterByUnit(results[2], (item) => item['unitId']);
    } catch (e) {
      _capture(e, (message) => servicesError = message);
    }
  }

  Future<void> _loadWorkforce() async {
    if (!hasActiveProperty || !hasFeature('DOMESTIC_HELP')) {
      workforceAssignments = const [];
      workforceLeaves = const [];
      workforceRatings = const [];
      return;
    }
    try {
      final results = await Future.wait([repository.workforce(), repository.workforceLeaves(), repository.workforceRatings()]);
      final assignments = _filterByUnit(results[0], (item) {
        final household = item['household'];
        return household is Map ? household['unitId'] : null;
      });
      final assignmentIds = assignments.map((item) => item['id']?.toString()).whereType<String>().toSet();
      workforceAssignments = assignments;
      workforceLeaves = results[1].where((item) => assignmentIds.contains(item['assignmentId']?.toString())).toList(growable: false);
      workforceRatings = results[2].where((item) => assignmentIds.contains(item['assignmentId']?.toString())).toList(growable: false);
    } catch (e) {
      _capture(e, (message) => workforceError = message);
    }
  }

  Future<void> _loadMaintenanceInvoices() async {
    if (!hasActiveProperty || !hasFeature('MAINTENANCE_BILLING')) {
      maintenanceInvoices = const [];
      return;
    }
    try {
      final rows = await repository.maintenanceInvoices();
      maintenanceInvoices = _filterByUnit(rows, (item) => item['unitId']);
    } catch (e) {
      _capture(e, (message) => billingError = message);
    }
  }

  List<Map<String, dynamic>> _filterByUnit(List<Map<String, dynamic>> rows, Object? Function(Map<String, dynamic>) unitOf) {
    final selected = activeUnitId;
    if (selected == null) return const [];
    return rows.where((item) => unitOf(item)?.toString() == selected).toList(growable: false);
  }

  bool isWorkforcePresent(String assignmentId) {
    for (final request in accessRequests) {
      if (request['subjectType']?.toString() != 'DOMESTIC_HELP' || request['status']?.toString() != 'CHECKED_IN') continue;
      final metadata = request['metadata'];
      if (metadata is Map && metadata['workforceAssignmentId']?.toString() == assignmentId) return true;
    }
    return false;
  }

  Map<String, dynamic>? ratingFor(String assignmentId) => workforceRatings.where((item) => item['assignmentId']?.toString() == assignmentId).firstOrNull;
  List<Map<String, dynamic>> leavesFor(String assignmentId) => workforceLeaves.where((item) => item['assignmentId']?.toString() == assignmentId && item['active'] != false).toList(growable: false);

  Future<void> createWorkforceLeave({required String assignmentId, required DateTime startsOn, required DateTime endsOn, String? reason}) async {
    await repository.createWorkforceLeave(assignmentId: assignmentId, startsOn: startsOn, endsOn: endsOn, reason: reason);
    await _loadWorkforce();
    if (!_disposed) notifyListeners();
  }

  Future<void> cancelWorkforceLeave(String leaveId) async { await repository.cancelWorkforceLeave(leaveId); await _loadWorkforce(); if (!_disposed) notifyListeners(); }
  Future<void> rateWorkforce(String assignmentId, {required int score, String? comment}) async { await repository.rateWorkforce(assignmentId, score: score, comment: comment); await _loadWorkforce(); if (!_disposed) notifyListeners(); }
  Future<void> addWorkforce({required String householdId, required String name, required String phone, required String role}) async {
    if (!households.any((item) => item['id']?.toString() == householdId)) throw StateError('Household is outside the active property context');
    await repository.addWorkforce(householdId: householdId, name: name, phone: phone, role: role);
    await _loadWorkforce();
    if (!_disposed) notifyListeners();
  }
  Future<void> deactivateWorkforce(String assignmentId) async {
    if (!workforceAssignments.any((item) => item['id']?.toString() == assignmentId)) throw StateError('Staff assignment is outside the active property context');
    await repository.deactivateWorkforce(assignmentId);
    await _loadWorkforce();
    await _loadAccess();
    if (!_disposed) notifyListeners();
  }

  void _capture(Object error, void Function(String message) assign) {
    if (_disposed) return;
    final text = error.toString();
    if (text.contains('Sign in is required') || text.contains('ApiException(401)')) authError = 'Sign in is required'; else assign(text);
  }

  Future<Map<String, dynamic>> approveAccess(String requestId, {Duration? duration}) async {
    final request = accessRequests.where((item) => item['id']?.toString() == requestId).firstOrNull;
    if (request == null) throw StateError('Access request is outside the active property context');
    final type = request['subjectType']?.toString();
    final effectiveDuration = duration ?? switch (type) { 'CAB' => const Duration(minutes: 15), 'DELIVERY' => const Duration(minutes: 30), _ => const Duration(hours: 4) };
    final now = DateTime.now();
    final result = await repository.approveAccess(requestId, validFrom: now, validUntil: now.add(effectiveDuration));
    final credential = result['credential']?.toString();
    final rawRequest = result['request'];
    if (credential != null && rawRequest is Map && rawRequest['subjectType']?.toString() == 'VISITOR') lastIssuedVisitorPass = {'credential': credential, 'request': Map<String, dynamic>.from(rawRequest)};
    await _loadAccess();
    if (!_disposed) notifyListeners();
    return result;
  }

  Future<void> denyAccess(String requestId) async {
    if (!accessRequests.any((item) => item['id']?.toString() == requestId)) throw StateError('Access request is outside the active property context');
    await repository.denyAccess(requestId); await _loadAccess(); if (!_disposed) notifyListeners();
  }
  Future<void> cancelAccess(String requestId) async {
    if (!accessRequests.any((item) => item['id']?.toString() == requestId)) throw StateError('Access request is outside the active property context');
    await repository.cancelAccess(requestId); await _loadAccess(); if (!_disposed) notifyListeners();
  }

  Future<Map<String, dynamic>> createGuest({required String name, String? phone, String? purpose, Duration duration = const Duration(hours: 4)}) async {
    final unitId = primaryUnitId;
    if (unitId == null) throw StateError('Select a property before creating a visitor pass');
    final now = DateTime.now();
    final result = await repository.inviteVisitor(unitId: unitId, name: name, phone: phone, purpose: purpose, validFrom: now, validUntil: now.add(duration));
    final rawRequest = result['request'];
    final credential = result['credential']?.toString();
    if (rawRequest is! Map || credential == null || credential.isEmpty) throw StateError('Visitor pass was not returned');
    lastIssuedVisitorPass = {'credential': credential, 'request': Map<String, dynamic>.from(rawRequest)};
    await _loadAccess();
    if (!_disposed) notifyListeners();
    return lastIssuedVisitorPass!;
  }

  void clearIssuedVisitorPass() { if (_disposed) return; lastIssuedVisitorPass = null; notifyListeners(); }

  @override
  void dispose() {
    _disposed = true;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    _accessEvents?.cancel();
    _accessEvents = null;
    push.dispose();
    super.dispose();
  }
}

extension _FirstOrNull<T> on Iterable<T> { T? get firstOrNull => isEmpty ? null : first; }
