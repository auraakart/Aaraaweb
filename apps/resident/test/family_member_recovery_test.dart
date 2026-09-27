import 'package:aaraagate_resident/data/demo_resident_repository.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:flutter_test/flutter_test.dart';

class _FamilyRecoveryRepository extends DemoResidentRepository {
  _FamilyRecoveryRepository({this.commitAdd = true, this.commitRemove = true});

  final bool commitAdd;
  final bool commitRemove;
  final List<Map<String, dynamic>> members = [
    {
      'id': 'member-1',
      'relation': 'FAMILY_MEMBER',
      'gateApprovalEnabled': false,
      'gateNotificationEnabled': true,
      'primaryGateContact': false,
      'user': {'id': 'user-1', 'name': 'Asha', 'phone': '+91 90000 00001', 'status': 'ACTIVE'},
    },
  ];
  final List<Map<String, dynamic>> requests = [];
  int householdReads = 0;
  int requestReads = 0;

  @override
  Future<List<Map<String, dynamic>>> households() async {
    householdReads++;
    return [
      {
        'id': 'house-1',
        'unitId': 'unit-1',
        'unit': {
          'id': 'unit-1',
          'occupancies': members.map((member) => Map<String, dynamic>.from(member)).toList(),
        },
      },
    ];
  }

  @override
  Future<List<Map<String, dynamic>>> householdChangeRequests() async {
    requestReads++;
    return requests.map((request) => Map<String, dynamic>.from(request)).toList(growable: false);
  }

  @override
  Future<Map<String, dynamic>> addFamilyMember({
    required String householdId,
    required String name,
    required String phone,
    bool gateApprovalEnabled = false,
    bool gateNotificationEnabled = true,
    bool primaryGateContact = false,
  }) async {
    if (commitAdd) {
      requests.add({
        'id': 'request-add',
        'householdId': householdId,
        'type': 'FAMILY_MEMBER_ADD',
        'status': 'PENDING',
        'payload': {
          'name': name,
          'phone': phone,
          'gateApprovalEnabled': gateApprovalEnabled,
          'gateNotificationEnabled': primaryGateContact ? true : gateNotificationEnabled,
          'primaryGateContact': primaryGateContact,
        },
      });
    }
    throw StateError('transport failed after add request');
  }

  @override
  Future<Map<String, dynamic>> updateFamilyMember({
    required String householdId,
    required String occupancyId,
    bool? gateApprovalEnabled,
    bool? gateNotificationEnabled,
    bool? primaryGateContact,
  }) async {
    final member = members.firstWhere((item) => item['id'] == occupancyId);
    if (gateApprovalEnabled != null) member['gateApprovalEnabled'] = gateApprovalEnabled;
    if (primaryGateContact == true) {
      member['gateNotificationEnabled'] = true;
    } else if (gateNotificationEnabled != null) {
      member['gateNotificationEnabled'] = gateNotificationEnabled;
    }
    if (primaryGateContact != null) member['primaryGateContact'] = primaryGateContact;
    throw StateError('transport failed after update');
  }

  @override
  Future<void> deactivateFamilyMember({required String householdId, required String occupancyId}) async {
    if (commitRemove) {
      requests.add({
        'id': 'request-remove',
        'householdId': householdId,
        'type': 'FAMILY_MEMBER_REMOVE',
        'status': 'PENDING',
        'targetId': occupancyId,
        'payload': {'occupancyId': occupancyId},
      });
    }
    throw StateError('transport failed after removal request');
  }
}

Future<ResidentDataController> _controller(_FamilyRecoveryRepository repository) async {
  final controller = ResidentDataController(
    repository,
    activeUnitId: 'unit-1',
    fetchEntitlements: false,
  );
  controller.households = await repository.households();
  return controller;
}

void main() {
  test('recovers add from authoritative pending approval without inventing active occupancy', () async {
    final repository = _FamilyRecoveryRepository();
    final controller = await _controller(repository);
    addTearDown(controller.dispose);

    await controller.addFamilyMember(
      householdId: 'house-1',
      name: 'Ravi',
      phone: '+91 98888 77777',
      gateApprovalEnabled: true,
      gateNotificationEnabled: false,
      primaryGateContact: true,
    );

    expect(controller.hasMatchingFamilyAddRequest(
      householdId: 'house-1',
      phone: '+91 98888 77777',
      gateApprovalEnabled: true,
      gateNotificationEnabled: false,
      primaryGateContact: true,
    ), isTrue);
    expect(controller.hasMatchingFamilyMember(
      householdId: 'house-1',
      phone: '+91 98888 77777',
      gateApprovalEnabled: true,
      gateNotificationEnabled: false,
      primaryGateContact: true,
    ), isFalse);
    expect(controller.pendingFamilyRequestsForHousehold('house-1'), hasLength(1));
    expect(repository.requestReads, 1);
  });

  test('recovers settings update only after authoritative occupancy matches', () async {
    final repository = _FamilyRecoveryRepository();
    final controller = await _controller(repository);
    addTearDown(controller.dispose);

    await controller.updateFamilyMember(
      householdId: 'house-1',
      occupancyId: 'member-1',
      gateApprovalEnabled: true,
      gateNotificationEnabled: false,
      primaryGateContact: true,
    );

    expect(controller.familyMemberSettingsMatch(
      householdId: 'house-1',
      occupancyId: 'member-1',
      gateApprovalEnabled: true,
      gateNotificationEnabled: false,
      primaryGateContact: true,
    ), isTrue);
  });

  test('recovers removal submission from authoritative pending approval while member remains active', () async {
    final repository = _FamilyRecoveryRepository();
    final controller = await _controller(repository);
    addTearDown(controller.dispose);

    await controller.deactivateFamilyMember(householdId: 'house-1', occupancyId: 'member-1');

    expect(controller.hasMatchingFamilyRemoveRequest(householdId: 'house-1', occupancyId: 'member-1'), isTrue);
    expect(controller.familyMemberById('house-1', 'member-1'), isNotNull);
  });

  test('does not manufacture add success when no matching approval request exists', () async {
    final repository = _FamilyRecoveryRepository(commitAdd: false);
    final controller = await _controller(repository);
    addTearDown(controller.dispose);

    await expectLater(
      controller.addFamilyMember(householdId: 'house-1', name: 'Ravi', phone: '+91 98888 77777'),
      throwsA(isA<StateError>()),
    );
    expect(controller.householdChangeRequests, isEmpty);
  });

  test('does not manufacture remove success when no matching approval request exists', () async {
    final repository = _FamilyRecoveryRepository(commitRemove: false);
    final controller = await _controller(repository);
    addTearDown(controller.dispose);

    await expectLater(
      controller.deactivateFamilyMember(householdId: 'house-1', occupancyId: 'member-1'),
      throwsA(isA<StateError>()),
    );
    expect(controller.familyMemberById('house-1', 'member-1'), isNotNull);
  });
}
