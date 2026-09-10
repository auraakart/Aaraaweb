import 'package:aaraagate_resident/data/demo_resident_repository.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/screens/workforce_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

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
}
