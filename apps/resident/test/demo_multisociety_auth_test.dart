import 'package:aaraagate_resident/auth/auth_repository.dart';
import 'package:aaraagate_resident/auth/auth_screen.dart';
import 'package:aaraagate_resident/auth/resident_auth_controller.dart';
import 'package:aaraagate_resident/auth/session_store.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('demo login immediately shows all society/property contexts', (tester) async {
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
    expect(controller.propertyContextCount, 3);
    expect(find.text('My Properties'), findsOneWidget);
    expect(find.textContaining('Lakeview Residency · Tower A A-1204'), findsOneWidget);
    expect(find.textContaining('Lakeview Residency · Tower B B-305'), findsOneWidget);
    expect(find.textContaining('Palm Grove Apartments · Cedar Block C-804'), findsOneWidget);
    expect(find.textContaining('owner'), findsWidgets);
    expect(find.textContaining('occupant'), findsOneWidget);
  });
}