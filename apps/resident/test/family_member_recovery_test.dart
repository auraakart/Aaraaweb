import 'package:aaraagate_resident/data/demo_resident_repository.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:flutter_test/flutter_test.dart';

class _FamilyRecoveryRepository extends DemoResidentRepository {
  _FamilyRecoveryRepository({this.commitAdd = true});

  final bool commitAdd;
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

  int householdReads = 0;

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
  Future<Map<String, dynamic>> addFamilyMember({
    required String householdId,
    required String name,
    required String phone,
    bool gateApprovalEnabled = false,
    DateTime? gateApprovalExpiresAt,
    bool gateNotificationEnabled = true,
    bool primaryGateContact = false,
  }) async {
    if (commitAdd) {
      members.add({
        'id': 'member-new',
        'relation': 'FAMILY_MEMBER',
        'gateApprovalEnabled': gateApprovalEnabled,
        'gateApprovalExpiresAt': gateApprovalEnabled ? gateApprovalExpiresAt?.toUtc().toIso8601String() : null,
        'gateNotificationEnabled': primaryGateContact ? true : gateNotificationEnabled,
        'primaryGateContact': primaryGateContact,
        'user': {'id': 'user-new', 'name': name, 'phone': phone, 'status': 'ACTIVE'},
      });
    }
    throw StateError('transport failed after add');
  }

  @override
  Future<Map<String, dynamic>> updateFamilyMember({
    required String householdId,
    required String occupancyId,
    bool? gateApprovalEnabled,
    DateTime? gateApprovalExpiresAt,
    bool clearGateApprovalExpiry = false,
    bool? gateNotificationEnabled,
    bool? primaryGateContact,
  }) async {
    final member = members.firstWhere((item) => item['id'] == occupancyId);
    if (gateApprovalEnabled != null) member['gateApprovalEnabled'] = gateApprovalEnabled;
    if (gateApprovalExpiresAt != null) member['gateApprovalExpiresAt'] = gateApprovalExpiresAt.toUtc().toIso8601String();
    if (clearGateApprovalExpiry) member['gateApprovalExpiresAt'] = null;
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
    members.removeWhere((item) => item['id'] == occupancyId);
    throw StateError('transport failed after deactivate');
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
  test('recovers add after commit-then-transport failure', () async {
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

    expect(controller.hasMatchingFamilyMember(
      householdId: 'house-1',
      phone: '+91 98888 77777',
      gateApprovalEnabled: true,
      gateNotificationEnabled: false,
      primaryGateContact: true,
    ), isTrue);
    expect(repository.householdReads, 2);
  });

  test('recovers settings update only after authoritative state matches', () async {
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

  test('recovers deactivation when authoritative occupancy disappears', () async {
    final repository = _FamilyRecoveryRepository();
    final controller = await _controller(repository);
    addTearDown(controller.dispose);

    await controller.deactivateFamilyMember(
      householdId: 'house-1',
      occupancyId: 'member-1',
    );

    expect(controller.familyMemberById('house-1', 'member-1'), isNull);
  });

  test('does not manufacture add success when refreshed state does not match', () async {
    final repository = _FamilyRecoveryRepository(commitAdd: false);
    final controller = await _controller(repository);
    addTearDown(controller.dispose);

    await expectLater(
      controller.addFamilyMember(
        householdId: 'house-1',
        name: 'Ravi',
        phone: '+91 98888 77777',
      ),
      throwsA(isA<StateError>()),
    );
    expect(controller.hasMatchingFamilyMember(
      householdId: 'house-1',
      phone: '+91 98888 77777',
      gateApprovalEnabled: false,
      gateNotificationEnabled: true,
      primaryGateContact: false,
    ), isFalse);
  });
}
