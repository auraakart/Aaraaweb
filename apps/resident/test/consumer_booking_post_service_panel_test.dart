import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/widgets/consumer_booking_post_service_panel.dart';

class FakeApiClient extends ApiClient {
  FakeApiClient({required this.completion, this.rating}) : super(baseUrl: 'http://test', accessToken: 'token');

  Map<String, dynamic> completion;
  Map<String, dynamic>? rating;
  final List<String> posts = <String>[];
  Map<String, dynamic>? lastBody;

  @override
  Future<dynamic> get(String path) async {
    if (path.endsWith('/completion')) return completion;
    if (path.endsWith('/rating')) return rating;
    throw StateError('Unexpected GET $path');
  }

  @override
  Future<dynamic> post(String path, [Map<String, dynamic>? body]) async {
    posts.add(path);
    lastBody = body;
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
}
