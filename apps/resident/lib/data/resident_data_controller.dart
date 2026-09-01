import 'package:flutter/foundation.dart';
import 'resident_repository.dart';

class ResidentDataController extends ChangeNotifier {
  ResidentDataController(this.repository);
  final ResidentRepository repository;

  bool loading = false;
  String? error;
  List<Map<String, dynamic>> households = const [];
  List<Map<String, dynamic>> accessRequests = const [];
  List<Map<String, dynamic>> serviceCategories = const [];
  List<Map<String, dynamic>> serviceOfferings = const [];
  List<Map<String, dynamic>> bookings = const [];

  bool get isSignedIn => error != 'Sign in is required';
  String? get primaryUnitId => households.isEmpty ? null : households.first['unitId']?.toString();

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final results = await Future.wait([
        repository.households(),
        repository.accessRequests(),
        repository.serviceCategories(),
        repository.serviceOfferings(),
        repository.bookings(),
      ]);
      households = results[0];
      accessRequests = results[1];
      serviceCategories = results[2];
      serviceOfferings = results[3];
      bookings = results[4];
    } catch (e) {
      final text = e.toString();
      error = text.contains('Sign in is required') ? 'Sign in is required' : text;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> denyAccess(String requestId) async {
    await repository.denyAccess(requestId);
    await load();
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
    await load();
  }
}
