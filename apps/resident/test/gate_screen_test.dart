import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/data/resident_repository.dart';
import 'package:aaraagate_resident/screens/gate_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('delivery and cab approvals show gate context and short approval windows', (tester) async {
    final controller = ResidentDataController(
      ResidentRepository(ApiClient(baseUrl: 'http://127.0.0.1:3000', accessToken: 'test-token')),
    );
    controller.accessRequests = [
      {
        'id': 'delivery-1',
        'subjectType': 'DELIVERY',
        'subjectName': 'Delivery partner',
        'status': 'PENDING',
        'metadata': {'provider': 'Amazon', 'vehicleNumber': 'KA01AB1234'},
      },
      {
        'id': 'cab-1',
        'subjectType': 'CAB',
        'subjectName': 'Cab driver',
        'status': 'PENDING',
        'metadata': {'provider': 'Ola', 'vehicleNumber': 'KA02CD5678'},
      },
    ];

    await tester.pumpWidget(MaterialApp(home: Scaffold(body: GateScreen(controller: controller))));

    expect(find.text('Delivery partner'), findsOneWidget);
    expect(find.text('Amazon · KA01AB1234'), findsOneWidget);
    expect(find.text('Allow for the next 30 minutes'), findsOneWidget);
    expect(find.text('Cab driver'), findsOneWidget);
    expect(find.text('Ola · KA02CD5678'), findsOneWidget);
    expect(find.text('Allow for the next 15 minutes'), findsOneWidget);
    expect(find.text('Allow entry'), findsNWidgets(2));

    controller.dispose();
  });
}
