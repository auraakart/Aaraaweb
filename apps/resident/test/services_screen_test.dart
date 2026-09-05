import 'package:aaraagate_resident/data/demo_resident_repository.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/screens/services_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Widget host(ResidentDataController controller) => MaterialApp(
        home: Scaffold(body: ServicesScreen(controller: controller)),
      );

  testWidgets('marketplace filters offerings by category and search', (tester) async {
    final controller = ResidentDataController(DemoResidentRepository())
      ..serviceCategories = [
        {'id': 'cat-clean', 'name': 'Cleaning'},
        {'id': 'cat-electric', 'name': 'Electrical'},
      ]
      ..serviceOfferings = [
        {
          'id': 'off-clean',
          'categoryId': 'cat-clean',
          'name': 'Deep cleaning',
          'description': 'Full home cleaning',
          'pricePaise': 149900,
          'provider': {'businessName': 'Sparkle Homes'},
          'category': {'name': 'Cleaning'},
        },
        {
          'id': 'off-electric',
          'categoryId': 'cat-electric',
          'name': 'Electrician visit',
          'description': 'Switch and fan repair',
          'pricePaise': 29900,
          'provider': {'businessName': 'SafeWire Services'},
          'category': {'name': 'Electrical'},
        },
      ];

    await tester.pumpWidget(host(controller));

    expect(find.text('Deep cleaning'), findsOneWidget);
    expect(find.text('Electrician visit'), findsOneWidget);
    expect(find.text('Sparkle Homes'), findsOneWidget);

    await tester.tap(find.text('Electrical'));
    await tester.pump();
    expect(find.text('Deep cleaning'), findsNothing);
    expect(find.text('Electrician visit'), findsOneWidget);

    await tester.tap(find.text('All'));
    await tester.enterText(find.byType(TextField).first, 'sparkle');
    await tester.pump();
    expect(find.text('Deep cleaning'), findsOneWidget);
    expect(find.text('Electrician visit'), findsNothing);
  });

  testWidgets('marketplace explains resident booking lifecycle', (tester) async {
    final controller = ResidentDataController(DemoResidentRepository())
      ..bookings = [
        {
          'id': 'booking-requested',
          'status': 'REQUESTED',
          'scheduledFrom': '2026-09-06T10:00:00Z',
          'offering': {'name': 'AC service'},
          'provider': {'businessName': 'CoolCare'},
        },
        {
          'id': 'booking-confirmed',
          'status': 'CONFIRMED',
          'scheduledFrom': '2026-09-07T10:00:00Z',
          'offering': {'name': 'Plumber visit'},
          'provider': {'businessName': 'FixRight'},
          'accessRequest': {'status': 'APPROVED'},
        },
      ];

    await tester.pumpWidget(host(controller));

    expect(find.text('Waiting for the provider to confirm this request. No gate pass has been created yet.'), findsOneWidget);
    expect(find.text('CoolCare'), findsOneWidget);

    await tester.drag(find.byType(Scrollable).first, const Offset(0, -500));
    await tester.pumpAndSettle();

    expect(find.text('Provider confirmed. Linked gate access: APPROVED.'), findsOneWidget);
    expect(find.text('FixRight'), findsOneWidget);
  });
}
