import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/data/resident_repository.dart';
import 'package:flutter_test/flutter_test.dart';

class _VehicleRequestApi extends ApiClient {
  _VehicleRequestApi(this.requests, {this.commitAdd = true, this.commitRemove = true})
      : super(baseUrl: 'http://test.invalid', accessToken: 'test');

  final List<Map<String, dynamic>> requests;
  final bool commitAdd;
  final bool commitRemove;
  int sequence = 0;

  @override
  Future<dynamic> post(String path, [Map<String, dynamic>? body]) async {
    if (path.endsWith('/vehicles')) {
      if (commitAdd) {
        sequence++;
        requests.add({
          'id': 'request-add-$sequence',
          'householdId': 'house-1',
          'unitId': 'unit-1',
          'type': 'VEHICLE_ADD',
          'status': 'PENDING',
          'payload': {
            'plateNumber': (body?['plateNumber']?.toString() ?? '').trim().toUpperCase().replaceAll(RegExp(r'[\s-]+'), ''),
            'vehicleType': body?['vehicleType'],
            'make': body?['make'],
            'model': body?['model'],
            'color': body?['color'],
          },
        });
      }
      throw StateError('transport failed after vehicle request');
    }
    return super.post(path, body);
  }

  @override
  Future<dynamic> patch(String path, [Map<String, dynamic>? body]) async {
    if (path.endsWith('/deactivate')) {
      if (commitRemove) {
        sequence++;
        requests.add({
          'id': 'request-remove-$sequence',
          'householdId': 'house-1',
          'unitId': 'unit-1',
          'type': 'VEHICLE_REMOVE',
          'status': 'PENDING',
          'targetId': 'vehicle-1',
          'payload': {'plateNumber': 'TN01AB1234'},
        });
      }
      throw StateError('transport failed after vehicle removal request');
    }
    return super.patch(path, body);
  }
}

class _VehicleRequestRepository extends ResidentRepository {
  factory _VehicleRequestRepository({bool commitAdd = true, bool commitRemove = true}) {
    final requests = <Map<String, dynamic>>[];
    return _VehicleRequestRepository._(
      requests,
      _VehicleRequestApi(requests, commitAdd: commitAdd, commitRemove: commitRemove),
    );
  }

  _VehicleRequestRepository._(this.requests, ApiClient api) : super(api);

  final List<Map<String, dynamic>> requests;

  @override
  Future<List<Map<String, dynamic>>> householdChangeRequests() async =>
      requests.map((item) => Map<String, dynamic>.from(item)).toList(growable: false);

  @override
  Future<List<Map<String, dynamic>>> households() async => [
        {
          'id': 'house-1',
          'unitId': 'unit-1',
          'vehicles': [
            {
              'id': 'vehicle-1',
              'plateNumber': 'TN01AB1234',
              'vehicleType': 'CAR',
              'make': 'Tata',
              'model': 'Nexon',
              'color': 'Blue',
            },
          ],
        },
      ];
}

Future<ResidentDataController> _controller(_VehicleRequestRepository repository) async {
  final controller = ResidentDataController(repository, activeUnitId: 'unit-1', fetchEntitlements: false);
  controller.households = await repository.households();
  return controller;
}

void main() {
  test('recovers vehicle add after request commits but transport fails', () async {
    final repository = _VehicleRequestRepository();
    final controller = await _controller(repository);
    addTearDown(controller.dispose);

    await controller.requestVehicleAdd(
      householdId: 'house-1',
      plateNumber: 'TN 02 CD 5678',
      vehicleType: 'CAR',
      make: 'Hyundai',
      model: 'i20',
      color: 'White',
    );

    final pending = controller.vehicleChangeRequestsForHousehold('house-1');
    expect(pending, hasLength(1));
    expect(pending.single['type'], 'VEHICLE_ADD');
    expect((pending.single['payload'] as Map)['plateNumber'], 'TN02CD5678');
  });

  test('does not treat a pre-existing equivalent request as recovered success', () async {
    final repository = _VehicleRequestRepository(commitAdd: false);
    repository.requests.add({
      'id': 'existing-request',
      'householdId': 'house-1',
      'unitId': 'unit-1',
      'type': 'VEHICLE_ADD',
      'status': 'PENDING',
      'payload': {
        'plateNumber': 'TN02CD5678',
        'vehicleType': 'CAR',
        'make': 'Hyundai',
        'model': 'i20',
        'color': 'White',
      },
    });
    final controller = await _controller(repository);
    addTearDown(controller.dispose);

    await expectLater(
      controller.requestVehicleAdd(
        householdId: 'house-1',
        plateNumber: 'TN02CD5678',
        vehicleType: 'CAR',
        make: 'Hyundai',
        model: 'i20',
        color: 'White',
      ),
      throwsA(isA<StateError>()),
    );
  });

  test('recovers vehicle removal request and keeps active vehicle visible until approval', () async {
    final repository = _VehicleRequestRepository();
    final controller = await _controller(repository);
    addTearDown(controller.dispose);

    await controller.requestVehicleRemoval(householdId: 'house-1', vehicleId: 'vehicle-1');

    final pending = controller.vehicleChangeRequestsForHousehold('house-1');
    expect(pending, hasLength(1));
    expect(pending.single['type'], 'VEHICLE_REMOVE');
    expect(pending.single['targetId'], 'vehicle-1');
    expect((controller.households.single['vehicles'] as List), hasLength(1));
  });
}
