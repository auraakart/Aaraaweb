import 'dart:async';

import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/data/resident_repository.dart';
import 'package:flutter_test/flutter_test.dart';

class _MultiPropertyRepository extends ResidentRepository {
  _MultiPropertyRepository()
      : super(ApiClient(baseUrl: 'http://127.0.0.1:3000', accessToken: 'test'));

  final events = StreamController<Map<String, dynamic>>.broadcast();
  int denyCalls = 0;
  int deactivateWorkforceCalls = 0;
  int householdCalls = 0;
  int accessCalls = 0;
  int serviceCalls = 0;
  int bookingCalls = 0;
  int workforceCalls = 0;
  int invoiceCalls = 0;

  @override
  Future<Map<String, dynamic>> currentEntitlements() async => {
        'productTier': 'PREMIUM',
        'enabledFeatures': [
          'VISITOR_MANAGEMENT',
          'DELIVERY_MANAGEMENT',
          'DOMESTIC_HELP',
          'NOTICES',
          'HELPDESK',
          'SOS',
          'HOUSEHOLD_SERVICES',
          'MAINTENANCE_BILLING',
          'PAYMENTS',
          'AMENITIES',
        ],
      };

  @override
  Future<List<Map<String, dynamic>>> households() async {
    householdCalls++;
    return [
      {'id': 'house-a', 'unitId': 'unit-a'},
      {'id': 'house-b', 'unitId': 'unit-b'},
    ];
  }

  @override
  Future<List<Map<String, dynamic>>> accessRequests() async {
    accessCalls++;
    return [
      {'id': 'access-a', 'unitId': 'unit-a', 'status': 'PENDING', 'subjectType': 'VISITOR'},
      {'id': 'access-b', 'unitId': 'unit-b', 'status': 'PENDING', 'subjectType': 'VISITOR'},
    ];
  }

  @override
  Future<List<Map<String, dynamic>>> notices() async => [
        {'id': 'notice-society', 'title': 'Society notice'},
      ];

  @override
  Future<List<Map<String, dynamic>>> serviceCategories() async {
    serviceCalls++;
    return const [];
  }

  @override
  Future<List<Map<String, dynamic>>> serviceOfferings({String? categoryId}) async => const [];

  @override
  Future<List<Map<String, dynamic>>> bookings() async {
    bookingCalls++;
    return [
      {'id': 'booking-a', 'unitId': 'unit-a'},
      {'id': 'booking-b', 'unitId': 'unit-b'},
    ];
  }

  @override
  Future<List<Map<String, dynamic>>> workforce() async {
    workforceCalls++;
    return [
      {'id': 'assignment-a', 'household': {'unitId': 'unit-a'}},
      {'id': 'assignment-b', 'household': {'unitId': 'unit-b'}},
    ];
  }

  @override
  Future<List<Map<String, dynamic>>> workforceLeaves() async => [
        {'id': 'leave-a', 'assignmentId': 'assignment-a', 'active': true},
        {'id': 'leave-b', 'assignmentId': 'assignment-b', 'active': true},
      ];

  @override
  Future<List<Map<String, dynamic>>> workforceRatings() async => [
        {'id': 'rating-a', 'assignmentId': 'assignment-a'},
        {'id': 'rating-b', 'assignmentId': 'assignment-b'},
      ];

  @override
  Future<List<Map<String, dynamic>>> maintenanceInvoices() async {
    invoiceCalls++;
    return [
      {'id': 'invoice-a', 'unitId': 'unit-a', 'amountPaise': 350000},
      {'id': 'invoice-b', 'unitId': 'unit-b', 'amountPaise': 420000},
    ];
  }

  @override
  Stream<Map<String, dynamic>> accessEvents() => events.stream;

  @override
  Future<void> denyAccess(String requestId) async {
    denyCalls++;
  }

  @override
  Future<Map<String, dynamic>> deactivateWorkforce(String assignmentId) async {
    deactivateWorkforceCalls++;
    return {'id': assignmentId};
  }
}

