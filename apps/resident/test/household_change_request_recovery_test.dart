import 'package:aaraagate_resident/data/demo_resident_repository.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:flutter_test/flutter_test.dart';

class _HouseholdRequestRecoveryRepository extends DemoResidentRepository {
  _HouseholdRequestRecoveryRepository({
    this.commitFamilyAdd = true,
    this.commitFamilyRemove = true,
    this.commitVehicleAdd = true,
    this.commitVehicleRemove = true,
  });

  final bool commitFamilyAdd;
  final bool commitFamilyRemove;
  final bool commitVehicleAdd;
  final bool commitVehicleRemove;
  int reads = 0;
  final List<Map<String, dynamic>> requests = [];
  final List<Map<String, dynamic>> members = [
    {
      'id': 'member-1',
      'relation': 'FAMILY_MEMBER',
      'gateApprovalEnabled': false,
      'gateNotificationEnabled': true,
      'primaryGateContact': false,
      'user': {'id': 'user-1', 'name': 'Asha', 'phone': '+91 90000 00001'},
    },
  ];
  final List<Map<String, dynamic>> vehicles = [
    {'id': 'vehicle-1', 'plateNumber': 'KA01AB1234', 'vehicleType': 'CAR'},
  ];

  @override
  Future<List<Map<String, dynamic>>> households() async {
    reads++;
    return [{
      'id': 'house-1',
      'unitId': 'unit-1',
      'accessPreferences': {'householdChangeRequests': requests.map((e) => Map<String, dynamic>.from(e)).toList()},
      'vehicles': vehicles.map((e) => Map<String, dynamic>.from(e)).toList(),
      'unit': {'id': 'unit-1', 'occupancies': members.map((e) => Map<String, dynamic>.from(e)).toList()},
    }];
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
    if (commitFamilyAdd) {
      requests.add({
        'id': 'family-add',
        'type': 'FAMILY_MEMBER_ADD',
        'status': 'PENDING',
        'payload': {
          'name': name.trim(),
          'phone': phone.trim(),
          'gateApprovalEnabled': gateApprovalEnabled,
          'gateNotificationEnabled': gateNotificationEnabled,
          'primaryGateContact': primaryGateContact,
        },
      });
    }
    throw StateError('transport failed after family add');
  }

  @override
  Future<void> deactivateFamilyMember({required String householdId, required String occupancyId}) async {
    if (commitFamilyRemove) {
      requests.add({
        'id': 'family-remove',
        'type': 'FAMILY_MEMBER_REMOVE',
        'status': 'PROCESSING',
        'targetId': occupancyId,
        'payload': <String, dynamic>{},
      });
    }
    throw StateError('transport failed after family remove');
  }

  @override
  Future<Map<String, dynamic>> addVehicle({
    required String householdId,
    required String plateNumber,
    required String vehicleType,
    String? make,
    String? model,
    String? color,
  }) async {
    if (commitVehicleAdd) {
      requests.add({
        'id': 'vehicle-add',
        'type': 'VEHICLE_ADD',
        'status': 'PENDING',
        'payload': {
          'plateNumber': plateNumber.toUpperCase().replaceAll(RegExp(r'[\s-]+'), ''),
          'vehicleType': vehicleType,
          'make': make?.trim().isEmpty == true ? null : make?.trim(),
          'model': model?.trim().isEmpty == true ? null : model?.trim(),
          'color': color?.trim().isEmpty == true ? null : color?.trim(),
        },
      });
    }
    throw StateError('transport failed after vehicle add');
  }

  @override
  Future<void> deactivateVehicle({required String householdId, required String vehicleId}) async {
    if (commitVehicleRemove) {
      requests.add({
        'id': 'vehicle-remove',
        'type': 'VEHICLE_REMOVE',
        'status': 'PENDING',
        'targetId': vehicleId,
        'payload': {'plateNumber': 'KA01AB1234'},
      });
    }
    throw StateError('transport failed after vehicle remove');
  }
}

Future<ResidentDataController> _controller(_HouseholdRequestRecoveryRepository repository) async {
  final controller=ResidentDataController(repository,activeUnitId:'unit-1',fetchEntitlements:false);
  controller.households=await repository.households();
  return controller;
}

void main(){
  test('family add recovers from the authoritative pending approval request',() async {
    final repository=_HouseholdRequestRecoveryRepository();
    final controller=await _controller(repository);
    addTearDown(controller.dispose);
    await controller.addFamilyMember(
      householdId:'house-1',name:'Ravi',phone:'+91 98888-77777',
      gateApprovalEnabled:true,gateNotificationEnabled:false,primaryGateContact:false,
    );
    expect(controller.pendingHouseholdChangeRequests('house-1',typePrefix:'FAMILY_MEMBER_').map((r)=>r['id']),contains('family-add'));
    expect(controller.hasMatchingFamilyMember(
      householdId:'house-1',phone:'+91 98888-77777',
      gateApprovalEnabled:true,gateNotificationEnabled:false,primaryGateContact:false,
    ),isFalse);
  });

  test('family removal recovers while the active member remains pending approval',() async {
    final repository=_HouseholdRequestRecoveryRepository();
    final controller=await _controller(repository);
    addTearDown(controller.dispose);
    await controller.deactivateFamilyMember(householdId:'house-1',occupancyId:'member-1');
    expect(controller.familyMemberById('house-1','member-1'),isNotNull);
    expect(controller.pendingHouseholdChangeRequests('house-1',typePrefix:'FAMILY_MEMBER_').single['targetId'],'member-1');
  });

  test('vehicle add and remove recover from authoritative pending requests',() async {
    final repository=_HouseholdRequestRecoveryRepository();
    final controller=await _controller(repository);
    addTearDown(controller.dispose);
    await controller.addVehicle(
      householdId:'house-1',plateNumber:'KA 02-CD 5678',vehicleType:'TWO_WHEELER',
      make:'Honda',model:'Activa',color:null,
    );
    await controller.deactivateVehicle(householdId:'house-1',vehicleId:'vehicle-1');
    final pending=controller.pendingHouseholdChangeRequests('house-1',typePrefix:'VEHICLE_');
    expect(pending.map((r)=>r['type']),containsAll(['VEHICLE_ADD','VEHICLE_REMOVE']));
    expect(controller.vehicleById('house-1','vehicle-1'),isNotNull);
  });

  test('does not manufacture vehicle success when no authoritative request exists',() async {
    final repository=_HouseholdRequestRecoveryRepository(commitVehicleAdd:false);
    final controller=await _controller(repository);
    addTearDown(controller.dispose);
    await expectLater(
      controller.addVehicle(householdId:'house-1',plateNumber:'KA03EF9999',vehicleType:'CAR'),
      throwsA(isA<StateError>()),
    );
    expect(controller.pendingHouseholdChangeRequests('house-1',typePrefix:'VEHICLE_'),isEmpty);
  });
}
