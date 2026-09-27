import 'package:aaraagate_resident/data/demo_resident_repository.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/screens/workforce_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _WorkforceRecoveryRepository extends DemoResidentRepository {
  bool leaveCancelled = false;
  bool assignmentEnded = false;
  int workforceReads = 0;

  @override
  Future<List<Map<String, dynamic>>> workforce() async {
    workforceReads++;
    return [
      {
        'id': 'assignment-recovery',
        'active': !assignmentEnded,
        'status': assignmentEnded ? 'SUSPENDED' : 'APPROVED',
        'household': {
          'unitId': 'demo-unit-1',
          'unit': {
            'number': 'A-1204',
            'building': {'name': 'Maple Tower'},
          },
        },
        'worker': {
          'name': 'Lakshmi R.',
          'phone': '+919800000001',
          'role': 'MAID',
          'verification': 'VERIFIED',
        },
      },
    ];
  }

  @override
  Future<List<Map<String, dynamic>>> workforceLeaves() async => leaveCancelled
      ? const []
      : [
          {
            'id': 'leave-recovery',
            'assignmentId': 'assignment-recovery',
            'active': true,
            'startsOn': '2026-09-28',
            'endsOn': '2026-09-29',
            'reason': 'Family visit',
          },
        ];

  @override
  Future<List<Map<String, dynamic>>> workforceRatings() async => const [];

  @override
  Future<Map<String, dynamic>> cancelWorkforceLeave(String leaveId) async {
    leaveCancelled = true;
    throw StateError('transport failed after server commit');
  }

  @override
  Future<Map<String, dynamic>> deactivateWorkforce(String assignmentId) async {
    assignmentEnded = true;
    throw StateError('transport failed after server commit');
  }
}

