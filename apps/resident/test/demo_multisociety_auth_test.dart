import 'package:aaraagate_resident/auth/auth_repository.dart';
import 'package:aaraagate_resident/auth/auth_screen.dart';
import 'package:aaraagate_resident/auth/resident_auth_controller.dart';
import 'package:aaraagate_resident/auth/session_store.dart';
import 'package:aaraagate_resident/data/demo_resident_repository.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('demo login immediately shows usable contexts from multiple societies', (tester) async {
    final controller = ResidentAuthController(
      repository: AuthRepository(baseUrl: 'http://localhost'),
      sessionStore: SessionStore(),
      demoEnabled: true,
    );
    addTearDown(controller.dispose);
    controller.step = ResidentAuthStep.phone;

    await tester.pumpWidget(MaterialApp(home: AuthScreen(controller: controller)));
    final demoAction = find.text('Continue as Demo Resident');
    await tester.ensureVisible(demoAction);
    await tester.tap(demoAction);
    await tester.pumpAndSettle();

    expect(controller.step, ResidentAuthStep.society);
    expect(controller.memberships, hasLength(2));
    expect(controller.propertyContextCount, 2);
    expect(find.text('My Properties'), findsOneWidget);
    expect(find.textContaining('Lakeview Residency · Maple Tower A-1204'), findsOneWidget);
    expect(find.textContaining('Palm Grove Apartments · Cedar Tower B-804'), findsOneWidget);
    expect(find.textContaining('owner'), findsOneWidget);
    expect(find.textContaining('occupant'), findsOneWidget);

    final householdUnits = (await DemoResidentRepository().households())
        .map((household) => household['unitId']?.toString())
        .whereType<String>()
        .toSet();
    final selectableUnits = controller.memberships
        .expand((membership) => membership.properties)
        .map((property) => property.unitId);
    expect(selectableUnits, everyElement(isIn(householdUnits)));
  });
}