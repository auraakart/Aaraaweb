import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/widgets/consumer_booking_post_service_panel.dart';

class FakeApiClient extends ApiClient {
  FakeApiClient({required this.completion, this.rating}) : super(baseUrl: 'http://test', accessToken: 'token');

  Map<String, dynamic> completion;
  Map<String, dynamic>? rating;
  List<Map<String, dynamic>> disputes = const [];
  List<Map<String, dynamic>> quotes = const [];
  List<Map<String, dynamic>> bills = const [];
  bool failQuotes = false, failBills = false, loseDecisionResponse = false;
  Object? quotePayload;
  Completer<dynamic>? completionGate;
  final List<String> reads = [];
  final List<Map<String, dynamic>> bodies = [];
  final List<String> posts = <String>[];
  Map<String, dynamic>? lastBody;

  @override
  Future<dynamic> get(String path) async {
    reads.add(path);
    if (path.endsWith('/completion')) return completionGate?.future ?? completion;
    if (path.endsWith('/rating')) return rating;
    if (path.endsWith('/disputes')) return disputes;
    if (path.endsWith('/extra-work-quotes')) {
      if (failQuotes) throw ApiException(503, 'Quote read unavailable');
      return quotePayload ?? quotes;
    }
    if (path.endsWith('/extra-work-billing-requests')) {
      if (failBills) throw ApiException(503, 'Billing read unavailable');
      return bills;
    }
    if (path.endsWith('/proposals') || path.endsWith('/completion-evidence') || path.endsWith('/evidence')) return [];
    throw StateError('Unexpected GET $path');
  }

  @override
  Future<dynamic> post(String path, [Map<String, dynamic>? body]) async {
    posts.add(path);
    lastBody = body;
    bodies.add(Map<String, dynamic>.from(body ?? const {}));
    if (path.contains('/extra-work-quotes/') && path.endsWith('/respond')) {
      final quoteId = path.split('/extra-work-quotes/').last.split('/').first;
      quotes = quotes.map((q) => q['id'] == quoteId
          ? {...q, 'status': body?['decision'] == 'APPROVE' ? 'APPROVED' : 'DECLINED'}
          : q).toList();
      if (loseDecisionResponse) {
        loseDecisionResponse = false;
        throw ApiException(503, 'Committed response lost');
      }
      return quotes.firstWhere((q) => q['id'] == quoteId);
    }
    if (path.endsWith('/request-separate-bill')) {
      bills = [{'quoteId': 'quote-1', 'status': 'REQUESTED'}];
      return bills.single;
    }
    if (path.endsWith('/completion/confirm')) {
      completion = <String, dynamic>{
        ...completion,
        'bookingStatus': 'COMPLETED',
        'confirmedAt': '2026-09-07T12:00:00.000Z',
      };
      return completion;
    }
    if (path.endsWith('/rating')) {
      rating = <String, dynamic>{
        'stars': body?['stars'],
        'comment': body?['comment'],
      };
      return rating;
    }
    throw StateError('Unexpected POST $path');
  }
}

Widget host(ApiClient client, {String bookingId = '11111111-1111-1111-1111-111111111111'}) => MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          child: ConsumerBookingPostServicePanel(
            apiClient: client,
            bookingId: bookingId,
          ),
        ),
      ),
    );

