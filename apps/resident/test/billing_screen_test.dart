import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/data/resident_repository.dart';
import 'package:aaraagate_resident/screens/billing_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _BillingRepository extends ResidentRepository {
  _BillingRepository({this.denied = false}) : super(ApiClient(baseUrl: 'http://127.0.0.1:3000', accessToken: 'test'));
  final bool denied;
  int paymentCalls = 0;
  int receiptCalls = 0;

  @override
  Future<List<Map<String, dynamic>>> maintenanceInvoices() async {
    if (denied) throw ApiException(403, 'Forbidden');
    return [
      {
        'id': 'invoice-1', 'invoiceNumber': '202609-A101', 'billingPeriod': '2026-09',
        'amountPaise': 125000, 'dueDate': '2026-09-30', 'status': 'ISSUED',
        'buildingName': 'A Block', 'unitNumber': '101',
      },
    ];
  }

  @override
  Future<Map<String, dynamic>> createMaintenancePayment({required String invoiceId, required String idempotencyKey}) async {
    paymentCalls++;
    return {'id': 'payment-1', 'providerOrderId': 'aaraagate_order_1', 'status': 'CREATED'};
  }

  @override
  Future<List<Map<String, dynamic>>> maintenancePayments() async {
    if (denied) throw ApiException(403, 'Forbidden');
    return [];
  }

  @override
  Future<Map<String, dynamic>> maintenanceReceipt(String paymentId) async {
    receiptCalls++;
    return {'receiptNumber': 'AGR-12345678', 'societyName': 'Aaraagate Heights', 'buildingName': 'A Block', 'unitNumber': '101', 'invoiceNumber': '202609-A101', 'amountPaise': 125000, 'status': 'CAPTURED'};
  }
}

void main() {
  testWidgets('owner can review dues and prepare a secure payment order', (tester) async {
    final repository = _BillingRepository();
    await tester.pumpWidget(MaterialApp(home: BillingScreen(repository: repository)));
    await tester.pumpAndSettle();

    expect(find.text('₹1250.00'), findsNWidgets(2));
    expect(find.text('Pay securely'), findsOneWidget);
    await tester.tap(find.text('Pay securely'));
    await tester.pumpAndSettle();

    expect(repository.paymentCalls, 1);
    expect(find.text('Secure payment order ready'), findsOneWidget);
    expect(find.textContaining('No payment is marked successful'), findsOneWidget);
  });

  testWidgets('tenant financial access fails closed with a clear message', (tester) async {
    await tester.pumpWidget(MaterialApp(home: BillingScreen(repository: _BillingRepository(denied: true))));
    await tester.pumpAndSettle();
    expect(find.text('Maintenance billing is available only to verified owners.'), findsOneWidget);
    expect(find.text('Pay securely'), findsNothing);
  });

  testWidgets('owner opens a server-verified receipt from payment history', (tester) async {
    final repository = _BillingRepositoryWithPayment();
    await tester.pumpWidget(MaterialApp(home: BillingScreen(repository: repository)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Receipt'));
    await tester.pumpAndSettle();
    expect(repository.receiptCalls, 1);
    expect(find.text('Receipt AGR-12345678'), findsOneWidget);
    expect(find.textContaining('Aaraagate Heights'), findsOneWidget);
  });
}

class _BillingRepositoryWithPayment extends _BillingRepository {
  @override
  Future<List<Map<String, dynamic>>> maintenancePayments() async => [
    {'id': 'payment-1', 'invoiceNumber': '202609-A101', 'amountPaise': 125000, 'status': 'CAPTURED', 'buildingName': 'A Block', 'unitNumber': '101'},
  ];
}
