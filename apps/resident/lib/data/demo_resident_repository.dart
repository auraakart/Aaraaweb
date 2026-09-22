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
      'subjectName': 'Amit Verma',
      'subjectPhone': '+919811112221',
      'purpose': 'Family visit',
      'status': 'PENDING',
    },
    {
      'id': 'demo-access-2',
      'unitId': 'demo-unit-1',
      'subjectType': 'DELIVERY',
      'subjectName': 'Amazon Delivery',
      'purpose': 'Parcel delivery',
      'status': 'APPROVED',
    },
    {
      'id': 'demo-access-3',
      'unitId': 'demo-unit-1',
      'subjectType': 'CAB',
      'subjectName': 'Ola Cab - KA 01 AB 4321',
      'purpose': 'Pickup',
      'status': 'CHECKED_IN',
    },
    {
      'id': 'demo-access-4',
      'unitId': 'demo-unit-1',
      'subjectType': 'VISITOR',
      'subjectName': 'Rahul Sharma',
      'purpose': 'Friend visit',
      'status': 'APPROVED',
    },
    {
      'id': 'demo-access-5',
      'unitId': 'demo-unit-1',
      'subjectType': 'DELIVERY',
      'subjectName': 'Swiggy Delivery',
      'purpose': 'Food delivery',
      'status': 'CHECKED_OUT',
    },
    {
      'id': 'demo-access-6',
      'unitId': 'demo-unit-1',
      'subjectType': 'VISITOR',
      'subjectName': 'Neha Iyer',
      'purpose': 'Tuition class',
      'status': 'DENIED',
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
        {
          'id': 'demo-household-2',
          'unitId': 'demo-unit-2',
          'unitNumber': 'B-804',
          'buildingName': 'Cedar Tower',
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
        {
          'id': 'demo-notice-3',
          'title': 'Lift maintenance - Maple Tower',
          'body': 'Lift 2 will be unavailable between 2:00 PM and 4:00 PM tomorrow.',
          'audience': 'OWNER_AND_OCCUPANTS',
        },
        {
          'id': 'demo-notice-4',
          'title': 'September maintenance reminder',
          'body': 'Please clear September maintenance dues before 10 September.',
          'audience': 'OWNER_ONLY',
        },
        {
          'id': 'demo-notice-5',
          'title': 'Ganesh festival celebration',
          'body': 'Cultural programme starts at 6:30 PM in the clubhouse on Friday.',
          'audience': 'OWNER_AND_OCCUPANTS',
        },
        {
          'id': 'demo-notice-6',
          'title': 'Pest-control schedule',
          'body': 'Common-area pest control is scheduled for Monday morning.',
          'audience': 'OWNER_AND_OCCUPANTS',
        },
      ];

  @override
  Stream<Map<String, dynamic>> accessEvents() => const Stream.empty();

  @override
  Future<List<Map<String, dynamic>>> serviceCategories() async => [
        {'id': 'demo-category-1', 'name': 'Home maintenance'},
        {'id': 'demo-category-2', 'name': 'Cleaning'},
        {'id': 'demo-category-3', 'name': 'Electrical'},
        {'id': 'demo-category-4', 'name': 'Plumbing'},
        {'id': 'demo-category-5', 'name': 'Appliance repair'},
        {'id': 'demo-category-6', 'name': 'Beauty & wellness'},
      ];

  final List<Map<String, dynamic>> _offerings = const [
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
    {
      'id': 'demo-offering-3',
      'categoryId': 'demo-category-3',
      'name': 'Electrician visit',
      'description': 'Switch, fan and light troubleshooting',
      'price': 299,
    },
    {
      'id': 'demo-offering-4',
      'categoryId': 'demo-category-4',
      'name': 'Plumber visit',
      'description': 'Tap, flush and minor leakage repair',
      'price': 349,
    },
    {
      'id': 'demo-offering-5',
      'categoryId': 'demo-category-5',
      'name': 'Washing machine service',
      'description': 'Inspection and basic repair visit',
      'price': 499,
    },
    {
      'id': 'demo-offering-6',
      'categoryId': 'demo-category-6',
      'name': 'Salon at home',
      'description': 'Basic grooming package',
      'price': 899,
    },
  ];

  @override
  Future<List<Map<String, dynamic>>> serviceOfferings({String? categoryId}) async =>
      _offerings
          .where((item) => categoryId == null || item['categoryId'] == categoryId)
          .map((item) => Map<String, dynamic>.from(item))
          .toList();

  @override
  Future<List<Map<String, dynamic>>> bookings() async => [
        {
          'id': 'demo-booking-1',
          'unitId': 'demo-unit-1',
          'offeringId': 'demo-offering-1',
          'status': 'CONFIRMED',
          'offering': {'name': 'AC service'},
        },
        {
          'id': 'demo-booking-2',
          'unitId': 'demo-unit-1',
          'offeringId': 'demo-offering-3',
          'status': 'REQUESTED',
          'offering': {'name': 'Electrician visit'},
        },
        {
          'id': 'demo-booking-3',
          'unitId': 'demo-unit-1',
          'offeringId': 'demo-offering-2',
          'status': 'COMPLETED',
          'offering': {'name': 'Deep cleaning'},
        },
        {
          'id': 'demo-booking-4',
          'unitId': 'demo-unit-1',
          'offeringId': 'demo-offering-4',
          'status': 'CANCELLED',
          'offering': {'name': 'Plumber visit'},
        },
      ];

  @override
  Future<List<Map<String, dynamic>>> workforce() async => [
        {
          'id': 'demo-workforce-1',
          'status': 'APPROVED',
          'householdId': 'demo-household-1',
          'household': {
            'unitId': 'demo-unit-1',
            'unit': {
              'number': 'A-1204',
              'building': {'name': 'Maple Tower'}
            }
          },
          'worker': {
            'id': 'demo-worker-1',
            'name': 'Lakshmi R.',
            'phone': '+919800000001',
            'role': 'MAID',
            'verification': 'VERIFIED',
          },
        },
        {
          'id': 'demo-workforce-2',
          'status': 'APPROVED',
          'householdId': 'demo-household-1',
          'household': {
            'unitId': 'demo-unit-1',
            'unit': {
              'number': 'A-1204',
              'building': {'name': 'Maple Tower'}
            }
          },
          'worker': {
            'id': 'demo-worker-2',
            'name': 'Ramesh K.',
            'phone': '+919800000002',
            'role': 'DRIVER',
            'verification': 'VERIFIED',
          },
        },
        {
          'id': 'demo-workforce-3',
          'status': 'APPROVED',
          'householdId': 'demo-household-1',
          'household': {
            'unitId': 'demo-unit-1',
            'unit': {
              'number': 'A-1204',
              'building': {'name': 'Maple Tower'}
            }
          },
          'worker': {
            'id': 'demo-worker-3',
            'name': 'Savitri M.',
            'phone': '+919800000003',
            'role': 'COOK',
            'verification': 'VERIFIED',
          },
        },
        {
          'id': 'demo-workforce-4',
          'status': 'PENDING',
          'householdId': 'demo-household-1',
          'household': {
            'unitId': 'demo-unit-1',
            'unit': {
              'number': 'A-1204',
              'building': {'name': 'Maple Tower'}
            }
          },
          'worker': {
            'id': 'demo-worker-4',
            'name': 'Manoj P.',
            'phone': '+919800000004',
            'role': 'OTHER',
            'verification': 'VERIFIED',
          },
        },
        {
          'id': 'demo-workforce-5',
          'status': 'SUSPENDED',
          'householdId': 'demo-household-1',
          'household': {
            'unitId': 'demo-unit-1',
            'unit': {
              'number': 'A-1204',
              'building': {'name': 'Maple Tower'}
            }
          },
          'worker': {
            'id': 'demo-worker-5',
            'name': 'Asha S.',
            'phone': '+919800000005',
            'role': 'NANNY',
            'verification': 'SUSPENDED',
          },
        },
      ];

  @override
  Future<List<Map<String, dynamic>>> workforceLeaves() async => [
        {
          'id': 'demo-leave-1',
          'assignmentId': 'demo-workforce-1',
          'startsOn': '2026-09-08',
          'endsOn': '2026-09-09',
          'reason': 'Family function',
          'active': true,
        },
        {
          'id': 'demo-leave-2',
          'assignmentId': 'demo-workforce-3',
          'startsOn': '2026-09-14',
          'endsOn': '2026-09-14',
          'reason': 'Personal work',
          'active': true,
        },
      ];

  @override
  Future<List<Map<String, dynamic>>> workforceRatings() async => [
        {'assignmentId': 'demo-workforce-1', 'score': 5, 'comment': 'Reliable and punctual'},
        {'assignmentId': 'demo-workforce-2', 'score': 4, 'comment': 'Safe and dependable driver'},
        {'assignmentId': 'demo-workforce-3', 'score': 5, 'comment': 'Excellent home-style cooking'},
        {'assignmentId': 'demo-workforce-4', 'score': 4, 'comment': 'Regular and thorough'},
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
        {
          'id': 'demo-ticket-2',
          'unitId': 'demo-unit-1',
          'title': 'Water seepage near balcony',
          'description': 'Minor seepage visible after rain.',
          'status': 'OPEN',
          'priority': 'HIGH',
        },
        {
          'id': 'demo-ticket-3',
          'unitId': 'demo-unit-1',
          'title': 'Intercom audio issue',
          'description': 'Visitor voice is not audible clearly.',
          'status': 'RESOLVED',
          'priority': 'NORMAL',
        },
        {
          'id': 'demo-ticket-4',
          'unitId': 'demo-unit-1',
          'title': 'Parking sticker replacement',
          'description': 'Old sticker is damaged and needs replacement.',
          'status': 'CLOSED',
          'priority': 'LOW',
        },
      ];

  @override
  Future<List<Map<String, dynamic>>> maintenanceInvoices() async => [
        {
          'id': 'demo-invoice-1',
          'unitId': 'demo-unit-1',
          'billingPeriod': 'September 2026',
          'invoiceNumber': 'INV-SEP-2026-A1204',
          'buildingName': 'Maple Tower',
          'unitNumber': 'A-1204',
          'amountPaise': 425000,
          'dueDate': '2026-09-25T23:59:59Z',
          'description': 'Monthly maintenance and common-area services',
          'status': 'ISSUED',
        },
        {
          'id': 'demo-invoice-2',
          'unitId': 'demo-unit-1',
          'billingPeriod': 'August 2026',
          'invoiceNumber': 'INV-AUG-2026-A1204',
          'buildingName': 'Maple Tower',
          'unitNumber': 'A-1204',
          'amountPaise': 425000,
          'dueDate': '2026-08-25T23:59:59Z',
          'status': 'PAID',
        },
        {
          'id': 'demo-invoice-3',
          'unitId': 'demo-unit-1',
          'billingPeriod': 'July 2026',
          'invoiceNumber': 'INV-JUL-2026-A1204',
          'buildingName': 'Maple Tower',
          'unitNumber': 'A-1204',
          'amountPaise': 425000,
          'dueDate': '2026-07-25T23:59:59Z',
          'status': 'PAID',
        },
        {
          'id': 'demo-invoice-4',
          'unitId': 'demo-unit-1',
          'billingPeriod': 'June 2026',
          'invoiceNumber': 'INV-JUN-2026-A1204',
          'buildingName': 'Maple Tower',
          'unitNumber': 'A-1204',
          'amountPaise': 410000,
          'dueDate': '2026-06-25T23:59:59Z',
          'status': 'PAID',
        },
        {
          'id': 'demo-invoice-5',
          'unitId': 'demo-unit-1',
          'billingPeriod': 'May 2026',
          'invoiceNumber': 'INV-MAY-2026-A1204',
          'buildingName': 'Maple Tower',
          'unitNumber': 'A-1204',
          'amountPaise': 410000,
          'dueDate': '2026-05-25T23:59:59Z',
          'status': 'PAID',
        },
      ];

  @override
  Future<List<Map<String, dynamic>>> maintenancePayments() async => [
        {
          'id': 'demo-payment-1',
          'invoiceId': 'demo-invoice-2',
          'invoiceNumber': 'INV-AUG-2026-A1204',
          'buildingName': 'Maple Tower',
          'unitNumber': 'A-1204',
          'amountPaise': 425000,
          'status': 'CAPTURED',
          'mode': 'UPI',
          'paidAt': '2026-08-05T09:15:00Z',
        },
        {
          'id': 'demo-payment-2',
          'invoiceId': 'demo-invoice-3',
          'invoiceNumber': 'INV-JUL-2026-A1204',
          'buildingName': 'Maple Tower',
          'unitNumber': 'A-1204',
          'amountPaise': 425000,
          'status': 'CAPTURED',
          'mode': 'NET_BANKING',
          'paidAt': '2026-07-06T13:40:00Z',
        },
        {
          'id': 'demo-payment-3',
          'invoiceId': 'demo-invoice-4',
          'invoiceNumber': 'INV-JUN-2026-A1204',
          'buildingName': 'Maple Tower',
          'unitNumber': 'A-1204',
          'amountPaise': 410000,
          'status': 'CAPTURED',
          'mode': 'UPI',
          'paidAt': '2026-06-04T06:20:00Z',
        },
      ];

  @override
  Future<List<Map<String, dynamic>>> helpdeskActivities(String ticketId) async => [
        {
          'id': 'demo-activity-1-$ticketId',
          'type': 'CREATED',
          'message': 'Request created by resident.',
        },
        {
          'id': 'demo-activity-2-$ticketId',
          'type': 'COMMENT',
          'message': 'Facility team acknowledged the request.',
        },
        {
          'id': 'demo-activity-3-$ticketId',
          'type': 'COMMENT',
          'message': 'Technician visit has been scheduled.',
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
      'subjectPhone': phone,
      'purpose': purpose,
      'status': 'APPROVED',
    };
    _access.insert(0, request);
    return {'request': request, 'credential': 'DEMO-PASS'};
  }

  @override
  Future<List<Map<String, dynamic>>> communityMeetings() async => [
        {
          'id': 'demo-meeting-1',
          'title': 'September residents meeting',
          'status': 'SCHEDULED',
          'scheduledAt': '2026-09-27T11:00:00+05:30',
        },
        {
          'id': 'demo-meeting-2',
          'title': 'AGM 2026',
          'status': 'CLOSED',
          'scheduledAt': '2026-08-16T10:30:00+05:30',
        },
      ];

  @override
  Future<List<Map<String, dynamic>>> communityDocuments() async => [
        {'id': 'demo-gov-doc-1', 'kind': 'MINUTES', 'note': 'AGM 2026 approved minutes'},
        {'id': 'demo-gov-doc-2', 'kind': 'AGENDA', 'note': 'September residents meeting agenda'},
      ];

  @override
  Future<List<Map<String, dynamic>>> societyDocuments() async => [
        {
          'id': 'demo-doc-1',
          'title': 'Community handbook',
          'category': 'POLICY',
          'audience': 'OWNER_AND_OCCUPANTS',
          'version': '3',
        },
        {
          'id': 'demo-doc-2',
          'title': 'Emergency preparedness guide',
          'category': 'SAFETY',
          'audience': 'OWNER_AND_OCCUPANTS',
          'version': '2',
        },
        {
          'id': 'demo-doc-3',
          'title': 'Parking policy',
          'category': 'PARKING',
          'audience': 'OWNER_AND_OCCUPANTS',
          'version': '4',
        },
      ];

  @override
  Future<Map<String, dynamic>> societyDocumentDownloadIntent(String documentId) async =>
      {'id': documentId, 'url': 'https://example.com/aaraagate-demo-document.pdf'};

  @override
  Future<List<Map<String, dynamic>>> communityPolls() async => [
        {
          'id': 'demo-poll-1',
          'question': 'Preferred timing for Sunday yoga?',
          'status': 'OPEN',
          'options': [
            {'id': 'demo-option-1', 'label': '6:30 AM'},
            {'id': 'demo-option-2', 'label': '7:30 AM'},
            {'id': 'demo-option-3', 'label': '8:30 AM'},
          ],
        },
        {
          'id': 'demo-poll-2',
          'question': 'Choose the clubhouse movie night genre',
          'status': 'OPEN',
          'options': [
            {'id': 'demo-option-4', 'label': 'Family'},
            {'id': 'demo-option-5', 'label': 'Comedy'},
          ],
        },
      ];

  @override
  Future<Map<String, dynamic>> respondToCommunityPoll({required String pollId, required String optionId}) async =>
      {'pollId': pollId, 'optionId': optionId, 'status': 'RECORDED'};

  @override
  Future<Map<String, dynamic>> createMaintenancePayment({required String invoiceId, required String idempotencyKey}) async =>
      {'id': 'demo-payment-order-1', 'providerOrderId': 'DEMO-UPI-ORDER-2026', 'invoiceId': invoiceId, 'status': 'CREATED'};

  @override
  Future<Map<String, dynamic>> maintenanceReceipt(String paymentId) async => {
        'id': paymentId,
        'receiptNumber': 'RCT-A1204-2026-08',
        'amountPaise': 425000,
        'societyName': 'Aaraagate Demo Residency',
        'buildingName': 'Maple Tower',
        'unitNumber': 'A-1204',
        'invoiceNumber': 'INV-AUG-2026-A1204',
        'status': 'CAPTURED',
      };

  @override
  Future<Map<String, dynamic>> createHelpdeskTicket({
    required String unitId,
    required String title,
    required String description,
    String? category,
    String priority = 'NORMAL',
  }) async => {
        'id': 'demo-ticket-created',
        'unitId': unitId,
        'title': title,
        'description': description,
        'category': category,
        'priority': priority,
        'status': 'OPEN',
      };

  @override
  Future<void> addHelpdeskComment(String ticketId, String message) async {}

  @override
  Future<void> cancelAccess(String requestId) async {
    _access.firstWhere((entry) => entry['id'] == requestId)['status'] = 'CANCELLED';
  }

  @override
  Future<Map<String, dynamic>> createAccess({
    required String unitId,
    required String subjectType,
    required String subjectName,
    String? subjectPhone,
    String? purpose,
  }) async {
    final request = <String, dynamic>{
      'id': 'demo-access-${_access.length + 1}',
      'unitId': unitId,
      'subjectType': subjectType,
      'subjectName': subjectName,
      'subjectPhone': subjectPhone,
      'purpose': purpose,
      'status': 'PENDING',
    };
    _access.insert(0, request);
    return request;
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
