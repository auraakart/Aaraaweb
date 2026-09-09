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
    if (type == 'MAINTENANCE_DUE_ISSUED' && hasFeature('MAINTENANCE_BILLING') && _matchesActiveUnit(data)) {
      latestNotificationEvent = data;
      await _loadMaintenanceInvoices();
      if (!_disposed) notifyListeners();
    }
  }

  bool _matchesActiveUnit(Map<String, dynamic> event) {
    final selected = activeUnitId;
    if (selected == null || selected.isEmpty) return false;
    return event['unitId']?.toString() == selected;
  }

  Future<void> _loadHouseholds() async {
    try {
      households = await repository.households();
    } catch (error) {
      _capture(error, (message) => householdError = message);
      households = const [];
    }
  }

  Future<void> _loadAccess() async {
    try {
      final all = await repository.accessRequests();
      accessRequests = all.where((request) => request['unitId']?.toString() == activeUnitId).toList(growable: false);
    } catch (error) {
      _capture(error, (message) => accessError = message);
      accessRequests = const [];
    }
  }

  Future<void> _loadNotices() async {
    try {
      notices = await repository.notices();
    } catch (error) {
      _capture(error, (message) => noticesError = message);
      notices = const [];
    }
  }

  Future<void> _loadServices() async {
    try {
      final results = await Future.wait([repository.serviceCategories(), repository.serviceOfferings(), repository.bookings()]);
      serviceCategories = results[0];
      serviceOfferings = results[1];
      final allBookings = results[2];
      bookings = allBookings.where((booking) => booking['unitId']?.toString() == activeUnitId).toList(growable: false);
    } catch (error) {
      _capture(error, (message) => servicesError = message);
      serviceCategories = const [];
      serviceOfferings = const [];
      bookings = const [];
    }
  }

  Future<void> _loadWorkforce() async {
    try {
      final results = await Future.wait([repository.workforce(), repository.workforceLeaves(), repository.workforceRatings()]);
      workforceAssignments = results[0];
      workforceLeaves = results[1];
      workforceRatings = results[2];
    } catch (error) {
      _capture(error, (message) => workforceError = message);
      workforceAssignments = const [];
      workforceLeaves = const [];
      workforceRatings = const [];
    }
  }

  Future<void> _loadMaintenanceInvoices() async {
    try {
      final all = await repository.maintenanceInvoices();
      maintenanceInvoices = all.where((invoice) => invoice['unitId']?.toString() == activeUnitId).toList(growable: false);
    } catch (error) {
      _capture(error, (message) => billingError = message);
      maintenanceInvoices = const [];
    }
  }

  void _capture(Object error, void Function(String message) setMessage) {
    final text = error.toString();
    if (text.contains('401') || text.contains('403') || text.toLowerCase().contains('unauthorized') || text.toLowerCase().contains('forbidden')) {
      authError = 'Your session no longer has access to this society. Please sign in again.';
    }
    setMessage(text.replaceFirst('ApiException', 'Request failed'));
  }

  @override
  void dispose() {
    _disposed = true;
    _reconnectTimer?.cancel();
    _accessEvents?.cancel();
    push.stop();
    super.dispose();
  }
}