void main() {
  FakeApiClient quoteClient({Object? amount = '12500', String status = 'PENDING'}) =>
    FakeApiClient(completion: {'bookingStatus': 'IN_PROGRESS'})..quotes = [{
      'id': 'quote-1', 'scopeDescription': 'Replace damaged valve', 'amountPaise': amount, 'status': status,
    }];

  for (final amount in [null, '', '0', '-1', '1.5', '0x10', '1e3', '100000001', '99999999999999999999999999', false]) {
    testWidgets('unknown or invalid quote amount cannot authorize approval: $amount', (tester) async {
      final client = quoteClient(amount: amount);
      await tester.pumpWidget(host(client));
      await tester.pumpAndSettle();
      expect(find.text('Extra work: Amount unavailable'), findsOneWidget);
      expect(find.textContaining('₹0.00'), findsNothing);
      final approve = tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Approve extra work'));
      expect(approve.onPressed, isNull);
      expect(client.posts, isEmpty);
    });
  }

  testWidgets('smallest whole-paise quote stays reviewable without rounding', (tester) async {
    final client = quoteClient(amount: '1');
    await tester.pumpWidget(host(client));
    await tester.pumpAndSettle();
    expect(find.text('Extra work: ₹0.01'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Approve extra work')).onPressed, isNotNull);
  });

  testWidgets('an approved quote with an unavailable amount cannot request a bill', (tester) async {
    final client = quoteClient(amount: null, status: 'APPROVED');
    await tester.pumpWidget(host(client));
    await tester.pumpAndSettle();
    expect(find.text('Extra work: Amount unavailable'), findsOneWidget);
    expect(tester.widget<OutlinedButton>(find.widgetWithText(OutlinedButton, 'Request separate bill')).onPressed, isNull);
    expect(client.posts, isEmpty);
  });

  testWidgets('lost decline response retries the exact saved decision and reason', (tester) async {
    final client = quoteClient()..loseDecisionResponse = true;
    await tester.pumpWidget(host(client));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Decline extra work'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Do not replace this valve');
    await tester.tap(find.text('Confirm decline'));
    await tester.pumpAndSettle();
    expect(find.text('Retry saved quote decision'), findsOneWidget);
    expect(find.text('Approve extra work'), findsNothing);
    await tester.ensureVisible(find.text('Retry saved quote decision'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Retry saved quote decision'));
    await tester.pumpAndSettle();
    expect(client.posts, hasLength(2));
    expect(client.bodies, everyElement(equals({'decision': 'DECLINE', 'reason': 'Do not replace this valve'})));
    expect(find.byType(AlertDialog), findsNothing);
    expect(find.text('Retry saved quote decision'), findsNothing);
    expect(find.text('Quote status: DECLINED'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('repeated approval taps open only one consent dialog', (tester) async {
    final client = quoteClient();
    await tester.pumpWidget(host(client));
    await tester.pumpAndSettle();
    final action = tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Approve extra work')).onPressed!;
    action(); action();
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsOneWidget);
    expect(client.posts, isEmpty);
    await tester.tap(find.text('Keep reviewing'));
    await tester.pumpAndSettle();
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Approve extra work')).onPressed, isNotNull);
  });

  testWidgets('failed quote reads remain unknown and recover on explicit retry', (tester) async {
    final client = quoteClient()..failQuotes = true;
    await tester.pumpWidget(host(client));
    await tester.pumpAndSettle();
    expect(find.textContaining('Extra-work quotes are unavailable'), findsOneWidget);
    expect(find.text('Approve extra work'), findsNothing);
    client.failQuotes = false;
    await tester.tap(find.text('Retry quote and bill status'));
    await tester.pumpAndSettle();
    expect(find.text('Approve extra work'), findsOneWidget);
    expect(client.posts, isEmpty);
  });

  testWidgets('invalid quote collection cannot be treated as no quotes', (tester) async {
    final client = quoteClient()..quotePayload = {'unexpected': 'shape'};
    await tester.pumpWidget(host(client));
    await tester.pumpAndSettle();
    expect(find.textContaining('Extra-work quotes are unavailable'), findsOneWidget);
    expect(find.text('Approve extra work'), findsNothing);
  });

  testWidgets('unknown bill history disables another request until status is refreshed', (tester) async {
    final client = quoteClient(status: 'APPROVED')..failBills = true;
    await tester.pumpWidget(host(client));
    await tester.pumpAndSettle();
    expect(find.textContaining('Separate bill requests are unavailable'), findsOneWidget);
    expect(tester.widget<OutlinedButton>(find.widgetWithText(OutlinedButton, 'Request separate bill')).onPressed, isNull);
    client.failBills = false;
    await tester.tap(find.text('Retry quote and bill status'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Request separate bill'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Request separate bill'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Request separate bill'));
    await tester.pumpAndSettle();
    expect(client.posts.single, endsWith('/extra-work-quotes/quote-1/request-separate-bill'));
    expect(client.bodies.single, isEmpty);
  });

  testWidgets('independent reads start together while completion is pending', (tester) async {
    final gate = Completer<dynamic>();
    final client = quoteClient()..completionGate = gate;
    await tester.pumpWidget(host(client));
    await tester.pump();
    expect(client.reads, hasLength(7));
    expect(client.reads.any((path) => path.endsWith('/extra-work-quotes')), isTrue);
    expect(client.reads.any((path) => path.endsWith('/extra-work-billing-requests')), isTrue);
    gate.complete(client.completion);
    await tester.pumpAndSettle();
    expect(find.text('Approve extra work'), findsOneWidget);
  });

  testWidgets('replacement login discards a late old-booking load', (tester) async {
    final gate = Completer<dynamic>();
    final old = quoteClient()..completionGate = gate;
    await tester.pumpWidget(host(old));
    await tester.pump();
    final fresh = quoteClient()..quotes = [{
      'id': 'quote-new', 'scopeDescription': 'Clean the new home windows', 'amountPaise': '30000', 'status': 'PENDING',
    }];
    await tester.pumpWidget(host(fresh, bookingId: 'new-booking'));
    await tester.pumpAndSettle();
    gate.complete(old.completion);
    await tester.pumpAndSettle();
    expect(find.text('Clean the new home windows'), findsOneWidget);
    expect(find.text('Replace damaged valve'), findsNothing);
    expect(fresh.reads.every((path) => path.contains('/new-booking/')), isTrue);
    expect(old.posts, isEmpty);
    expect(fresh.posts, isEmpty);
    expect(tester.takeException(), isNull);
  });

  testWidgets('switching booking closes its old consent dialog without submitting', (tester) async {
    final client = quoteClient();
    await tester.pumpWidget(host(client));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Approve extra work'));
    await tester.pumpAndSettle();
    expect(find.text('Confirm approval'), findsOneWidget);
    client.quotes = const [];
    await tester.pumpWidget(host(client, bookingId: 'other-booking'));
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsNothing);
    expect(client.posts, isEmpty);
    expect(tester.takeException(), isNull);
  });
  testWidgets('customer can confirm an agent completion request', (tester) async {
    final client = FakeApiClient(
      completion: {
        'bookingStatus': 'IN_PROGRESS',
        'agentDisplayName': 'Ravi',
        'requestedAt': '2026-09-07T11:55:00.000Z',
        'confirmedAt': null,
      },
    );

    await tester.pumpWidget(host(client));
    await tester.pumpAndSettle();

    expect(find.text('Confirm service completed'), findsOneWidget);
    expect(find.textContaining('Ravi says the work is complete'), findsOneWidget);

    await tester.tap(find.text('Confirm service completed'));
    await tester.pumpAndSettle();

    expect(client.posts.single, contains('/completion/confirm'));
    expect(find.text('How was the service?'), findsOneWidget);
  });

  testWidgets('completed booking can be rated once', (tester) async {
    final client = FakeApiClient(
      completion: {
        'bookingStatus': 'COMPLETED',
        'requestedAt': '2026-09-07T11:55:00.000Z',
        'confirmedAt': '2026-09-07T12:00:00.000Z',
      },
    );

    await tester.pumpWidget(host(client));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('5 stars'));
    await tester.enterText(find.byType(TextField), 'Excellent service');
    await tester.tap(find.text('Submit rating'));
    await tester.pumpAndSettle();

    expect(client.posts.single, contains('/rating'));
    expect(client.lastBody?['stars'], 5);
    expect(client.lastBody?['comment'], 'Excellent service');
    expect(find.text('Your rating'), findsOneWidget);
  });

  testWidgets('service issue resolution is visible after reopening a completed booking', (tester) async {
  final client = FakeApiClient(
    completion: {
      'bookingStatus': 'COMPLETED',
      'requestedAt': '2026-09-07T11:55:00.000Z',
      'confirmedAt': '2026-09-07T12:00:00.000Z',
    },
  )..disputes = [{
    'id': 'dispute-1',
    'status': 'RESOLVED',
    'detail': 'Tap leaking again',
    'resolutionNote': 'Replacement part installed',
  }];
  await tester.pumpWidget(host(client));
  await tester.pumpAndSettle();
  expect(find.text('Service issue history'), findsOneWidget);
  expect(find.text('Status: RESOLVED'), findsOneWidget);
  expect(find.textContaining('Resolution: Replacement part installed'), findsOneWidget);
});

testWidgets('an open service dispute stays visible while a second report is disabled', (tester) async {
  final client = FakeApiClient(completion: {
    'bookingStatus': 'IN_PROGRESS',
    'requestedAt': '2026-09-07T11:55:00.000Z',
    'confirmedAt': null,
  })..disputes = [{
    'id': 'dispute-2',
    'status': 'UNDER_REVIEW',
    'detail': 'Repair not completed',
  }];
  await tester.pumpWidget(host(client));
  await tester.pumpAndSettle();
  expect(find.text('Status: UNDER_REVIEW'), findsOneWidget);
  final button = tester.widget<OutlinedButton>(
    find.ancestor(of: find.text('Report an issue instead'), matching: find.byType(OutlinedButton)).first,
  );
  expect(button.onPressed, isNull);
  expect(client.posts, isEmpty);
});
  testWidgets('resident confirms extra-work approval without a payment operation', (tester) async {
    final client = FakeApiClient(completion: {
      'bookingStatus': 'IN_PROGRESS', 'requestedAt': null, 'confirmedAt': null,
    })..quotes = [{
      'id': 'quote-1', 'scopeDescription': 'Replace damaged valve',
      'amountPaise': '12500', 'status': 'PENDING',
    }];
    await tester.pumpWidget(host(client));
    await tester.pumpAndSettle();
    expect(find.text('Extra-work quotations'), findsOneWidget);
    expect(find.text('Extra work: ₹125.00'), findsOneWidget);
    await tester.ensureVisible(find.text('Approve extra work'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Approve extra work'));
    await tester.pumpAndSettle();
    expect(find.text('Confirm approval'), findsOneWidget);
    expect(client.posts, isEmpty);
    await tester.tap(find.text('Confirm approval'));
    await tester.pumpAndSettle();
    expect(client.lastBody?['decision'], 'APPROVE');
    expect(client.posts.single, contains('/extra-work-quotes/quote-1/respond'));
    expect(find.text('Quote status: APPROVED'), findsOneWidget);
    expect(find.text('Approve extra work'), findsNothing);
  });

  testWidgets('completed quote stays visible without any new acceptance control', (tester) async {
    final client = FakeApiClient(completion: {
      'bookingStatus': 'COMPLETED',
      'requestedAt': '2026-09-07T11:55:00.000Z',
      'confirmedAt': '2026-09-07T12:00:00.000Z',
    })..quotes = [{
      'id': 'quote-1', 'scopeDescription': 'Replace damaged valve',
      'amountPaise': '12500', 'status': 'APPROVED',
    }];
    await tester.pumpWidget(host(client));
    await tester.pumpAndSettle();
    expect(find.text('Quote status: APPROVED'), findsOneWidget);
    expect(find.text('Approve extra work'), findsNothing);
    expect(client.posts, isEmpty);
  });


}
