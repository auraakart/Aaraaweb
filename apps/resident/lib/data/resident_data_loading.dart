part of 'resident_data_controller.dart';

extension ResidentDataLoading on ResidentDataController {
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
      workforcePayments = const [];
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
      try {
        final payments = await repository.workforcePayments();
        workforcePayments = payments.where((item) => assignmentIds.contains(item['assignmentId']?.toString())).toList(growable: false);
      } catch (_) {
        // Household staff remains authoritative even when optional private payment history is unavailable.
        workforcePayments = const [];
      }
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
}
