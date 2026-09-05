import 'api_client.dart';
import 'resident_repository.dart';

class DemoResidentRepository extends ResidentRepository {
  DemoResidentRepository()
      : super(ApiClient(baseUrl: 'http://demo.invalid', accessToken: 'demo'));

  final List<Map<String, dynamic>> _access = [
    {
      'id': 'demo-access-1',
      'unitId': 'demo-unit-1',
      'subjectType': 'VISITOR',
      'subjectName': 'Ravi Kumar',
      'purpose': 'Family visit',
      'status': 'PENDING',
    },
    {
      'id': 'demo-access-2',
      'unitId': 'demo-unit-1',
      'subjectType': 'DELIVERY',
      'subjectName': 'Parcel delivery',
      'status': 'APPROVED',
    },
  ];

  @override
  Future<List<Map<String, dynamic>>> households() async => [
        {
          'id': 'demo-household-1',
          'unitId': 'demo-unit-1',
          'unitNumber': 'A-1204',
          'buildingName': 'Maple Tower',
          'societyName': 'Aaraagate Demo Residency',
          'occupancyRole': 'OWNER',
        },
      ];

  @override
  Future<List<Map<String, dynamic>>> accessRequests() async =>
      _access.map((item) => Map<String, dynamic>.from(item)).toList();

  @override
  Future<List<Map<String, dynamic>>> notices() async => [
        {
          'id': 'demo-notice-1',
          'title': 'Water tank cleaning',
          'body': 'Water supply will pause from 10:00 AM to 12:00 PM on Sunday.',
          'audience': 'OWNER_AND_OCCUPANTS',
        },
        {
          'id': 'demo-notice-2',
          'title': 'Community badminton evening',
          'body': 'Court bookings are open for Saturday evening.',
          'audience': 'OWNER_AND_OCCUPANTS',
        },
      ];

  @override
  Stream<Map<String, dynamic>> accessEvents() => const Stream.empty();

  @override
  Future<List<Map<String, dynamic>>> serviceCategories() async => [
        {'id': 'demo-category-1', 'name': 'Home maintenance'},
        {'id': 'demo-category-2', 'name': 'Cleaning'},
      ];

  @override
  Future<List<Map<String, dynamic>>> serviceOfferings({String? categoryId}) async => [
        {
          'id': 'demo-offering-1',
          'categoryId': 'demo-category-1',
          'name': 'AC service',
          'description': 'General inspection and cleaning',
          'price': 699,
        },
        {
          'id': 'demo-offering-2',
          'categoryId': 'demo-category-2',
          'name': 'Deep cleaning',
          'description': '2 BHK home cleaning package',
          'price': 1499,
        },
      ];

  @override
  Future<List<Map<String, dynamic>>> bookings() async => [
        {
          'id': 'demo-booking-1',
          'offeringId': 'demo-offering-1',
          'status': 'CONFIRMED',
          'offering': {'name': 'AC service'},
        },
      ];

  @override
  Future<List<Map<String, dynamic>>> workforce() async => [
        {
          'id': 'demo-workforce-1',
          'assignmentId': 'demo-workforce-1',
          'householdId': 'demo-household-1',
          'name': 'Lakshmi',
          'phone': '+919800000001',
          'role': 'HOUSE_HELP',
          'active': true,
        },
        {
          'id': 'demo-workforce-2',
          'assignmentId': 'demo-workforce-2',
          'householdId': 'demo-household-1',
          'name': 'Ramesh',
          'phone': '+919800000002',
          'role': 'DRIVER',
          'active': true,
        },
      ];

  @override
  Future<List<Map<String, dynamic>>> workforceLeaves() async => const [];

  @override
  Future<List<Map<String, dynamic>>> workforceRatings() async => [
        {'assignmentId': 'demo-workforce-1', 'score': 5, 'comment': 'Reliable and punctual'},
      ];

  @override
  Future<List<Map<String, dynamic>>> helpdeskTickets() async => [
        {
          'id': 'demo-ticket-1',
          'unitId': 'demo-unit-1',
          'title': 'Corridor light not working',
          'description': 'Light near lift lobby is flickering.',
          'status': 'IN_PROGRESS',
          'priority': 'NORMAL',
        },
      ];

  @override
  Future<List<Map<String, dynamic>>> maintenanceInvoices() async => [
        {
          'id': 'demo-invoice-1',
          'unitId': 'demo-unit-1',
          'periodLabel': 'September 2026',
          'amount': 4250,
          'amountDue': 4250,
          'status': 'DUE',
        },
      ];

  @override
  Future<List<Map<String, dynamic>>> maintenancePayments() async => const [];

  @override
  Future<List<Map<String, dynamic>>> helpdeskActivities(String ticketId) async => [
        {
          'id': 'demo-activity-1',
          'type': 'COMMENT',
          'message': 'Facility team has assigned an electrician.',
        },
      ];

  @override
  Future<Map<String, dynamic>> approveAccess(
    String requestId, {
    required DateTime validFrom,
    required DateTime validUntil,
  }) async {
    final item = _access.firstWhere((entry) => entry['id'] == requestId);
    item['status'] = 'APPROVED';
    return {
      'request': Map<String, dynamic>.from(item),
      'credential': 'DEMO-PASS',
    };
  }

  @override
  Future<void> denyAccess(String requestId) async {
    _access.firstWhere((entry) => entry['id'] == requestId)['status'] = 'DENIED';
  }

  @override
  Future<Map<String, dynamic>> inviteVisitor({
    required String unitId,
    required String name,
    required DateTime validFrom,
    required DateTime validUntil,
    String? phone,
    String? purpose,
  }) async {
    final request = <String, dynamic>{
      'id': 'demo-access-${_access.length + 1}',
      'unitId': unitId,
      'subjectType': 'VISITOR',
      'subjectName': name,
      'purpose': purpose,
      'status': 'APPROVED',
    };
    _access.insert(0, request);
    return {'request': request, 'credential': 'DEMO-PASS'};
  }

  @override
  Future<void> registerPushDevice({
    required String token,
    required String platform,
    String? deviceId,
  }) async {}

  @override
  Future<void> unregisterPushDevice(String token) async {}
}
