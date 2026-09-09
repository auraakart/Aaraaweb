import 'package:aaraagate_resident/data/demo_resident_repository.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/screens/family_members_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('adding a demo family member closes the dialog without framework lifecycle errors', (tester) async {
    final controller = ResidentDataController(
      DemoResidentRepository(),
      activeUnitId: 'demo-unit-1',
      initialEnabledFeatures: const {'VISITOR_MANAGEMENT'},
      fetchEntitlements: false,
    );
    addTearDown(controller.dispose);

    await tester.pumpWidget(MaterialApp(
      home: FamilyMembersScreen(
        controller: controller,
        householdId: 'demo-household-1',
        canManage: true,
      ),
    ));

    await tester.tap(find.text('Add member'));
    await tester.pumpAndSettle();
    expect(find.text('Add family member'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextField, 'Name'), 'Kavya Sharma');
    await tester.enterText(find.widgetWithText(TextField, 'Mobile number'), '+91 98765 49999');
    await tester.tap(find.widgetWithText(FilledButton, 'Add member'));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('Add family member'), findsNothing);

    await tester.scrollUntilVisible(
      find.text('Kavya Sharma'),
      180,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Kavya Sharma'), findsOneWidget);
    expect(find.text('+91 98765 49999'), findsOneWidget);
  });
}