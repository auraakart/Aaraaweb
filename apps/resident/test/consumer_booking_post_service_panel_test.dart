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
  final List<String> posts = <String>[];
  Map<String, dynamic>? lastBody;

  @override
  Future<dynamic> get(String path) async {
    if (path.endsWith('/completion')) return completion;
    if (path.endsWith('/rating')) return rating;
    if (path.endsWith('/disputes')) return disputes;
    if (path.endsWith('/extra-work-quotes')) return quotes;
    throw StateError('Unexpected GET $path');
  }

  @override
  Future<dynamic> post(String path, [Map<String, dynamic>? body]) async {
    posts.add(path);
    lastBody = body;
    if (path.contains('/extra-work-quotes/') && path.endsWith('/respond')) {
      final quoteId = path.split('/extra-work-quotes/').last.split('/').first;
      quotes = quotes.map((q) => q['id'] == quoteId
          ? {...q, 'status': body?['decision'] == 'APPROVE' ? 'APPROVED' : 'DECLINED'}
          : q).toList();
      return quotes.firstWhere((q) => q['id'] == quoteId);
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

Widget host(ApiClient client) => MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          child: ConsumerBookingPostServicePanel(
            apiClient: client,
            bookingId: '11111111-1111-1111-1111-111111111111',
          ),
        ),
      ),
    );

void main() {
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
