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
  Map<String, dynamic> response = {
    'readOnly': true,
    'checkoutReady': false,
    'amountPayablePaise': null,
    'currency': 'INR',
    'taxBreakdown': null,
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

  testWidgets('empty quotes and payments stay distinct and do not create totals', (tester) async {
    final api = _CheckoutClient()..response = {
      'readOnly': true, 'checkoutReady': false, 'amountPayablePaise': null,
      'currency': 'INR', 'taxBreakdown': null,
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
