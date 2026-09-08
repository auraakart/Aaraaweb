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

  @override
  Future<List<Map<String, dynamic>>> households() async => [
        {'id': 'house-a', 'unitId': 'unit-a'},
        {'id': 'house-b', 'unitId': 'unit-b'},
      ];

  @override
  Future<List<Map<String, dynamic>>> accessRequests() async => [
        {'id': 'access-a', 'unitId': 'unit-a', 'status': 'PENDING', 'subjectType': 'VISITOR'},
        {'id': 'access-b', 'unitId': 'unit-b', 'status': 'PENDING', 'subjectType': 'VISITOR'},
      ];

  @override
  Future<List<Map<String, dynamic>>> notices() async => [
        {'id': 'notice-society', 'title': 'Society notice'},
      ];

  @override
  Future<List<Map<String, dynamic>>> serviceCategories() async => const [];

  @override
  Future<List<Map<String, dynamic>>> serviceOfferings({String? categoryId}) async => const [];

  @override
  Future<List<Map<String, dynamic>>> bookings() async => const [];

  @override
  Future<List<Map<String, dynamic>>> workforce() async => [
        {'id': 'assignment-a', 'household': {'unitId': 'unit-a'}},
        {'id': 'assignment-b', 'household': {'unitId': 'unit-b'}},
      ];

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
    expect(controller.workforceAssignments.map((item) => item['id']), ['assignment-a']);
    expect(controller.workforceLeaves.map((item) => item['id']), ['leave-a']);
    expect(controller.workforceRatings.map((item) => item['id']), ['rating-a']);
    expect(controller.notices.map((item) => item['id']), ['notice-society']);

    await expectLater(controller.denyAccess('access-b'), throwsStateError);
    expect(repository.denyCalls, 0);
    await expectLater(controller.deactivateWorkforce('assignment-b'), throwsStateError);
    expect(repository.deactivateWorkforceCalls, 0);

    repository.events.add({
      'type': 'MAINTENANCE_DUE_ISSUED',
      'invoiceId': 'invoice-b',
      'unitId': 'unit-b',
    });
    await Future<void>.delayed(Duration.zero);
    expect(controller.latestNotificationEvent, isNull);

    repository.events.add({
      'type': 'MAINTENANCE_DUE_ISSUED',
      'invoiceId': 'invoice-a',
      'unitId': 'unit-a',
    });
    await Future<void>.delayed(Duration.zero);
    expect(controller.latestNotificationEvent?['invoiceId'], 'invoice-a');

    repository.events.add({
      'type': 'GENERAL_NOTICE_PUBLISHED',
      'noticeId': 'notice-society',
    });
    await Future<void>.delayed(Duration.zero);
    expect(controller.latestNotificationEvent?['noticeId'], 'notice-society');

    controller.dispose();
    await repository.events.close();
  });
}
