import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/service_catalog_models.dart';
import 'push_registration_service.dart';
import 'resident_repository.dart';
import 'vehicle_actions.dart';

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
  String? helpdeskError;
  List<Map<String, dynamic>> households = const [];
  List<Map<String, dynamic>> householdChangeRequests = const [];
  List<Map<String, dynamic>> accessRequests = const [];
  List<Map<String, dynamic>> notices = const [];
  List<Map<String, dynamic>> serviceCategories = const [];
  List<Map<String, dynamic>> serviceOfferings = const [];
  List<Map<String, dynamic>> bookings = const [];

  List<ServiceOfferingSummary> get serviceOfferingModels => serviceOfferings
      .map(ServiceOfferingSummary.tryParse)
      .whereType<ServiceOfferingSummary>()
      .toList(growable: false);
  List<Map<String, dynamic>> workforceAssignments = const [];
  List<Map<String, dynamic>> workforceLeaves = const [];
  List<Map<String, dynamic>> workforceRatings = const [];
  List<Map<String, dynamic>> maintenanceInvoices = const [];
  List<Map<String, dynamic>> maintenancePayments = const [];
  List<Map<String, dynamic>> helpdeskTickets = const [];
  Map<String, dynamic>? lastIssuedVisitorPass;
  Map<String, dynamic>? latestAccessEvent;
  Map<String, dynamic>? latestNotificationEvent;
  StreamSubscription<Map<String, dynamic>>? _accessEvents;
  Timer? _reconnectTimer;
  Future<void>? _loadInFlight;
  _GuestInviteAttempt? _pendingGuestInviteAttempt;
  Future<Map<String, dynamic>>? _guestInviteInFlight;
  String? _guestInviteInFlightSignature;
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
    helpdeskError = null;
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
      tasks.add(_loadHouseholdChangeRequests());
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
        maintenancePayments = const [];
      }
      if (hasFeature('HELPDESK')) {
        tasks.add(_loadHelpdesk());
      } else {
        helpdeskTickets = const [];
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
    householdChangeRequests = const [];
    accessRequests = const [];
    serviceCategories = const [];
    serviceOfferings = const [];
    bookings = const [];
    workforceAssignments = const [];
    workforceLeaves = const [];
    workforceRatings = const [];
    maintenanceInvoices = const [];
    maintenancePayments = const [];
    helpdeskTickets = const [];
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

  Future<void> acknowledgeNotice(String noticeId) async {
    if (!hasFeature('NOTICES')) {
      throw StateError('Notices are not enabled for this society session.');
    }
    Map<String, dynamic>? notice;
    for (final item in notices) {
      if (item['id']?.toString() == noticeId) {
        notice = item;
        break;
      }
    }
    if (notice == null) throw StateError('Notice is not available in the current society session.');
    if (notice['requiresAcknowledgement'] != true) {
      throw StateError('This notice does not require acknowledgement.');
    }
    if (notice['acknowledgedAt'] != null) return;

    final result = await repository.acknowledgeNotice(noticeId);
    if (result['acknowledgedAt'] == null) {
      throw StateError('Notice acknowledgement was not confirmed by the server.');
    }
    await _loadNotices();
    final confirmed = notices.any(
      (item) => item['id']?.toString() == noticeId && item['acknowledgedAt'] != null,
    );
    if (!confirmed) {
      throw StateError('Notice acknowledgement could not be confirmed from the refreshed notice state.');
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

  Future<void> _loadHouseholdChangeRequests() async {
    if (!hasActiveProperty) {
      householdChangeRequests = const [];
      return;
    }
    try {
      final rows = await repository.householdChangeRequests();
      householdChangeRequests = _filterByUnit(rows, (item) => item['unitId']);
    } catch (e) {
      householdChangeRequests = const [];
      _capture(e, (message) => householdError ??= message);
    }
  }

  List<Map<String, dynamic>> vehicleChangeRequestsForHousehold(String householdId) =>
      householdChangeRequests
          .where((item) =>
              item['householdId']?.toString() == householdId &&
              item['type']?.toString().startsWith('VEHICLE_') == true &&
              const {'PENDING', 'PROCESSING'}.contains(item['status']?.toString()))
          .toList(growable: false);

  bool _vehicleAddRequestMatches(
    Map<String, dynamic> request, {
    required String householdId,
    required String plateNumber,
    required String vehicleType,
    String? make,
    String? model,
    String? color,
  }) {
    if (request['householdId']?.toString() != householdId ||
        request['type']?.toString() != 'VEHICLE_ADD' ||
        !const {'PENDING', 'PROCESSING'}.contains(request['status']?.toString())) {
      return false;
    }
    final payload = request['payload'];
    final values = payload is Map ? payload : const <String, dynamic>{};
    return _normalizeVehiclePlate(values['plateNumber']?.toString() ?? '') == _normalizeVehiclePlate(plateNumber) &&
        values['vehicleType']?.toString() == vehicleType &&
        _optionalHouseholdText(values['make']) == _optionalHouseholdText(make) &&
        _optionalHouseholdText(values['model']) == _optionalHouseholdText(model) &&
        _optionalHouseholdText(values['color']) == _optionalHouseholdText(color);
  }

  Future<void> requestVehicleAdd({
    required String householdId,
    required String plateNumber,
    required String vehicleType,
    String? make,
    String? model,
    String? color,
  }) async {
    if (_householdById(householdId) == null) throw StateError('Household is outside the active property context');

    await _reloadHouseholdChangeRequestsForMutationRecovery();
    final beforeIds = vehicleChangeRequestsForHousehold(householdId)
        .where((item) => _vehicleAddRequestMatches(
              item,
              householdId: householdId,
              plateNumber: plateNumber,
              vehicleType: vehicleType,
              make: make,
              model: model,
              color: color,
            ))
        .map((item) => item['id']?.toString())
        .whereType<String>()
        .toSet();

    try {
      await repository.addVehicle(
        householdId: householdId,
        plateNumber: plateNumber,
        vehicleType: vehicleType,
        make: make,
        model: model,
        color: color,
      );
    } catch (_) {
      await _reloadHouseholdChangeRequestsForMutationRecovery();
      final recovered = vehicleChangeRequestsForHousehold(householdId).any((item) {
        final id = item['id']?.toString();
        return id != null &&
            !beforeIds.contains(id) &&
            _vehicleAddRequestMatches(
              item,
              householdId: householdId,
              plateNumber: plateNumber,
              vehicleType: vehicleType,
              make: make,
              model: model,
              color: color,
            );
      });
      if (recovered) return;
      await _reloadHouseholdsForMutationRecovery();
      rethrow;
    }
    await _reloadHouseholdChangeRequestsForMutationRecovery();
  }

  Future<void> requestVehicleRemoval({
    required String householdId,
    required String vehicleId,
  }) async {
    final household = _householdById(householdId);
    final vehicles = household?['vehicles'];
    final activeVehicle = vehicles is List &&
        vehicles.whereType<Map>().any((item) => item['id']?.toString() == vehicleId);
    if (!activeVehicle) throw StateError('Vehicle is outside the active household context');

    await _reloadHouseholdChangeRequestsForMutationRecovery();
    final beforeIds = vehicleChangeRequestsForHousehold(householdId)
        .where((item) => item['type']?.toString() == 'VEHICLE_REMOVE' && item['targetId']?.toString() == vehicleId)
        .map((item) => item['id']?.toString())
        .whereType<String>()
        .toSet();

    try {
      await repository.deactivateVehicle(householdId: householdId, vehicleId: vehicleId);
    } catch (_) {
      await _reloadHouseholdChangeRequestsForMutationRecovery();
      final recovered = vehicleChangeRequestsForHousehold(householdId).any((item) {
        final id = item['id']?.toString();
        return id != null &&
            !beforeIds.contains(id) &&
            item['type']?.toString() == 'VEHICLE_REMOVE' &&
            item['targetId']?.toString() == vehicleId;
      });
      if (recovered) return;
      await _reloadHouseholdsForMutationRecovery();
      rethrow;
    }
    await _reloadHouseholdChangeRequestsForMutationRecovery();
  }

  Future<void> _reloadHouseholdChangeRequestsForMutationRecovery() async {
    final selected = activeUnitId;
    if (selected == null) throw StateError('Select a property before managing household changes');
    final rows = await repository.householdChangeRequests();
    householdChangeRequests = rows.where((item) => item['unitId']?.toString() == selected).toList(growable: false);
    if (!_disposed) notifyListeners();
  }

  String _normalizeVehiclePlate(String value) => value.trim().toUpperCase().replaceAll(RegExp(r'[\s-]+'), '');
  String _optionalHouseholdText(Object? value) => value?.toString().trim() ?? '';

  Map<String, dynamic>? _householdById(String householdId) =>
      households.where((item) => item['id']?.toString() == householdId).firstOrNull;

  List<Map<String, dynamic>> familyMembersForHousehold(String householdId) {
    final household = _householdById(householdId);
    final unit = household?['unit'];
    final occupancies = unit is Map ? unit['occupancies'] : null;
    if (occupancies is! List) return const [];
    return occupancies
        .whereType<Map>()
        .where((item) => item['relation']?.toString() == 'FAMILY_MEMBER')
        .map((item) => Map<String, dynamic>.from(item))
        .toList(growable: false);
  }

  Map<String, dynamic>? familyMemberById(String householdId, String occupancyId) =>
      familyMembersForHousehold(householdId)
          .where((item) => item['id']?.toString() == occupancyId)
          .firstOrNull;

  bool hasMatchingFamilyMember({
    required String householdId,
    required String phone,
    required bool gateApprovalEnabled,
    required bool gateNotificationEnabled,
    required bool primaryGateContact,
  }) {
    final expectedPhone = _normalizeHouseholdPhone(phone);
    final expectedNotification = primaryGateContact ? true : gateNotificationEnabled;
    return familyMembersForHousehold(householdId).any((item) {
      final user = item['user'];
      final userMap = user is Map ? user : const <String, dynamic>{};
      return _normalizeHouseholdPhone(userMap['phone']?.toString() ?? '') == expectedPhone &&
          item['gateApprovalEnabled'] == gateApprovalEnabled &&
          item['gateNotificationEnabled'] == expectedNotification &&
          item['primaryGateContact'] == primaryGateContact;
    });
  }

  bool familyMemberSettingsMatch({
    required String householdId,
    required String occupancyId,
    required bool gateApprovalEnabled,
    required bool gateNotificationEnabled,
    required bool primaryGateContact,
  }) {
    final member = familyMemberById(householdId, occupancyId);
    if (member == null) return false;
    final expectedNotification = primaryGateContact ? true : gateNotificationEnabled;
    return member['gateApprovalEnabled'] == gateApprovalEnabled &&
        member['gateNotificationEnabled'] == expectedNotification &&
        member['primaryGateContact'] == primaryGateContact;
  }

  Future<void> addFamilyMember({
    required String householdId,
    required String name,
    required String phone,
    bool gateApprovalEnabled = false,
    bool gateNotificationEnabled = true,
    bool primaryGateContact = false,
  }) async {
    if (_householdById(householdId) == null) {
      throw StateError('Household is outside the active property context');
    }
    try {
      await repository.addFamilyMember(
        householdId: householdId,
        name: name,
        phone: phone,
        gateApprovalEnabled: gateApprovalEnabled,
        gateNotificationEnabled: gateNotificationEnabled,
        primaryGateContact: primaryGateContact,
      );
    } catch (_) {
      await _reloadHouseholdsForMutationRecovery();
      if (hasMatchingFamilyMember(
        householdId: householdId,
        phone: phone,
        gateApprovalEnabled: gateApprovalEnabled,
        gateNotificationEnabled: gateNotificationEnabled,
        primaryGateContact: primaryGateContact,
      )) return;
      rethrow;
    }
    await _reloadHouseholdsForMutationRecovery();
  }

  Future<void> updateFamilyMember({
    required String householdId,
    required String occupancyId,
    required bool gateApprovalEnabled,
    required bool gateNotificationEnabled,
    required bool primaryGateContact,
  }) async {
    if (familyMemberById(householdId, occupancyId) == null) {
      throw StateError('Family member is outside the active property context');
    }
    try {
      await repository.updateFamilyMember(
        householdId: householdId,
        occupancyId: occupancyId,
        gateApprovalEnabled: gateApprovalEnabled,
        gateNotificationEnabled: gateNotificationEnabled,
        primaryGateContact: primaryGateContact,
      );
    } catch (_) {
      await _reloadHouseholdsForMutationRecovery();
      if (familyMemberSettingsMatch(
        householdId: householdId,
        occupancyId: occupancyId,
        gateApprovalEnabled: gateApprovalEnabled,
        gateNotificationEnabled: gateNotificationEnabled,
        primaryGateContact: primaryGateContact,
      )) return;
      rethrow;
    }
    await _reloadHouseholdsForMutationRecovery();
  }

  Future<void> deactivateFamilyMember({
    required String householdId,
    required String occupancyId,
  }) async {
    if (familyMemberById(householdId, occupancyId) == null) {
      throw StateError('Family member is outside the active property context');
    }
    try {
      await repository.deactivateFamilyMember(
        householdId: householdId,
        occupancyId: occupancyId,
      );
    } catch (_) {
      await _reloadHouseholdsForMutationRecovery();
      if (familyMemberById(householdId, occupancyId) == null) return;
      rethrow;
    }
    await _reloadHouseholdsForMutationRecovery();
  }

  Future<void> _reloadHouseholdsForMutationRecovery() async {
    final selected = activeUnitId;
    if (selected == null) throw StateError('Select a property before managing household details');
    final rows = await repository.households();
    final scoped = rows.where((item) => item['unitId']?.toString() == selected).toList(growable: false);
    households = scoped;
    householdError = rows.isNotEmpty && scoped.isEmpty
        ? 'The selected property is no longer available in this society session.'
        : null;
    if (!_disposed) notifyListeners();
  }

  String _normalizeHouseholdPhone(String value) => value.replaceAll(RegExp(r'\D'), '');

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

  Future<void> _loadHelpdesk() async {
    if (!hasActiveProperty || !hasFeature('HELPDESK')) {
      helpdeskTickets = const [];
      return;
    }
    try {
      final rows = await repository.helpdeskTickets();
      helpdeskTickets = _filterByUnit(rows, (item) => item['unitId']);
    } catch (e) {
      _capture(e, (message) => helpdeskError = message);
    }
  }

  Future<void> _loadMaintenanceInvoices() async {
    if (!hasActiveProperty || !hasFeature('MAINTENANCE_BILLING')) {
      maintenanceInvoices = const [];
      maintenancePayments = const [];
      return;
    }
    try {
      final rows = await repository.maintenanceInvoices();
      maintenanceInvoices = _filterByUnit(rows, (item) => item['unitId']);
      maintenancePayments = const [];
      if (!hasFeature('PAYMENTS') || maintenanceInvoices.isEmpty) return;

      final invoiceIds = maintenanceInvoices.map((item) => item['id']?.toString()).whereType<String>().toSet();
      try {
        final payments = await repository.maintenancePayments();
        maintenancePayments = payments
            .where((item) => invoiceIds.contains(item['invoiceId']?.toString()))
            .toList(growable: false);
      } catch (_) {
        // Payment recovery is optional Home enrichment. Keep invoice visibility
        // authoritative even if the separately entitled payment read is unavailable.
        maintenancePayments = const [];
      }
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
  bool isWorkforceLeaveActive(String leaveId) => workforceLeaves.any((item) => item['id']?.toString() == leaveId && item['active'] != false);
  Map<String, dynamic>? workforceAssignmentFor(String assignmentId) => workforceAssignments.where((item) => item['id']?.toString() == assignmentId).firstOrNull;

  bool hasMatchingWorkforceLeave({
    required String assignmentId,
    required DateTime startsOn,
    required DateTime endsOn,
    String? reason,
  }) {
    final normalizedReason = reason?.trim() ?? '';
    return leavesFor(assignmentId).any((item) {
      final itemReason = item['reason']?.toString().trim() ?? '';
      return _sameDateOnly(item['startsOn'], startsOn) &&
          _sameDateOnly(item['endsOn'], endsOn) &&
          itemReason == normalizedReason;
    });
  }

  bool workforceRatingMatches(String assignmentId, {required int score, String? comment}) {
    final rating = ratingFor(assignmentId);
    if (rating == null) return false;
    final currentScore = int.tryParse(rating['score']?.toString() ?? '');
    final currentComment = rating['comment']?.toString().trim() ?? '';
    return currentScore == score && currentComment == (comment?.trim() ?? '');
  }

  bool hasMatchingWorkforceAssignment({
    required String householdId,
    required String name,
    required String phone,
    required String role,
  }) {
    final expectedName = _normalizeWorkforceName(name);
    final expectedPhone = _normalizeWorkforcePhone(phone);
    final expectedRole = role.trim().toUpperCase();
    return workforceAssignments.any((item) {
      if (item['householdId']?.toString() != householdId) return false;
      final worker = item['worker'];
      final workerMap = worker is Map ? worker : item;
      final actualName = _normalizeWorkforceName(workerMap['name']?.toString() ?? '');
      final actualPhone = _normalizeWorkforcePhone(workerMap['phone']?.toString() ?? '');
      final actualRole = workerMap['role']?.toString().trim().toUpperCase() ?? '';
      return actualName == expectedName &&
          actualPhone == expectedPhone &&
          actualRole == expectedRole;
    });
  }

  Future<void> createWorkforceLeave({required String assignmentId, required DateTime startsOn, required DateTime endsOn, String? reason}) async {
    try {
      await repository.createWorkforceLeave(assignmentId: assignmentId, startsOn: startsOn, endsOn: endsOn, reason: reason);
    } catch (_) {
      await _recoverWorkforceMutationFailure();
      if (hasMatchingWorkforceLeave(
        assignmentId: assignmentId,
        startsOn: startsOn,
        endsOn: endsOn,
        reason: reason,
      )) return;
      rethrow;
    }
    await _loadWorkforce();
    if (!_disposed) notifyListeners();
  }

  Future<void> cancelWorkforceLeave(String leaveId) async {
    try {
      await repository.cancelWorkforceLeave(leaveId);
    } catch (_) {
      await _recoverWorkforceMutationFailure();
      rethrow;
    }
    await _loadWorkforce();
    if (!_disposed) notifyListeners();
  }
  Future<void> rateWorkforce(String assignmentId, {required int score, String? comment}) async {
    try {
      await repository.rateWorkforce(assignmentId, score: score, comment: comment);
    } catch (_) {
      await _recoverWorkforceMutationFailure();
      if (workforceRatingMatches(assignmentId, score: score, comment: comment)) return;
      rethrow;
    }
    await _loadWorkforce();
    if (!_disposed) notifyListeners();
  }
  Future<void> addWorkforce({required String householdId, required String name, required String phone, required String role}) async {
    if (!households.any((item) => item['id']?.toString() == householdId)) throw StateError('Household is outside the active property context');
    try {
      await repository.addWorkforce(householdId: householdId, name: name, phone: phone, role: role);
    } catch (_) {
      await _recoverWorkforceMutationFailure();
      if (hasMatchingWorkforceAssignment(
        householdId: householdId,
        name: name,
        phone: phone,
        role: role,
      )) return;
      rethrow;
    }
    await _loadWorkforce();
    if (!_disposed) notifyListeners();
  }
  Future<void> deactivateWorkforce(String assignmentId) async {
    if (!workforceAssignments.any((item) => item['id']?.toString() == assignmentId)) throw StateError('Staff assignment is outside the active property context');
    try {
      await repository.deactivateWorkforce(assignmentId);
    } catch (_) {
      await _recoverWorkforceMutationFailure(refreshAccess: true);
      rethrow;
    }
    await _loadWorkforce();
    await _loadAccess();
    if (!_disposed) notifyListeners();
  }

  Future<void> _recoverWorkforceMutationFailure({bool refreshAccess = false}) async {
    await _loadWorkforce();
    if (refreshAccess) await _loadAccess();
    if (!_disposed) notifyListeners();
  }

  bool _sameDateOnly(Object? raw, DateTime expected) {
    final parsed = DateTime.tryParse(raw?.toString() ?? '');
    return parsed != null &&
        parsed.year == expected.year &&
        parsed.month == expected.month &&
        parsed.day == expected.day;
  }

  String _normalizeWorkforceName(String value) =>
      value.trim().replaceAll(RegExp(r'\s+'), ' ').toLowerCase();

  String _normalizeWorkforcePhone(String value) =>
      value.replaceAll(RegExp(r'\D'), '');

  void _capture(Object error, void Function(String message) assign) {
    if (_disposed) return;
    final text = error.toString();
    if (text.contains('Sign in is required') || text.contains('ApiException(401)')) authError = 'Sign in is required'; else assign(text);
  }

  Future<T> _withAccessMutationRecovery<T>(Future<T> Function() operation) async {
    try {
      return await operation();
    } catch (_) {
      // A resident decision can lose a race to Guard/realtime activity. Always
      // reload the authoritative request state before surfacing the failure so
      // the Gate screen does not keep offering an action that is already stale.
      await _loadAccess();
      if (!_disposed) notifyListeners();
      rethrow;
    }
  }

  Future<Map<String, dynamic>> approveAccess(String requestId, {Duration? duration}) async {
    final request = accessRequests.where((item) => item['id']?.toString() == requestId).firstOrNull;
    if (request == null) throw StateError('Access request is outside the active property context');
    final type = request['subjectType']?.toString();
    final effectiveDuration = duration ?? switch (type) { 'CAB' => const Duration(minutes: 15), 'DELIVERY' => const Duration(minutes: 30), _ => const Duration(hours: 4) };
    final now = DateTime.now();
    final result = await _withAccessMutationRecovery(
      () => repository.approveAccess(requestId, validFrom: now, validUntil: now.add(effectiveDuration)),
    );
    final credential = result['credential']?.toString();
    final rawRequest = result['request'];
    if (credential != null && rawRequest is Map && rawRequest['subjectType']?.toString() == 'VISITOR') lastIssuedVisitorPass = {'credential': credential, 'request': Map<String, dynamic>.from(rawRequest)};
    await _loadAccess();
    if (!_disposed) notifyListeners();
    return result;
  }

  Future<void> denyAccess(String requestId) async {
    if (!accessRequests.any((item) => item['id']?.toString() == requestId)) throw StateError('Access request is outside the active property context');
    await _withAccessMutationRecovery(() => repository.denyAccess(requestId));
    await _loadAccess();
    if (!_disposed) notifyListeners();
  }
  Future<void> cancelAccess(String requestId) async {
    if (!accessRequests.any((item) => item['id']?.toString() == requestId)) throw StateError('Access request is outside the active property context');
    await _withAccessMutationRecovery(() => repository.cancelAccess(requestId));
    await _loadAccess();
    if (!_disposed) notifyListeners();
  }

  Future<Map<String, dynamic>> createGuest({required String name, String? phone, String? purpose, Duration duration = const Duration(hours: 4)}) {
    final unitId = primaryUnitId;
    if (unitId == null) return Future.error(StateError('Select a property before creating a visitor pass'));
    final signature = [unitId, name.trim(), phone?.trim() ?? '', purpose?.trim() ?? '', duration.inSeconds.toString()].join('|');
    final inFlight = _guestInviteInFlight;
    if (inFlight != null) {
      if (_guestInviteInFlightSignature == signature) return inFlight;
      return Future.error(StateError('Another visitor pass is already being created'));
    }
    final previous = _pendingGuestInviteAttempt;
    final attempt = previous != null && previous.signature == signature
        ? previous
        : _GuestInviteAttempt(
            signature: signature,
            idempotencyKey: 'resident-visitor-${DateTime.now().microsecondsSinceEpoch}',
            validFrom: DateTime.now(),
            duration: duration,
          );
    _pendingGuestInviteAttempt = attempt;
    final operation = _createGuestAttempt(unitId: unitId, name: name, phone: phone, purpose: purpose, attempt: attempt);
    _guestInviteInFlight = operation;
    _guestInviteInFlightSignature = signature;
    return operation.whenComplete(() {
      if (identical(_guestInviteInFlight, operation)) {
        _guestInviteInFlight = null;
        _guestInviteInFlightSignature = null;
      }
    });
  }

  Future<Map<String, dynamic>> _createGuestAttempt({
    required String unitId,
    required String name,
    required _GuestInviteAttempt attempt,
    String? phone,
    String? purpose,
  }) async {
    final result = await repository.inviteVisitor(
      unitId: unitId,
      name: name,
      phone: phone,
      purpose: purpose,
      validFrom: attempt.validFrom,
      validUntil: attempt.validUntil,
      idempotencyKey: attempt.idempotencyKey,
    );
    final rawRequest = result['request'];
    final credential = result['credential']?.toString();
    if (rawRequest is! Map || credential == null || credential.isEmpty) throw StateError('Visitor pass was not returned');
    lastIssuedVisitorPass = {'credential': credential, 'request': Map<String, dynamic>.from(rawRequest)};
    if (identical(_pendingGuestInviteAttempt, attempt)) _pendingGuestInviteAttempt = null;
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

class _GuestInviteAttempt {
  _GuestInviteAttempt({required this.signature, required this.idempotencyKey, required this.validFrom, required Duration duration})
      : validUntil = validFrom.add(duration);

  final String signature;
  final String idempotencyKey;
  final DateTime validFrom;
  final DateTime validUntil;
}

extension _FirstOrNull<T> on Iterable<T> { T? get firstOrNull => isEmpty ? null : first; }
