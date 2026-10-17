import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/widgets/consumer_checkout_breakdown_panel.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _CheckoutClient extends ApiClient {
  _CheckoutClient() : super(baseUrl: 'http://test', accessToken: 'token');

  bool deny = false;
  bool invalidContract = false;
  int reads = 0;
  int writes = 0;
  static const readiness = <String, dynamic>{
    'evaluationScope': 'THIS_BOOKING_PREVIEW_ONLY',
    'status': 'NOT_READY',
    'chargeAuthorized': false,
    'blockers': [
      {'code': 'SELLER_OF_RECORD_UNVERIFIED', 'label': 'Seller and invoice issuer not verified for this checkout'},
      {'code': 'GST_TREATMENT_UNDETERMINED', 'label': 'Tax/GST treatment not established for this checkout'},
      {'code': 'PARTS_LINE_ITEMS_UNAVAILABLE', 'label': 'Verified individual parts and labour line items not available'},
      {'code': 'EXTRA_WORK_NOT_BILLABLE', 'label': 'Approved extra work has no consolidated charge authorization'},
      {'code': 'SETTLEMENT_REFUND_RULES_UNVERIFIED', 'label': 'Settlement and refund rules not verified for consolidated checkout'},
    ],
  };

  Map<String, dynamic> response = {
    'readOnly': true,
    'checkoutReady': false,
    'amountPayablePaise': null,
    'currency': 'INR',
    'taxBreakdown': null,
    'readiness': readiness,
    'baseService': {'description': 'AC service', 'amountPaise': 75000},
    'extraWorkQuotes': [
      {'description': 'Replace filter', 'quotedAmountPaise': '12500', 'status': 'APPROVED'},
    ],
    'baseBookingPayments': [
      {'status': 'CAPTURED', 'grossAmountPaise': '75000'},
    ],
  };

  @override
  Future<dynamic> get(String path) async {
    if (!path.endsWith('/checkout-breakdown')) throw StateError('Unexpected GET $path');
    reads++;
    if (deny) throw StateError('Not authorized');
    if (invalidContract) return {...response, 'checkoutReady': true};
    return response;
  }

  @override
  Future<dynamic> post(String path, [Map<String, dynamic>? body]) async {
    writes++;
    throw StateError('Checkout breakdown must never POST');
  }
}

Widget _host(ApiClient api) => MaterialApp(
  home: Scaffold(body: ConsumerCheckoutBreakdownPanel(
    apiClient: api, bookingId: '11111111-1111-4111-8111-111111111111',
  )),
);

void main() {
  testWidgets('shows immutable base price, separate approved quote and payment status', (tester) async {
    final api = _CheckoutClient();
    await tester.pumpWidget(_host(api));
    await tester.pumpAndSettle();
    expect(find.text('Price and quote breakdown'), findsOneWidget);
    expect(find.text('₹750.00'), findsNWidgets(2));
    expect(find.text('₹125.00'), findsOneWidget);
    expect(find.textContaining('Quote status: APPROVED'), findsOneWidget);
    expect(find.text('Payment status: CAPTURED'), findsOneWidget);
    expect(find.textContaining('This is not an invoice'), findsOneWidget);
    expect(find.textContaining('GST and any final consolidated total'), findsOneWidget);
    await tester.ensureVisible(find.text('Why consolidated checkout is not available'));
    expect(find.text('Why consolidated checkout is not available'), findsOneWidget);
    expect(find.textContaining('Verified individual parts and labour line items'), findsOneWidget);
    expect(api.writes, 0);
    api.close();
  });

  testWidgets('fails closed on denied reads and recovers on explicit retry', (tester) async {
    final api = _CheckoutClient()..deny = true;
    await tester.pumpWidget(_host(api));
    await tester.pumpAndSettle();
    expect(find.text('Retry price breakdown'), findsOneWidget);
    expect(find.text('₹750.00'), findsNothing);
    api.deny = false;
    await tester.tap(find.text('Retry price breakdown'));
    await tester.pumpAndSettle();
    expect(find.text('₹750.00'), findsNWidgets(2));
    expect(api.reads, 2);
    api.close();
  });

  testWidgets('invalid payable contract cannot be presented as safe read-only checkout', (tester) async {
    final api = _CheckoutClient()..invalidContract = true;
    await tester.pumpWidget(_host(api));
    await tester.pumpAndSettle();
    expect(find.text('Retry price breakdown'), findsOneWidget);
    expect(find.text('₹750.00'), findsNothing);
    expect(api.writes, 0);
    api.close();
  });

  testWidgets('rejects a misleading readiness contract and never invokes checkout mutations', (tester) async {
    final api = _CheckoutClient();
    api.response = {...api.response, 'readiness': {
      ..._CheckoutClient.readiness, 'status': 'READY',
    }};
    await tester.pumpWidget(_host(api));
    await tester.pumpAndSettle();
    expect(find.text('Retry price breakdown'), findsOneWidget);
    expect(api.writes, 0);
    api.close();
  });

  testWidgets('empty quotes and payments stay distinct and do not create totals', (tester) async {
    final api = _CheckoutClient()..response = {
      'readOnly': true, 'checkoutReady': false, 'amountPayablePaise': null,
      'currency': 'INR', 'taxBreakdown': null,
      'readiness': _CheckoutClient.readiness,
      'baseService': {'description': 'Cleaning', 'amountPaise': 0},
      'extraWorkQuotes': <Map<String, dynamic>>[],
      'baseBookingPayments': <Map<String, dynamic>>[],
    };
    await tester.pumpWidget(_host(api));
    await tester.pumpAndSettle();
    expect(find.text('₹0.00'), findsOneWidget);
    expect(find.text('No extra-work quotes recorded.'), findsOneWidget);
    expect(find.text('No original booking payment recorded.'), findsOneWidget);
    expect(api.writes, 0);
    api.close();
  });

  testWidgets('refresh reloads server state instead of assuming a quote became payable', (tester) async {
    final api = _CheckoutClient();
    await tester.pumpWidget(_host(api));
    await tester.pumpAndSettle();
    api.response = {
      ...api.response,
      'extraWorkQuotes': [
        {'description': 'Replace filter', 'quotedAmountPaise': '12500', 'status': 'DECLINED'},
      ],
    };
    await tester.ensureVisible(find.text('Refresh breakdown'));
    await tester.tap(find.text('Refresh breakdown'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Quote status: DECLINED'), findsOneWidget);
    expect(find.text('₹125.00'), findsOneWidget);
    expect(api.reads, 2);
    expect(api.writes, 0);
    api.close();
  });
}
