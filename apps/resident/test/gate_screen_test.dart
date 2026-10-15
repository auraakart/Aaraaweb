import 'dart:async';
import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/data/demo_resident_repository.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/data/resident_repository.dart';
import 'package:aaraagate_resident/screens/gate_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _InviteRepository extends DemoResidentRepository {
  Map<String, dynamic>? invite;
  int cancelCalls = 0;
  final _requests = <Map<String, dynamic>>[];

  @override
  Future<List<Map<String, dynamic>>> accessRequests() async => List.unmodifiable(_requests);

  @override
  Future<Map<String, dynamic>> inviteVisitor({
    required String unitId,
    required String name,
    required DateTime validFrom,
    required DateTime validUntil,
    required String idempotencyKey,
    String? phone,
    String? purpose,
  }) async {
    invite = {'unitId': unitId, 'name': name, 'phone': phone, 'purpose': purpose, 'idempotencyKey': idempotencyKey, 'validFrom': validFrom, 'validUntil': validUntil};
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

  @override
  Future<void> cancelAccess(String requestId) async {
    cancelCalls++;
    _requests.firstWhere((item) => item['id'] == requestId)['status'] = 'CANCELLED';
  }
}

class _RetryInviteRepository extends _InviteRepository {
  int calls = 0;
  final keys = <String>[];
  final from = <DateTime>[];
  final until = <DateTime>[];

  @override
  Future<Map<String, dynamic>> inviteVisitor({
    required String unitId,
    required String name,
    required DateTime validFrom,
    required DateTime validUntil,
    required String idempotencyKey,
    String? phone,
    String? purpose,
  }) async {
    calls++;
    keys.add(idempotencyKey);
    from.add(validFrom);
    until.add(validUntil);
    if (calls == 1) throw StateError('uncertain transport failure');
    return super.inviteVisitor(
      unitId: unitId,
      name: name,
      validFrom: validFrom,
      validUntil: validUntil,
      idempotencyKey: idempotencyKey,
      phone: phone,
      purpose: purpose,
    );
  }
}

class _GateMutationRepository extends DemoResidentRepository {
  final Completer<void> denyCompleter = Completer<void>();
  int denyCalls = 0;
  bool failAsStale = false;
  final List<Map<String, dynamic>> requests = [
    {
      'id': 'delivery-1',
      'unitId': 'unit-1',
      'subjectType': 'DELIVERY',
      'subjectName': 'Delivery partner',
      'status': 'PENDING',
    },
  ];

  @override
  Future<List<Map<String, dynamic>>> accessRequests() async =>
      requests.map((item) => Map<String, dynamic>.from(item)).toList(growable: false);

  @override
  Future<void> denyAccess(String requestId) async {
    denyCalls++;
    if (failAsStale) {
      requests.first['status'] = 'APPROVED';
      throw StateError('Access request changed before denial could complete');
    }
    await denyCompleter.future;
  }
}

