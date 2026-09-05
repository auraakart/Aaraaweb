import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/data/resident_repository.dart';
import 'package:aaraagate_resident/screens/vehicles_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('vehicle registry shows active household vehicles, parking, and details', (tester) async {
    final controller = ResidentDataController(
      ResidentRepository(ApiClient(baseUrl: 'http://127.0.0.1:3000', accessToken: 'test-token')),
    );
    controller.households = [
      {
        'id': 'demo-household-1',
        'accessPreferences': {
          'parkingSlots': {'vehicle-1': 'B2-18'},
        },
        'vehicles': [
          {
            'id': 'vehicle-1',
            'plateNumber': 'KA01AB1234',
            'vehicleType': 'CAR',
            'make': 'Maruti Suzuki',
            'model': 'Baleno',
            'color': 'Blue',
          },
          {
            'id': 'vehicle-2',
            'plateNumber': 'KA02CD5678',
            'vehicleType': 'TWO_WHEELER',
            'make': 'Honda',
            'model': 'Activa',
          },
        ],
      },
    ];

    await tester.pumpWidget(
      MaterialApp(home: VehiclesScreen(controller: controller, householdId: 'demo-household-1')),
    );

    expect(find.text('Vehicles & parking'), findsOneWidget);
    expect(find.text('KA01AB1234'), findsOneWidget);
    expect(find.text('Car · Maruti Suzuki · Baleno · Blue · Parking: B2-18'), findsOneWidget);
    expect(find.text('KA02CD5678'), findsOneWidget);
    expect(find.text('Two-wheeler · Honda · Activa'), findsOneWidget);
    expect(find.text('Add vehicle'), findsOneWidget);

    controller.dispose();
  });
}
