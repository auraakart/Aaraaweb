import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/service_catalog_models.dart';
import 'emergency_contact_actions.dart';
import 'push_registration_service.dart';
import 'resident_repository.dart';
import 'resident_guest_invite_coordinator.dart';
import 'resident_state_snapshots.dart';

part 'resident_data_loading.dart';
part 'resident_workforce_history.dart';

class ResidentDataController extends ChangeNotifier {
  ResidentDataController(
    this.repository, {
    this.activeUnitId,
    Set<String>? initialEnabledFeatures,
    this.fetchEntitlements = true,
  })  : enabledFeatures = {...?initialEnabledFeatures},
        push = PushRegistrationService(repository),
        _guestInvites = ResidentGuestInviteCoordinator();

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
  List<Map<String, dynamic>> workforcePayments = const [];
  List<Map<String, dynamic>> maintenanceInvoices = const [];
  List<Map<String, dynamic>> maintenancePayments = const [];
  List<Map<String, dynamic>> helpdeskTickets = const [];
  Map<String, dynamic>? lastIssuedVisitorPass;
  Map<String, dynamic>? latestAccessEvent;
  Map<String, dynamic>? latestNotificationEvent;
  StreamSubscription<Map<String, dynamic>>? _accessEvents;
  Timer? _reconnectTimer;
  Future<void>? _loadInFlight;
  final ResidentGuestInviteCoordinator _guestInvites;
  final Map<String, String> _emergencyContactAttemptKeys = <String, String>{};
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
      tasks.add(this._loadNotices());
    } else {
      notices = const [];
    }

    if (hasActiveProperty) {
      tasks.add(this._loadHouseholds());
      if (_canLoadAccess) {
        tasks.add(this._loadAccess());
      } else {
        accessRequests = const [];
        latestAccessEvent = null;
      }
      if (hasFeature('HOUSEHOLD_SERVICES')) {
        tasks.add(this._loadServices());
      } else {
        serviceCategories = const [];
        serviceOfferings = const [];
        bookings = const [];
      }
      if (hasFeature('DOMESTIC_HELP')) {
        tasks.add(this._loadWorkforce());
      } else {
        workforceAssignments = const [];
        workforceLeaves = const [];
        workforceRatings = const [];
        workforcePayments = const [];
      }
      if (hasFeature('MAINTENANCE_BILLING')) {
        tasks.add(this._loadMaintenanceInvoices());
      } else {
        maintenanceInvoices = const [];
        maintenancePayments = const [];
      }
      if (hasFeature('HELPDESK')) {
        tasks.add(this._loadHelpdesk());
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
    accessRequests = const [];
    serviceCategories = const [];
    serviceOfferings = const [];
    bookings = const [];
    workforceAssignments = const [];
    workforceLeaves = const [];
    workforceRatings = const [];
    workforcePayments = const [];
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
      await this._loadNotices();
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
    await this._loadNotices();
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
    final tasks = <Future<void>>[this._loadWorkforce()];
    if (_canLoadAccess) tasks.add(this._loadAccess());
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
          await this._loadAccess();
          final requestId = event['requestId']?.toString();
          if (requestId != null && accessRequests.any((request) => request['id']?.toString() == requestId)) {
            latestAccessEvent = event;
          }
        } else if (type == 'GENERAL_NOTICE_PUBLISHED' && hasFeature('NOTICES')) {
          latestNotificationEvent = event;
          await this._loadNotices();
        } else if (type == 'MAINTENANCE_DUE_ISSUED' && hasFeature('MAINTENANCE_BILLING') && _matchesActiveUnit(event)) {
          latestNotificationEvent = event;
          await this._loadMaintenanceInvoices();
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
      await this._loadNotices();
      if (!_disposed) notifyListeners();
      return;
    }
    if (type == 'MAINTENANCE_DUE_ISSUED') {
      if (hasFeature('MAINTENANCE_BILLING') && _matchesActiveUnit(data)) {
        latestNotificationEvent = data;
        await this._loadMaintenanceInvoices();
      }
      if (!_disposed) notifyListeners();
      return;
    }
    if (!hasActiveProperty || !_canLoadAccess) return;
    final requestId = data['requestId']?.toString();
    if (requestId == null) return;
    await this._loadAccess();
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


  ResidentHouseholdSnapshot get _householdSnapshot => ResidentHouseholdSnapshot(households);

  Map<String, dynamic>? _householdById(String householdId) =>
      _householdSnapshot.householdById(householdId);

  List<Map<String, dynamic>> familyMembersForHousehold(String householdId) =>
      _householdSnapshot.familyMembersForHousehold(householdId);

  Map<String, dynamic>? familyMemberById(String householdId, String occupancyId) =>
      _householdSnapshot.familyMemberById(householdId, occupancyId);

  bool hasMatchingFamilyMember({
    required String householdId,
    required String phone,
    required bool gateApprovalEnabled,
    DateTime? gateApprovalExpiresAt,
    required bool gateNotificationEnabled,
    required bool primaryGateContact,
  }) =>
      _householdSnapshot.hasMatchingFamilyMember(
        householdId: householdId,
        phone: phone,
        gateApprovalEnabled: gateApprovalEnabled,
        gateApprovalExpiresAt: gateApprovalExpiresAt,
        gateNotificationEnabled: gateNotificationEnabled,
        primaryGateContact: primaryGateContact,
      );

  bool familyMemberSettingsMatch({
    required String householdId,
    required String occupancyId,
    required bool gateApprovalEnabled,
    DateTime? gateApprovalExpiresAt,
    required bool gateNotificationEnabled,
    required bool primaryGateContact,
  }) =>
      _householdSnapshot.familyMemberSettingsMatch(
        householdId: householdId,
        occupancyId: occupancyId,
        gateApprovalEnabled: gateApprovalEnabled,
        gateApprovalExpiresAt: gateApprovalExpiresAt,
        gateNotificationEnabled: gateNotificationEnabled,
        primaryGateContact: primaryGateContact,
      );

  Future<void> addFamilyMember({
    required String householdId,
    required String name,
    required String phone,
    bool gateApprovalEnabled = false,
    DateTime? gateApprovalExpiresAt,
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
        gateApprovalExpiresAt: gateApprovalExpiresAt,
        gateNotificationEnabled: gateNotificationEnabled,
        primaryGateContact: primaryGateContact,
      );
    } catch (_) {
      await _reloadHouseholdsForMutationRecovery();
      if (hasMatchingFamilyMember(
        householdId: householdId,
        phone: phone,
        gateApprovalEnabled: gateApprovalEnabled,
        gateApprovalExpiresAt: gateApprovalExpiresAt,
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
    DateTime? gateApprovalExpiresAt,
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
        gateApprovalExpiresAt: gateApprovalExpiresAt,
        clearGateApprovalExpiry: gateApprovalExpiresAt == null,
        gateNotificationEnabled: gateNotificationEnabled,
        primaryGateContact: primaryGateContact,
      );
    } catch (_) {
      await _reloadHouseholdsForMutationRecovery();
      if (familyMemberSettingsMatch(
        householdId: householdId,
        occupancyId: occupancyId,
        gateApprovalEnabled: gateApprovalEnabled,
        gateApprovalExpiresAt: gateApprovalExpiresAt,
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

  List<Map<String, dynamic>> emergencyContactsForHousehold(String householdId) =>
      _householdSnapshot.emergencyContactsForHousehold(householdId);

  Map<String, dynamic>? emergencyContactById(String householdId, String contactId) =>
      _householdSnapshot.emergencyContactById(householdId, contactId);

  bool hasMatchingEmergencyContact({
    required String householdId,
    required String name,
    required String phone,
    String? relation,
    required int priority,
    Set<String> excludingIds = const <String>{},
  }) =>
      _householdSnapshot.hasMatchingEmergencyContact(
        householdId: householdId,
        name: name,
        phone: phone,
        relation: relation,
        priority: priority,
        excludingIds: excludingIds,
      );

  Future<void> addEmergencyContact({
    required String householdId,
    required String name,
    required String phone,
    String? relation,
    int priority = 1,
  }) async {
    if (_householdById(householdId) == null) {
      throw StateError('Household is outside the active property context');
    }
    final existingIds = emergencyContactsForHousehold(householdId)
        .map((item) => item['id']?.toString())
        .whereType<String>()
        .toSet();
    final shape = [
      householdId,
      name.trim().toLowerCase(),
      ResidentHouseholdSnapshot.normalizePhone(phone),
      relation?.trim().toLowerCase() ?? '',
      priority.toString(),
    ].join('|');
    final idempotencyKey = _emergencyContactAttemptKeys.putIfAbsent(
      shape,
      () => 'resident-emergency-contact-${DateTime.now().microsecondsSinceEpoch}',
    );
    try {
      await repository.addEmergencyContact(
        householdId: householdId,
        name: name,
        phone: phone,
        relation: relation,
        priority: priority,
        idempotencyKey: idempotencyKey,
      );
      await _reloadHouseholdsForMutationRecovery();
      _emergencyContactAttemptKeys.remove(shape);
    } catch (_) {
      try {
        await _reloadHouseholdsForMutationRecovery();
      } catch (_) {
        rethrow;
      }
      if (hasMatchingEmergencyContact(
        householdId: householdId,
        name: name,
        phone: phone,
        relation: relation,
        priority: priority,
        excludingIds: existingIds,
      )) {
        _emergencyContactAttemptKeys.remove(shape);
        return;
      }
      rethrow;
    }
  }

  Future<void> deactivateEmergencyContact({
    required String householdId,
    required String contactId,
  }) async {
    if (emergencyContactById(householdId, contactId) == null) {
      throw StateError('Emergency contact is outside the active property context');
    }
    try {
      await repository.deactivateEmergencyContact(
        householdId: householdId,
        contactId: contactId,
      );
      await _reloadHouseholdsForMutationRecovery();
    } catch (_) {
      try {
        await _reloadHouseholdsForMutationRecovery();
      } catch (_) {
        rethrow;
      }
      if (emergencyContactById(householdId, contactId) == null) return;
      rethrow;
    }
  }

  Future<void> _reloadHouseholdsForMutationRecovery() async {
    final selected = activeUnitId;
    if (selected == null) throw StateError('Select a property before managing family members');
    final rows = await repository.households();
    final scoped = rows.where((item) => item['unitId']?.toString() == selected).toList(growable: false);
    households = scoped;
    householdError = rows.isNotEmpty && scoped.isEmpty
        ? 'The selected property is no longer available in this society session.'
        : null;
    if (!_disposed) notifyListeners();
  }








  ResidentWorkforceSnapshot get _workforceSnapshot => ResidentWorkforceSnapshot(
        assignments: workforceAssignments,
        leaves: workforceLeaves,
        ratings: workforceRatings,
        accessRequests: accessRequests,
      );

  bool isWorkforcePresent(String assignmentId) => _workforceSnapshot.isPresent(assignmentId);
  Map<String, dynamic>? ratingFor(String assignmentId) => _workforceSnapshot.ratingFor(assignmentId);
  List<Map<String, dynamic>> leavesFor(String assignmentId) => _workforceSnapshot.leavesFor(assignmentId);
  bool isWorkforceLeaveActive(String leaveId) => _workforceSnapshot.isLeaveActive(leaveId);
  Map<String, dynamic>? workforceAssignmentFor(String assignmentId) => _workforceSnapshot.assignmentFor(assignmentId);

  bool hasMatchingWorkforceLeave({
    required String assignmentId,
    required DateTime startsOn,
    required DateTime endsOn,
    String? reason,
  }) =>
      _workforceSnapshot.hasMatchingLeave(
        assignmentId: assignmentId,
        startsOn: startsOn,
        endsOn: endsOn,
        reason: reason,
      );

  bool workforceRatingMatches(String assignmentId, {required int score, String? comment}) =>
      _workforceSnapshot.ratingMatches(assignmentId, score: score, comment: comment);

  bool hasMatchingWorkforceAssignment({
    required String householdId,
    required String name,
    required String phone,
    required String role,
  }) =>
      _workforceSnapshot.hasMatchingAssignment(
        householdId: householdId,
        name: name,
        phone: phone,
        role: role,
      );

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
    await this._loadWorkforce();
    if (!_disposed) notifyListeners();
  }

  Future<void> cancelWorkforceLeave(String leaveId) async {
    try {
      await repository.cancelWorkforceLeave(leaveId);
    } catch (_) {
      await _recoverWorkforceMutationFailure();
      rethrow;
    }
    await this._loadWorkforce();
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
    await this._loadWorkforce();
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
    await this._loadWorkforce();
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
    await this._loadWorkforce();
    await this._loadAccess();
    if (!_disposed) notifyListeners();
  }

  Future<void> _recoverWorkforceMutationFailure({bool refreshAccess = false}) async {
    await this._loadWorkforce();
    if (refreshAccess) await this._loadAccess();
    if (!_disposed) notifyListeners();
  }

  void _notifyIfMounted() {
    if (!_disposed) notifyListeners();
  }

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
      await this._loadAccess();
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
    await this._loadAccess();
    if (!_disposed) notifyListeners();
    return result;
  }

  Future<void> denyAccess(String requestId) async {
    if (!accessRequests.any((item) => item['id']?.toString() == requestId)) throw StateError('Access request is outside the active property context');
    await _withAccessMutationRecovery(() => repository.denyAccess(requestId));
    await this._loadAccess();
    if (!_disposed) notifyListeners();
  }
  Future<void> cancelAccess(String requestId) async {
    if (!accessRequests.any((item) => item['id']?.toString() == requestId)) throw StateError('Access request is outside the active property context');
    await _withAccessMutationRecovery(() => repository.cancelAccess(requestId));
    await this._loadAccess();
    if (!_disposed) notifyListeners();
  }

  Future<Map<String, dynamic>> createGuest({
    required String name,
    String? phone,
    String? purpose,
    Duration duration = const Duration(hours: 4),
  }) {
    final unitId = primaryUnitId;
    if (unitId == null) return Future.error(StateError('Select a property before creating a visitor pass'));
    return _guestInvites.run(
      unitId: unitId,
      name: name,
      phone: phone,
      purpose: purpose,
      duration: duration,
      execute: (attempt) async {
        final pass = await executeResidentGuestInvite(
          repository: repository,
          unitId: unitId,
          name: name,
          phone: phone,
          purpose: purpose,
          attempt: attempt,
        );
        lastIssuedVisitorPass = pass;
        await this._loadAccess();
        if (!_disposed) notifyListeners();
        return pass;
      },
    );
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