void main() {
  test('visitor invite retry reuses the same idempotency identity and validity window', () async {
    final repository = _RetryInviteRepository();
    final controller = ResidentDataController(
      repository,
      activeUnitId: 'unit-1',
      initialEnabledFeatures: {'VISITOR_MANAGEMENT'},
      fetchEntitlements: false,
    )..households = [
        {'id': 'house-1', 'unitId': 'unit-1'},
      ];

    await expectLater(
      controller.createGuest(name: 'Priya Shah', phone: '9999999999', purpose: 'Dinner'),
      throwsA(isA<StateError>()),
    );
    final recovered = await controller.createGuest(name: 'Priya Shah', phone: '9999999999', purpose: 'Dinner');

    expect(repository.calls, 2);
    expect(repository.keys[1], repository.keys[0]);
    expect(repository.from[1], repository.from[0]);
    expect(repository.until[1], repository.until[0]);
    expect(recovered['credential'], 'TEST-PASS');
    controller.dispose();
  });

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

  testWidgets('localized gate actions remain usable with large accessibility text', (tester) async {
    tester.view.physicalSize = const Size(360, 640);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.localeTestValue = const Locale('ta', 'IN');
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.platformDispatcher.clearLocaleTestValue);

    final controller = ResidentDataController(
      ResidentRepository(ApiClient(baseUrl: 'http://127.0.0.1:3000', accessToken: 'test-token')),
    );
    controller.accessRequests = [
      {
        'id': 'delivery-1',
        'subjectType': 'DELIVERY',
        'subjectName': 'Delivery partner',
        'status': 'PENDING',
      },
    ];

    await tester.pumpWidget(
      MaterialApp(
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(textScaler: const TextScaler.linear(3.0)),
          child: child!,
        ),
        home: Scaffold(body: GateScreen(controller: controller)),
      ),
    );
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(
      find.text('Delivery partner'),
      180,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();

    expect(find.text('மறுக்கவும்'), findsOneWidget);
    expect(find.text('நுழைய அனுமதி'), findsOneWidget);
    expect(tester.takeException(), isNull);

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

    expect(repository.invite, containsPair('unitId', 'unit-1'));
    expect(repository.invite, containsPair('name', 'Priya Shah'));
    expect(repository.invite, containsPair('phone', '9999999999'));
    expect(repository.invite, containsPair('purpose', 'Dinner'));
    expect(repository.invite?['idempotencyKey']?.toString(), startsWith('resident-visitor-'));
    expect(find.text('Visitor pass ready'), findsOneWidget);
    expect(tester.takeException(), isNull);

    await tester.pumpWidget(const MaterialApp(home: SizedBox.shrink()));
    await tester.pumpAndSettle();
    controller.dispose();
  });

  testWidgets('serializes a gate decision while the first mutation is in flight', (tester) async {
    final repository = _GateMutationRepository();
    final controller = ResidentDataController(
      repository,
      activeUnitId: 'unit-1',
      initialEnabledFeatures: {'DELIVERY_MANAGEMENT'},
      fetchEntitlements: false,
    )..accessRequests = await repository.accessRequests();

    await tester.pumpWidget(MaterialApp(home: Scaffold(body: GateScreen(controller: controller))));
    await tester.tap(find.text('Deny'));
    await tester.pump();

    expect(repository.denyCalls, 1);
    final denyButton = tester.widget<OutlinedButton>(
      find.widgetWithText(OutlinedButton, 'Deny'),
    );
    expect(denyButton.onPressed, isNull);

    await tester.tap(find.text('Deny'));
    await tester.pump();
    expect(repository.denyCalls, 1);

    repository.denyCompleter.complete();
    await tester.pumpAndSettle();
    controller.dispose();
  });

  test('failed gate mutation reloads authoritative request state before rethrowing', () async {
    final repository = _GateMutationRepository()..failAsStale = true;
    final controller = ResidentDataController(
      repository,
      activeUnitId: 'unit-1',
      initialEnabledFeatures: {'DELIVERY_MANAGEMENT'},
      fetchEntitlements: false,
    )..accessRequests = await repository.accessRequests();

    await expectLater(controller.denyAccess('delivery-1'), throwsA(isA<StateError>()));

    expect(repository.denyCalls, 1);
    expect(controller.accessRequests.single['status'], 'APPROVED');
    controller.dispose();
  });


  testWidgets('stale gate decision surfaces the refreshed authoritative status', (tester) async {
    final repository = _GateMutationRepository()..failAsStale = true;
    final controller = ResidentDataController(
      repository,
      activeUnitId: 'unit-1',
      initialEnabledFeatures: {'DELIVERY_MANAGEMENT'},
      fetchEntitlements: false,
    )..accessRequests = await repository.accessRequests();

    await tester.pumpWidget(MaterialApp(home: Scaffold(body: GateScreen(controller: controller))));
    await tester.tap(find.text('Deny'));
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.text('This gate request changed. Latest status: Approved.'), findsOneWidget);
    expect(controller.accessRequests.single['status'], 'APPROVED');

    controller.dispose();
  });


  testWidgets('approved visitor pass requires review before cancellation', (tester) async {
    final repository = _InviteRepository();
    await repository.inviteVisitor(
      unitId: 'unit-1',
      name: 'Priya Shah',
      validFrom: DateTime(2026, 9, 27, 10),
      validUntil: DateTime(2026, 9, 27, 14),
      idempotencyKey: 'cancel-pass-test',
    );
    final controller = ResidentDataController(
      repository,
      activeUnitId: 'unit-1',
      initialEnabledFeatures: {'VISITOR_MANAGEMENT'},
      fetchEntitlements: false,
    )..accessRequests = await repository.accessRequests();

    await tester.pumpWidget(MaterialApp(home: Scaffold(body: GateScreen(controller: controller))));

    expect(find.textContaining('Valid until'), findsOneWidget);
    await tester.tap(find.text('Cancel pass'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(repository.cancelCalls, 0);
    expect(find.text('This stops the visitor pass immediately. Security will no longer accept it.'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Cancel pass'), findsOneWidget);

    await tester.tap(find.widgetWithText(FilledButton, 'Cancel pass'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    expect(repository.cancelCalls, 1);
    expect(controller.accessRequests.single['status'], 'CANCELLED');
    controller.dispose();
  });

}
