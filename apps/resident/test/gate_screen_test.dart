import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/data/demo_resident_repository.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/data/resident_repository.dart';
import 'package:aaraagate_resident/screens/gate_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _InviteRepository extends DemoResidentRepository {
  Map<String, dynamic>? invite;
  final _requests = <Map<String, dynamic>>[];

  @override
  Future<List<Map<String, dynamic>>> accessRequests() async => List.unmodifiable(_requests);

  @override
  Future<Map<String, dynamic>> inviteVisitor({
    required String unitId,
    required String name,
    required DateTime validFrom,
    required DateTime validUntil,
    String? phone,
    String? purpose,
  }) async {
    invite = {'unitId': unitId, 'name': name, 'phone': phone, 'purpose': purpose};
    final request = <String, dynamic>{
      'id': 'visitor-1',
      'unitId': unitId,
      'subjectType': 'VISITOR',
      'subjectName': name,
      'status': 'APPROVED',
      'validUntil': validUntil.toIso8601String(),
    };
    _requests.add(request);
    return {'request': request, 'credential': 'TEST-PASS'};
  }
}

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
    expect(find.textContaining('Amazon · KA01AB1234'), findsOneWidget);
    expect(find.text('Allow for the next 30 minutes'), findsOneWidget);
    expect(find.text('Cab driver'), findsOneWidget);
    expect(find.textContaining('Ola · KA02CD5678'), findsOneWidget);
    expect(find.text('Allow for the next 15 minutes'), findsOneWidget);
    expect(find.text('Allow entry'), findsNWidgets(2));

    controller.dispose();
  });

  testWidgets('guest invite stays usable on a compact screen and safely submits route-owned input', (tester) async {
    tester.view.physicalSize = const Size(360, 560);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final repository = _InviteRepository();
    final controller = ResidentDataController(
      repository,
      activeUnitId: 'unit-1',
      initialEnabledFeatures: {'VISITOR_MANAGEMENT'},
      fetchEntitlements: false,
    )..households = [
        {'unitId': 'unit-1'},
      ];

    await tester.pumpWidget(MaterialApp(home: Scaffold(body: GateScreen(controller: controller))));
    await tester.tap(find.byTooltip('Invite guest'));
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextFormField, 'Guest name'), 'Priya Shah');
    await tester.enterText(find.widgetWithText(TextFormField, 'Phone (optional)'), '9999999999');
    await tester.enterText(find.widgetWithText(TextFormField, 'Purpose (optional)'), 'Dinner');
    await tester.ensureVisible(find.text('Create visitor pass'));
    await tester.tap(find.text('Create visitor pass'));
    await tester.pumpAndSettle();

    expect(repository.invite, {'unitId': 'unit-1', 'name': 'Priya Shah', 'phone': '9999999999', 'purpose': 'Dinner'});
    expect(find.text('Visitor pass ready'), findsOneWidget);
    expect(tester.takeException(), isNull);

    await tester.pumpWidget(const MaterialApp(home: SizedBox.shrink()));
    await tester.pumpAndSettle();
    controller.dispose();
  });
}
