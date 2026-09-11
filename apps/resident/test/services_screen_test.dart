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
        {'id': 'cat-ac', 'name': 'AC'},
      ]
      ..serviceOfferings = [
        {
          'id': 'offer-1',
          'categoryId': 'cat-ac',
          'name': 'AC service',
          'pricePaise': 69900,
          'description': 'AC maintenance',
          'provider': {'businessName': 'CoolCare', 'ratingAverage': 4.8, 'ratingCount': 120, 'completedJobs': 400},
        },
        {
          'id': 'offer-2',
          'categoryId': 'cat-ac',
          'name': 'AC service',
          'pricePaise': 59900,
          'description': 'AC maintenance',
          'provider': {'businessName': 'AirPro', 'ratingAverage': 4.6, 'ratingCount': 80, 'completedJobs': 250},
        },
      ];

    await tester.pumpWidget(host(controller));

    expect(find.text('AC service'), findsOneWidget);
    expect(find.text('2 verified providers'), findsOneWidget);
    expect(find.text('From ₹599'), findsOneWidget);

    await tester.tap(find.text('AC service'));
    await tester.pumpAndSettle();

    expect(find.text('Choose a provider'), findsOneWidget);
    expect(find.text('CoolCare'), findsOneWidget);
    expect(find.text('AirPro'), findsOneWidget);
    controller.dispose();
  });

  testWidgets('marketplace filters grouped services by category and provider search', (tester) async {
    final controller = ResidentDataController(DemoResidentRepository())
      ..serviceCategories = [
        {'id': 'cat-ac', 'name': 'AC'},
        {'id': 'cat-plumbing', 'name': 'Plumbing'},
      ]
      ..serviceOfferings = [
        {
          'id': 'offer-1',
          'categoryId': 'cat-ac',
          'name': 'AC service',
          'pricePaise': 69900,
          'provider': {'businessName': 'CoolCare'},
        },
        {
          'id': 'offer-2',
          'categoryId': 'cat-plumbing',
          'name': 'Plumber visit',
          'pricePaise': 49900,
          'provider': {'businessName': 'FixRight'},
        },
      ];

    await tester.pumpWidget(host(controller));

    await tester.tap(find.text('Plumbing'));
    await tester.pump();
    expect(find.text('Plumber visit'), findsOneWidget);
    expect(find.text('AC service'), findsNothing);

    await tester.tap(find.text('All'));
    await tester.enterText(find.byType(TextField).first, 'CoolCare');
    await tester.pump();
    expect(find.text('AC service'), findsOneWidget);
    expect(find.text('Plumber visit'), findsNothing);
    controller.dispose();
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

    final requestedMessage = find.text('Waiting for the provider to confirm this request. No gate pass has been created yet.');
    await tester.scrollUntilVisible(requestedMessage, 350, scrollable: find.byType(Scrollable).first);
    expect(requestedMessage, findsOneWidget);
    expect(find.text('CoolCare'), findsOneWidget);

    final confirmedMessage = find.text('Provider confirmed. Linked gate access: APPROVED.');
    await tester.scrollUntilVisible(confirmedMessage, 300, scrollable: find.byType(Scrollable).first);
    expect(confirmedMessage, findsOneWidget);
    expect(find.text('FixRight'), findsOneWidget);

    controller.dispose();
  });
}