void main() {
  test('selected property isolates resident state and actions', () async {
    final repository = _MultiPropertyRepository();
    final controller = ResidentDataController(repository, activeUnitId: 'unit-a');

    await controller.load();

    expect(controller.households.map((item) => item['unitId']), ['unit-a']);
    expect(controller.primaryUnitId, 'unit-a');
    expect(controller.accessRequests.map((item) => item['id']), ['access-a']);
    expect(controller.bookings.map((item) => item['id']), ['booking-a']);
    expect(controller.workforceAssignments.map((item) => item['id']), ['assignment-a']);
    expect(controller.workforceLeaves.map((item) => item['id']), ['leave-a']);
    expect(controller.workforceRatings.map((item) => item['id']), ['rating-a']);
    expect(controller.maintenanceInvoices.map((item) => item['id']), ['invoice-a']);
    expect(controller.notices.map((item) => item['id']), ['notice-society']);
    expect(controller.hasFeature('AMENITIES'), isTrue);

    await expectLater(controller.denyAccess('access-b'), throwsStateError);
    expect(repository.denyCalls, 0);
    await expectLater(controller.deactivateWorkforce('assignment-b'), throwsStateError);
    expect(repository.deactivateWorkforceCalls, 0);

    final initialInvoiceCalls = repository.invoiceCalls;
    repository.events.add({'type': 'MAINTENANCE_DUE_ISSUED', 'invoiceId': 'invoice-b', 'unitId': 'unit-b'});
    await Future<void>.delayed(Duration.zero);
    expect(controller.latestNotificationEvent, isNull);
    expect(repository.invoiceCalls, initialInvoiceCalls);

    repository.events.add({'type': 'MAINTENANCE_DUE_ISSUED', 'invoiceId': 'invoice-a', 'unitId': 'unit-a'});
    await Future<void>.delayed(Duration.zero);
    expect(controller.latestNotificationEvent?['invoiceId'], 'invoice-a');
    expect(repository.invoiceCalls, initialInvoiceCalls + 1);

    repository.events.add({'type': 'GENERAL_NOTICE_PUBLISHED', 'noticeId': 'notice-society'});
    await Future<void>.delayed(Duration.zero);
    expect(controller.latestNotificationEvent?['noticeId'], 'notice-society');

    controller.dispose();
    await repository.events.close();
  });

  test('membership-only society session does not fetch or expose unit-bound data', () async {
    final repository = _MultiPropertyRepository();
    final controller = ResidentDataController(repository);

    await controller.load();

    expect(controller.hasActiveProperty, isFalse);
    expect(controller.primaryUnitId, isNull);
    expect(controller.households, isEmpty);
    expect(controller.accessRequests, isEmpty);
    expect(controller.bookings, isEmpty);
    expect(controller.workforceAssignments, isEmpty);
    expect(controller.maintenanceInvoices, isEmpty);
    expect(controller.notices.map((item) => item['id']), ['notice-society']);
    expect(repository.householdCalls, 0);
    expect(repository.accessCalls, 0);
    expect(repository.serviceCalls, 0);
    expect(repository.bookingCalls, 0);
    expect(repository.workforceCalls, 0);
    expect(repository.invoiceCalls, 0);

    repository.events.add({'type': 'MAINTENANCE_DUE_ISSUED', 'invoiceId': 'invoice-a', 'unitId': 'unit-a'});
    await Future<void>.delayed(Duration.zero);
    expect(controller.latestNotificationEvent, isNull);
    expect(repository.invoiceCalls, 0);

    repository.events.add({'type': 'GENERAL_NOTICE_PUBLISHED', 'noticeId': 'notice-society'});
    await Future<void>.delayed(Duration.zero);
    expect(controller.latestNotificationEvent?['noticeId'], 'notice-society');

    controller.dispose();
    await repository.events.close();
  });
}