void main() {
  testWidgets('add workforce sheet owns text controllers through route teardown', (tester) async {
    final controller = ResidentDataController(
      DemoResidentRepository(),
      activeUnitId: 'demo-unit-1',
      initialEnabledFeatures: const {'DOMESTIC_HELP'},
      fetchEntitlements: false,
    );
    addTearDown(controller.dispose);
    controller.households = [
      {
        'id': 'demo-household-1',
        'unit': {'number': 'A-101'},
      },
    ];

    await tester.pumpWidget(MaterialApp(home: WorkforceScreen(controller: controller)));
    await tester.tap(find.byTooltip('Add household staff'));
    await tester.pumpAndSettle();

    expect(find.text('Add household staff'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Full name'), 'Lifecycle Test');
    await tester.enterText(find.widgetWithText(TextField, 'Mobile number'), '+91 99999 99999');

    // A modal bottom sheet has no visible app-bar back button. Exercise the
    // route-pop path used by Android system back instead.
    expect(await tester.binding.handlePopRoute(), isTrue);
    await tester.pumpAndSettle();

    expect(find.text('Add household staff'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('staff header remains usable with large accessibility text', (tester) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final controller = ResidentDataController(
      DemoResidentRepository(),
      activeUnitId: 'demo-unit-1',
      initialEnabledFeatures: const {'DOMESTIC_HELP'},
      fetchEntitlements: false,
    );
    addTearDown(controller.dispose);
    controller.households = [
      {
        'id': 'demo-household-1',
        'unit': {'number': 'A-101'},
      },
    ];

    await tester.pumpWidget(
      MaterialApp(
        home: MediaQuery(
          data: const MediaQueryData(textScaler: TextScaler.linear(3.0)),
          child: WorkforceScreen(controller: controller),
        ),
      ),
    );
    await tester.pump();

    final title = tester.widget<Text>(find.text('Household staff'));
    final supporting = tester.widget<Text>(find.text('Attendance, leave and ratings in one place.'));
    expect(title.maxLines, 2);
    expect(title.overflow, TextOverflow.ellipsis);
    expect(supporting.maxLines, 2);
    expect(find.byTooltip('Add household staff'), findsOneWidget);
    expect(find.byTooltip('Refresh staff'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });


  testWidgets('staff card shows identity and unambiguous workflow statuses', (tester) async {
    final controller = ResidentDataController(
      DemoResidentRepository(),
      activeUnitId: 'demo-unit-1',
      initialEnabledFeatures: const {'DOMESTIC_HELP'},
      fetchEntitlements: false,
    );
    addTearDown(controller.dispose);
    controller.workforceAssignments = [
      {
        'id': 'assignment-1',
        'status': 'PENDING',
        'household': {
          'unitId': 'demo-unit-1',
          'unit': {
            'number': 'A-1204',
            'building': {'name': 'Maple Tower'},
          },
        },
        'worker': {
          'name': 'Lakshmi R.',
          'phone': '+919800000001',
          'role': 'MAID',
          'verification': 'VERIFIED',
        },
      },
    ];

    await tester.pumpWidget(MaterialApp(home: WorkforceScreen(controller: controller)));
    await tester.pump();

    expect(find.text('Lakshmi R.'), findsOneWidget);
    expect(find.text('Maid'), findsOneWidget);
    expect(find.text('+919800000001'), findsOneWidget);
    expect(find.text('Assignment: Pending'), findsOneWidget);
    expect(find.text('Verification: Verified'), findsOneWidget);
    expect(find.text('Gate access: Awaiting assignment approval'), findsOneWidget);
    expect(find.text('Household staff'), findsOneWidget);
    expect(find.text('Other'), findsNothing);
    expect(tester.takeException(), isNull);
  });


  test('demo workforce mirrors production assignment shape', () async {
    final rows = await DemoResidentRepository().workforce();
    expect(rows, isNotEmpty);
    final first = rows.first;
    expect(first['status'], isNotNull);
    expect(first['worker'], isA<Map>());
    final worker = Map<String, dynamic>.from(first['worker'] as Map);
    expect(worker['name'], isNotNull);
    expect(worker['role'], isNotNull);
    expect(worker['verification'], isNotNull);
    final household = Map<String, dynamic>.from(first['household'] as Map);
    expect(household['unitId'], 'demo-unit-1');
    expect(household['unit'], isA<Map>());
  });

  test('failed leave cancellation reloads authoritative workforce state before rethrowing', () async {
    final repository = _WorkforceRecoveryRepository();
    final controller = ResidentDataController(
      repository,
      activeUnitId: 'demo-unit-1',
      initialEnabledFeatures: const {'DOMESTIC_HELP'},
      fetchEntitlements: false,
    );
    addTearDown(controller.dispose);

    await controller.load();
    expect(controller.isWorkforceLeaveActive('leave-recovery'), isTrue);

    await expectLater(
      controller.cancelWorkforceLeave('leave-recovery'),
      throwsA(isA<StateError>()),
    );

    expect(controller.isWorkforceLeaveActive('leave-recovery'), isFalse);
    expect(repository.workforceReads, 2);
  });

  test('failed assignment deactivation reloads authoritative inactive state before rethrowing', () async {
    final repository = _WorkforceRecoveryRepository();
    final controller = ResidentDataController(
      repository,
      activeUnitId: 'demo-unit-1',
      initialEnabledFeatures: const {'DOMESTIC_HELP'},
      fetchEntitlements: false,
    );
    addTearDown(controller.dispose);

    await controller.load();
    expect(controller.workforceAssignmentFor('assignment-recovery')?['active'], isTrue);

    await expectLater(
      controller.deactivateWorkforce('assignment-recovery'),
      throwsA(isA<StateError>()),
    );

    expect(controller.workforceAssignmentFor('assignment-recovery')?['active'], isFalse);
    expect(controller.workforceAssignmentFor('assignment-recovery')?['status'], 'SUSPENDED');
    expect(repository.workforceReads, 2);
  });

  testWidgets('stale leave cancel action disappears after recovered server-side cancellation', (tester) async {
    final repository = _WorkforceRecoveryRepository();
    final controller = ResidentDataController(
      repository,
      activeUnitId: 'demo-unit-1',
      initialEnabledFeatures: const {'DOMESTIC_HELP'},
      fetchEntitlements: false,
    );
    await controller.load();

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ListenableBuilder(
            listenable: controller,
            builder: (_, __) => WorkforceScreen(controller: controller),
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.byTooltip('Cancel leave'), findsOneWidget);
    await tester.tap(find.byTooltip('Cancel leave'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('CANCEL LEAVE'));
    await tester.pumpAndSettle();

    expect(find.text('Leave changed. It is no longer active.'), findsOneWidget);
    expect(find.byTooltip('Cancel leave'), findsNothing);

    await tester.pumpWidget(const SizedBox.shrink());
    controller.dispose();
    await tester.pump();
  });

  testWidgets('stale end-assignment action disappears after recovered server-side deactivation', (tester) async {
    final repository = _WorkforceRecoveryRepository();
    final controller = ResidentDataController(
      repository,
      activeUnitId: 'demo-unit-1',
      initialEnabledFeatures: const {'DOMESTIC_HELP'},
      fetchEntitlements: false,
    );
    await controller.load();

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ListenableBuilder(
            listenable: controller,
            builder: (_, __) => WorkforceScreen(controller: controller),
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('END ASSIGNMENT'), findsOneWidget);
    await tester.tap(find.text('END ASSIGNMENT'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'END ASSIGNMENT'));
    await tester.pumpAndSettle();

    expect(find.text('Staff assignment changed and is no longer active.'), findsOneWidget);
    expect(find.text('END ASSIGNMENT'), findsNothing);
    expect(find.text('Assignment: Suspended'), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
    controller.dispose();
    await tester.pump();
  });

}
