import 'package:flutter/foundation.dart';
import 'resident_repository.dart';

class ResidentDataController extends ChangeNotifier {
  ResidentDataController(this.repository);
  final ResidentRepository repository;

  bool loading = false;
  String? authError;
  String? householdError;
  String? accessError;
  String? servicesError;
  List<Map<String, dynamic>> households = const [];
  List<Map<String, dynamic>> accessRequests = const [];
  List<Map<String, dynamic>> serviceCategories = const [];
  List<Map<String, dynamic>> serviceOfferings = const [];
  List<Map<String, dynamic>> bookings = const [];

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
    servicesError = null;
    notifyListeners();
    await Future.wait([_loadHouseholds(), _loadAccess(), _loadServices()]);
    loading = false;
    notifyListeners();
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

  void _capture(Object error, void Function(String message) assign) {
    final text = error.toString();
    if (text.contains('Sign in is required') || text.contains('ApiException(401)')) {
      authError = 'Sign in is required';
    } else {
      assign(text);
    }
  }

  Future<void> approveAccess(String requestId, {Duration duration = const Duration(hours: 4)}) async {
    final now = DateTime.now();
    await repository.approveAccess(requestId, validFrom: now, validUntil: now.add(duration));
    await _loadAccess();
    notifyListeners();
  }

  Future<void> denyAccess(String requestId) async {
    await repository.denyAccess(requestId);
    await _loadAccess();
    notifyListeners();
  }

  Future<void> createGuest({required String name, String? phone, String? purpose}) async {
    final unitId = primaryUnitId;
    if (unitId == null) throw StateError('No household unit is available');
    await repository.createAccess(
      unitId: unitId,
      subjectType: 'VISITOR',
      subjectName: name,
      subjectPhone: phone,
      purpose: purpose,
    );
    await _loadAccess();
    notifyListeners();
  }
}
