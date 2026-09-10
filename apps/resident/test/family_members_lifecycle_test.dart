import 'package:aaraagate_resident/data/demo_resident_repository.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/screens/family_members_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('demo family add stays pending after screen recreation without lifecycle errors', (tester) async {
    final controller = ResidentDataController(
      DemoResidentRepository(),
      activeUnitId: 'demo-unit-1',
      initialEnabledFeatures: const {'VISITOR_MANAGEMENT'},
      fetchEntitlements: false,
    );
    addTearDown(controller.dispose);

    Widget screen() => MaterialApp(
          home: FamilyMembersScreen(
            controller: controller,
            householdId: 'demo-household-1',
            canManage: true,
          ),
        );

    await tester.pumpWidget(screen());
    await tester.tap(find.text('Add member'));
    await tester.pumpAndSettle();
    expect(find.text('Add family member'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextField, 'Name'), 'Kavya Sharma');
    await tester.enterText(find.widgetWithText(TextField, 'Mobile number'), '+91 98765 49999');
    await tester.tap(find.widgetWithText(FilledButton, 'Send for approval'));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('Add family member'), findsNothing);
    expect(find.text('Kavya Sharma'), findsOneWidget);
    expect(find.text('Addition pending admin approval'), findsOneWidget);
    expect(find.text('+91 98765 49999'), findsNothing);

    // Recreate the route to model navigating away and coming back. Demo state
    // must remain in the shared session store instead of the screen State.
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
    await tester.pumpWidget(screen());
    await tester.pumpAndSettle();

    expect(find.text('Kavya Sharma'), findsOneWidget);
    expect(find.text('Addition pending admin approval'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
