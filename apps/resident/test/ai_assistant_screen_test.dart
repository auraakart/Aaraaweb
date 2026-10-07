import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/screens/ai_assistant_screen.dart';
import 'package:aaraagate_resident/voice/resident_speech.dart';

class FakeApiClient extends ApiClient {
  FakeApiClient() : super(baseUrl: 'http://example.test', accessToken: 'token');

  final List<String> posts = [];
  final List<String> gets = [];

  @override
  Future<dynamic> get(String path) async {
    gets.add(path);
    return {};
  }

  @override
  Future<dynamic> post(String path, [Map<String, dynamic>? body]) async {
    posts.add(path);
    if (path.endsWith('/assistant/query')) {
      return {
        'intent': 'RESIDENT_STATUS',
        'answer': 'You have 2 active helpdesk requests. Water seepage near the balcony is high priority.',
        'facts': {'activeRequests': 2, 'highPriority': 'Water seepage near balcony'},
        'sources': ['Helpdesk', 'SLA status'],
        'grounded': true,
        'mutationPerformed': false,
      };
    }
    if (path.endsWith('/assistant/helpdesk-from-text')) {
      return {
        'id': '11111111-1111-4111-8111-111111111111',
        'status': 'PROPOSED',
        'requiresConfirmation': true,
      };
    }
    if (path.endsWith('/confirm')) {
      return {
        'proposalId': '11111111-1111-4111-8111-111111111111',
        'status': 'EXECUTED',
        'result': {'ticketId': 'ticket-1'},
      };
    }
    return {'status': 'CANCELLED'};
  }
}

class FakeResidentSpeech implements ResidentSpeech {
  FakeResidentSpeech(this.transcript);

  final String? transcript;
  String? languageCode;
  int listenCalls = 0;
  int stopCalls = 0;

  @override
  Future<String?> listenOnce({required String languageCode}) async {
    this.languageCode = languageCode;
    listenCalls += 1;
    return transcript;
  }

  @override
  Future<void> stop() async {
    stopCalls += 1;
  }
}

void main() {
  testWidgets('assistant uses premium concise controls and hides raw fact keys', (tester) async {
    final api = FakeApiClient();
    await tester.pumpWidget(
      MaterialApp(
        home: AiAssistantScreen(
          apiClient: api,
          unitId: '22222222-2222-4222-8222-222222222222',
          speech: FakeResidentSpeech(null),
        ),
      ),
    );

    expect(find.text('How can I help?'), findsOneWidget);
    expect(find.text('Quick actions'), findsOneWidget);
    expect(find.text('Maintenance dues'), findsOneWidget);
    expect(find.text('Open complaints'), findsOneWidget);
    expect(find.text("Today's visitors & staff"), findsOneWidget);
    expect(find.text('Book amenities'), findsOneWidget);
    expect(find.text('Society updates'), findsOneWidget);
    expect(find.text('Speak'), findsOneWidget);
    expect(find.text('Create complaint'), findsOneWidget);
    expect(find.text('Available for you'), findsNothing);

    await tester.enterText(find.byType(TextField), 'Show my open complaints');
    await tester.tap(find.text('Ask'));
    await tester.pumpAndSettle();

    expect(find.textContaining('You have 2 active helpdesk requests.'), findsOneWidget);
    expect(find.text('Based on Helpdesk · SLA status'), findsOneWidget);
    expect(find.textContaining('activeRequests:'), findsNothing);
    expect(find.textContaining('highPriority:'), findsNothing);
    expect(api.gets, isEmpty);
  });

  testWidgets('assistant voice fills the question and never auto-submits', (tester) async {
    final api = FakeApiClient();
    final speech = FakeResidentSpeech('Show my open complaints');

    await tester.pumpWidget(
      MaterialApp(
        home: AiAssistantScreen(
          apiClient: api,
          unitId: '22222222-2222-4222-8222-222222222222',
          speech: speech,
        ),
      ),
    );

    await tester.tap(find.text('Speak'));
    await tester.pumpAndSettle();

    expect(speech.listenCalls, 1);
    expect(speech.languageCode, 'en');
    expect(find.text('Show my open complaints'), findsOneWidget);
    expect(find.textContaining('Got it.'), findsOneWidget);
    expect(api.posts, isEmpty);
  });

  testWidgets('assistant requires explicit complaint confirmation', (tester) async {
    final api = FakeApiClient();
    await tester.pumpWidget(
      MaterialApp(
        home: AiAssistantScreen(
          apiClient: api,
          unitId: '22222222-2222-4222-8222-222222222222',
          speech: FakeResidentSpeech(null),
        ),
      ),
    );

    await tester.enterText(find.byType(TextField), 'Water is leaking near the kitchen sink');
    await tester.ensureVisible(find.text('Create complaint'));
    await tester.tap(find.text('Create complaint'));
    await tester.pumpAndSettle();

    expect(find.text('Review complaint before submitting'), findsOneWidget);
    expect(find.text('Confirm complaint'), findsOneWidget);
    expect(api.posts.where((path) => path.endsWith('/confirm')), isEmpty);

    await tester.ensureVisible(find.text('Confirm complaint'));
    await tester.tap(find.text('Confirm complaint'));
    await tester.pumpAndSettle();

    expect(api.posts.where((path) => path.endsWith('/confirm')).length, 1);
  });

  testWidgets('editing source text invalidates an unconfirmed complaint proposal', (tester) async {
    final api = FakeApiClient();
    await tester.pumpWidget(
      MaterialApp(
        home: AiAssistantScreen(
          apiClient: api,
          unitId: '22222222-2222-4222-8222-222222222222',
          speech: FakeResidentSpeech(null),
        ),
      ),
    );

    await tester.enterText(find.byType(TextField), 'Water is leaking near the kitchen sink');
    await tester.tap(find.text('Create complaint'));
    await tester.pumpAndSettle();
    expect(find.text('Confirm complaint'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'The issue is now a lift noise complaint');
    await tester.pump();

    expect(find.text('Confirm complaint'), findsNothing);
    expect(api.posts.where((path) => path.endsWith('/confirm')), isEmpty);
  });

  testWidgets('demo assistant answers locally and does not expose debug facts', (tester) async {
    final api = FakeApiClient();
    await tester.pumpWidget(
      MaterialApp(
        home: AiAssistantScreen(
          apiClient: api,
          unitId: 'demo-unit-1',
          demoMode: true,
          speech: FakeResidentSpeech(null),
        ),
      ),
    );

    expect(find.textContaining('demo society data'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'What is my maintenance due?');
    await tester.tap(find.text('Ask'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Your September maintenance bill is ₹4,250'), findsOneWidget);
    expect(find.textContaining('outstanding:'), findsNothing);
    expect(api.posts, isEmpty);
  });

  testWidgets('assistant accepts a contextual Home prompt without auto-submitting', (tester) async {
    final api = FakeApiClient();
    await tester.pumpWidget(
      MaterialApp(
        home: AiAssistantScreen(
          apiClient: api,
          unitId: '22222222-2222-4222-8222-222222222222',
          initialPrompt: 'What is my maintenance due and when should I pay it?',
          speech: FakeResidentSpeech(null),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('What is my maintenance due and when should I pay it?'), findsOneWidget);
    expect(api.posts, isEmpty);
  });
}
