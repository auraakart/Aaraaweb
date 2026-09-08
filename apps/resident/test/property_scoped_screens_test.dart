import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/data/resident_repository.dart';
import 'package:aaraagate_resident/screens/billing_screen.dart';
import 'package:aaraagate_resident/screens/helpdesk_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _PropertyScopedRepository extends ResidentRepository {
  _PropertyScopedRepository()
      : super(ApiClient(baseUrl: 'http://127.0.0.1:3000', accessToken: 'test'));

  @override
  Future<List<Map<String, dynamic>>> maintenanceInvoices() async => [
        {
          'id': 'invoice-a',
          'unitId': 'unit-a',
          'invoiceNumber': 'A-001',
          'billingPeriod': '2026-09',
          'amountPaise': 100000,
          'dueDate': '2026-09-30',
          'status': 'ISSUED',
          'buildingName': 'A Block',
          'unitNumber': '101',
        },
        {
          'id': 'invoice-b',
          'unitId': 'unit-b',
          'invoiceNumber': 'B-001',
          'billingPeriod': '2026-09',
          'amountPaise': 200000,
          'dueDate': '2026-09-30',
          'status': 'ISSUED',
          'buildingName': 'B Block',
          'unitNumber': '202',
        },
      ];

  @override
  Future<List<Map<String, dynamic>>> maintenancePayments() async => [
        {
          'id': 'payment-a',
          'invoiceId': 'invoice-a',
          'invoiceNumber': 'A-001',
          'amountPaise': 100000,
          'status': 'CAPTURED',
          'buildingName': 'A Block',
          'unitNumber': '101',
        },
        {
          'id': 'payment-b',
          'invoiceId': 'invoice-b',
          'invoiceNumber': 'B-001',
          'amountPaise': 200000,
          'status': 'CAPTURED',
          'buildingName': 'B Block',
          'unitNumber': '202',
        },
      ];

  @override
  Future<List<Map<String, dynamic>>> helpdeskTickets() async => [
        {
          'id': 'ticket-a',
          'unitId': 'unit-a',
          'title': 'Lift issue - A',
          'description': 'A unit issue',
          'status': 'OPEN',
          'priority': 'NORMAL',
        },
        {
          'id': 'ticket-b',
          'unitId': 'unit-b',
          'title': 'Lift issue - B',
          'description': 'B unit issue',
          'status': 'OPEN',
          'priority': 'NORMAL',
        },
      ];
}

void main() {
  testWidgets('billing shows invoices and payments only for active unit', (tester) async {
    final repository = _PropertyScopedRepository();

    await tester.pumpWidget(MaterialApp(
      home: BillingScreen(repository: repository, activeUnitId: 'unit-a'),
    ));
    await tester.pumpAndSettle();

    expect(find.text('A Block · 101'), findsOneWidget);
    expect(find.text('₹1000.00'), findsNWidgets(3));
    expect(find.text('B Block · 202'), findsNothing);
    expect(find.text('₹2000.00'), findsNothing);
  });

  testWidgets('helpdesk lists tickets only for active unit', (tester) async {
    final repository = _PropertyScopedRepository();
    final controller = ResidentDataController(repository, activeUnitId: 'unit-a');
    controller.households = [
      {'id': 'house-a', 'unitId': 'unit-a'},
    ];

    await tester.pumpWidget(MaterialApp(home: HelpdeskScreen(controller: controller)));
    await tester.pumpAndSettle();

    expect(find.text('Lift issue - A'), findsOneWidget);
    expect(find.text('Lift issue - B'), findsNothing);

    controller.dispose();
  });
}
