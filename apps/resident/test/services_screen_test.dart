import 'package:aaraagate_resident/data/demo_resident_repository.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/screens/services_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Widget host(ResidentDataController controller) => MaterialApp(
        home: Scaffold(body: ServicesScreen(controller: controller)),
      );

  testWidgets('marketplace groups same service and lets resident compare providers', (tester) async {
    final controller = ResidentDataController(DemoResidentRepository())
      ..serviceCategories = [
        {'id': 'cat-ac', 'name': 'Home maintenance'},
        {'id': 'cat-electric', 'name': 'Electrical'},
      ]
      ..serviceOfferings = [
        {
          'id': 'off-ac-1',
          'categoryId': 'cat-ac',
          'name': 'AC service',
          'description': 'General inspection and cleaning',
          'pricePaise': 69900,
          'durationMinutes': 60,
          'provider': {'businessName': 'CoolCare Services', 'description': 'AC specialists for residential communities'},
          'category': {'name': 'Home maintenance'},
        },
        {
          'id': 'off-ac-2',
          'categoryId': 'cat-ac',
          'name': 'AC service',
          'description': 'Inspection, jet wash and cooling check',
          'pricePaise': 79900,
          'durationMinutes': 75,
          'provider': {'businessName': 'AirPro Home Care', 'description': 'Multi-brand AC technicians'},
          'category': {'name': 'Home maintenance'},
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

    expect(find.text('AC service'), findsOneWidget);
    expect(find.text('2 verified providers'), findsOneWidget);
    expect(find.text('From ₹699'), findsOneWidget);
    expect(find.text('CoolCare Services'), findsNothing);
    expect(find.text('AirPro Home Care'), findsNothing);

    await tester.tap(find.text('AC service'));
    await tester.pumpAndSettle();

    expect(find.text('Choose a provider'), findsOneWidget);
    expect(find.text('CoolCare Services'), findsOneWidget);
    expect(find.text('AirPro Home Care'), findsOneWidget);
    expect(find.text('₹699'), findsOneWidget);
    expect(find.text('₹799'), findsOneWidget);
    expect(find.text('Society approved'), findsNWidgets(2));
  });

  testWidgets('marketplace filters grouped services by category and provider search', (tester) async {
    final controller = ResidentDataController(DemoResidentRepository())
      ..serviceCategories = [
        {'id': 'cat-clean', 'name': 'Cleaning'},
        {'id': 'cat-electric', 'name': 'Electrical'},
      ]
      ..serviceOfferings = [
        {
          'id': 'off-clean-1',
          'categoryId': 'cat-clean',
          'name': 'Deep cleaning',
          'description': 'Full home cleaning',
          'pricePaise': 149900,
          'provider': {'businessName': 'Sparkle Homes'},
          'category': {'name': 'Cleaning'},
        },
        {
          'id': 'off-clean-2',
          'categoryId': 'cat-clean',
          'name': 'Deep cleaning',
          'description': 'Premium deep cleaning',
          'pricePaise': 169900,
          'provider': {'businessName': 'CleanNest'},
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
