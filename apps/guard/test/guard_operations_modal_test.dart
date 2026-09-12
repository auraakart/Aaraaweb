import 'package:aaraagate_guard/data/guard_api.dart';
import 'package:aaraagate_guard/data/guard_session_store.dart';
import 'package:aaraagate_guard/data/offline_action_queue.dart';
import 'package:aaraagate_guard/guard_controller.dart';
import 'package:aaraagate_guard/screens/guard_operations_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _ArrivalApi extends GuardApi {
  _ArrivalApi() : super(baseUrl: 'http://test');

  Map<String, dynamic>? walkIn;
  Map<String, dynamic>? arrival;

  @override
  Future<Map<String, dynamic>> createWalkIn({
    required String gateId,
    required String unitId,
    required String name,
    String? phone,
    String? purpose,
  }) async {
    walkIn = {'gateId': gateId, 'unitId': unitId, 'name': name, 'phone': phone, 'purpose': purpose};
    return {'id': 'walk-in-1', 'status': 'PENDING'};
  }

  @override
  Future<Map<String, dynamic>> createGateArrival({
    required String gateId,
    required String unitId,
    required String subjectType,
    required String name,
    String? provider,
    String? phone,
    String? vehicleNumber,
    String? note,
  }) async {
    arrival = {
      'gateId': gateId,
      'unitId': unitId,
      'subjectType': subjectType,
      'name': name,
      'provider': provider,
      'phone': phone,
      'vehicleNumber': vehicleNumber,
    };
    return {'id': 'arrival-1', 'status': 'PENDING'};
  }
}

void main() {
  late _ArrivalApi api;
  late GuardController controller;

  setUp(() {
    api = _ArrivalApi();
    controller = GuardController(
      api: api,
      sessions: const GuardSessionStore(),
      offlineQueue: const OfflineActionQueue(),
    )
      ..booting = false
      ..gateId = 'gate-1'
      ..gates = [
        {'id': 'gate-1', 'name': 'Main gate'},
      ]
      ..units = [
        {
          'id': 'unit-1',
          'number': 'A-101',
          'building': {'name': 'Tower A'},
        },
      ];
  });

  tearDown(() => controller.dispose());

  testWidgets('walk-in sheet submits input and disposes cleanly', (tester) async {
    await tester.pumpWidget(MaterialApp(home: GuardOperationsScreen(controller: controller)));
    await tester.scrollUntilVisible(find.text('WALK-IN VISITOR'), 300);
    await tester.tap(find.text('WALK-IN VISITOR'));
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextField, 'Visitor name'), 'Ravi Kumar');
    await tester.enterText(find.widgetWithText(TextField, 'Phone'), '8888888888');
    await tester.enterText(find.widgetWithText(TextField, 'Purpose'), 'Meeting');
    await tester.tap(find.text('Send for approval'));
    await tester.pumpAndSettle();

    expect(api.walkIn, {
      'gateId': 'gate-1',
      'unitId': 'unit-1',
      'name': 'Ravi Kumar',
      'phone': '8888888888',
      'purpose': 'Meeting',
    });
    expect(tester.takeException(), isNull);
  });

  testWidgets('delivery submits and cab cancellation tear down route-owned controllers safely', (tester) async {
    await tester.pumpWidget(MaterialApp(home: GuardOperationsScreen(controller: controller)));
    await tester.scrollUntilVisible(find.text('DELIVERY'), 300);
    await tester.tap(find.text('DELIVERY'));
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextField, 'Provider (Swiggy/Zomato/Amazon)'), 'Amazon');
    await tester.enterText(find.widgetWithText(TextField, 'Delivery person'), 'Delivery partner');
    await tester.tap(find.text('ASK RESIDENT'));
    await tester.pumpAndSettle();

    expect(api.arrival?['subjectType'], 'DELIVERY');
    expect(api.arrival?['provider'], 'Amazon');
    expect(tester.takeException(), isNull);

    controller.walkInAccess = null;
    await tester.scrollUntilVisible(find.text('CAB'), 300);
    await tester.tap(find.text('CAB'));
    await tester.pumpAndSettle();
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
  });
}
