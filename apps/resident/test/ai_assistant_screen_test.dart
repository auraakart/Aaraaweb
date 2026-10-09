import 'dart:async';
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

  String? transcript;
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

class PendingResidentSpeech extends FakeResidentSpeech {
  PendingResidentSpeech() : super(null);
  final result = Completer<String?>();
  @override
  Future<String?> listenOnce({required String languageCode}) => result.future;
}

void main() {
  testWidgets('recording locks query and complaint actions until transcript review', (tester) async {
    final api = FakeApiClient();
    final speech = PendingResidentSpeech();
    await tester.pumpWidget(MaterialApp(home: AiAssistantScreen(
      apiClient: api, unitId: 'unit-1', speech: speech,
    )));
    await tester.enterText(find.byType(TextField), 'Existing typed question');
    await tester.ensureVisible(find.text('Speak'));
    await tester.tap(find.text('Speak'));
    await tester.pump();
    final ask = tester.widget<FilledButton>(find.ancestor(of: find.text('Ask'), matching: find.byWidgetPredicate((w) => w is FilledButton)).first);
    final complaint = tester.widget<OutlinedButton>(find.ancestor(of: find.text('Create complaint'), matching: find.byWidgetPredicate((w) => w is OutlinedButton)).first);
    expect(ask.onPressed, isNull);
    expect(complaint.onPressed, isNull);
    expect(tester.widget<TextField>(find.byType(TextField)).readOnly, isTrue);
    expect(api.posts, isEmpty);
    speech.result.complete('பராமரிப்பு கட்டணம் என்ன');
    await tester.pumpAndSettle();
    expect(tester.widget<TextField>(find.byType(TextField)).controller!.text, 'பராமரிப்பு கட்டணம் என்ன');
    expect(tester.widget<FilledButton>(find.ancestor(of: find.text('Ask'), matching: find.byWidgetPredicate((w) => w is FilledButton)).first).onPressed, isNotNull);
    expect(api.posts, isEmpty);
  });

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
    await tester.ensureVisible(find.text('Ask'));
    await tester.pumpAndSettle();
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

  testWidgets('assistant captures a second Tamil recording without submitting either draft', (tester) async {
    final api = FakeApiClient();
    final speech = FakeResidentSpeech('முதல் கேள்வி');
    await tester.pumpWidget(MaterialApp(home: AiAssistantScreen(
      apiClient: api, unitId: '22222222-2222-4222-8222-222222222222', speech: speech,
    )));
    await tester.tap(find.byType(DropdownButton<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('தமிழ்').last);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('பேசுங்கள்'));
    await tester.tap(find.text('பேசுங்கள்'));
    await tester.pumpAndSettle();
    expect(speech.languageCode, 'ta');
    expect(find.text('முதல் கேள்வி'), findsOneWidget);
    speech.transcript = 'இரண்டாவது கேள்வி';
    await tester.tap(find.text('பேசுங்கள்'));
    await tester.pumpAndSettle();
    expect(speech.listenCalls, 2);
    expect(speech.languageCode, 'ta');
    expect(find.text('இரண்டாவது கேள்வி'), findsOneWidget);
    expect(find.text('முதல் கேள்வி'), findsNothing);
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
    await tester.pumpAndSettle();
    await tester.tap(find.text('Create complaint'));
    await tester.pumpAndSettle();

    expect(find.text('Review complaint before submitting'), findsOneWidget);
    expect(find.text('Confirm complaint'), findsOneWidget);
    expect(api.posts.where((path) => path.endsWith('/confirm')), isEmpty);

    await tester.ensureVisible(find.text('Confirm complaint'));
    await tester.pumpAndSettle();
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
    await tester.ensureVisible(find.text('Create complaint'));
    await tester.pumpAndSettle();
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
    await tester.ensureVisible(find.text('Ask'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ask'));
    await tester.pumpAndSettle();

    expect(find.textContaining('Your September maintenance bill is ₹4,250'), findsOneWidget);
    expect(find.textContaining('outstanding:'), findsNothing);
    expect(api.posts, isEmpty);
  });

  testWidgets('demo rejects unrelated questions without inventing society facts', (tester) async {
    final api = FakeApiClient();
    await tester.pumpWidget(MaterialApp(home: AiAssistantScreen(
      apiClient: api, unitId: 'demo-unit-1', demoMode: true,
      speech: FakeResidentSpeech(null),
    )));
    for (final question in ['Who won the cricket match?', 'What is the weather in Mumbai?']) {
      await tester.enterText(find.byType(TextField), question);
      await tester.ensureVisible(find.text('Ask'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Ask'));
      await tester.pumpAndSettle();
      expect(find.textContaining('outside Aaraagate Assistant’s scope'), findsOneWidget);
      expect(find.textContaining('Today you have one visitor'), findsNothing);
      expect(find.textContaining('Based on '), findsNothing);
    }
    expect(api.posts, isEmpty);
  });

  testWidgets('demo family member request uses only the selected synthetic household', (tester) async {
    final api = FakeApiClient();
    await tester.pumpWidget(MaterialApp(home: AiAssistantScreen(
      apiClient: api, unitId: 'demo-unit-1', demoMode: true,
      speech: FakeResidentSpeech(null),
    )));
    await tester.enterText(find.byType(TextField), 'give my family member list');
    await tester.ensureVisible(find.text('Ask'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ask'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Priya Sharma'), findsOneWidget);
    expect(find.textContaining('Profile → Family members'), findsOneWidget);
    expect(find.textContaining('98765'), findsNothing);
    expect(find.textContaining('Today you have one visitor'), findsNothing);
    expect(find.text('Based on Demo household fixture'), findsOneWidget);
    expect(api.posts, isEmpty);
  });

  testWidgets('demo shows safe household vehicle and parcel previews', (tester) async {
    final api = FakeApiClient();
    await tester.pumpWidget(MaterialApp(home: AiAssistantScreen(
      apiClient: api, unitId: 'demo-unit-1', demoMode: true,
      speech: FakeResidentSpeech(null),
    )));
    await tester.enterText(find.byType(TextField), 'Show my registered vehicles');
    await tester.ensureVisible(find.text('Ask'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ask'));
    await tester.pumpAndSettle();
    expect(find.textContaining('plate ending 1234'), findsOneWidget);
    expect(find.textContaining('KA01AB1234'), findsNothing);
    await tester.enterText(find.byType(TextField), 'Where is my package?');
    await tester.ensureVisible(find.text('Ask'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ask'));
    await tester.pumpAndSettle();
    expect(find.textContaining('2 packages are waiting'), findsOneWidget);
    expect(find.textContaining('AMZ-77421'), findsNothing);
    expect(find.textContaining('Based on Demo parcel fixture'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'Who won the cricket match?');
    await tester.ensureVisible(find.text('Ask'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ask'));
    await tester.pumpAndSettle();
    expect(find.textContaining('outside Aaraagate Assistant’s scope'), findsOneWidget);
    expect(find.textContaining('Based on '), findsNothing);
    expect(api.posts, isEmpty);
  });

  testWidgets('demo never leaks first household fixtures to another selected home', (tester) async {
    final api = FakeApiClient();
    await tester.pumpWidget(MaterialApp(home: AiAssistantScreen(
      apiClient: api, unitId: 'demo-unit-2', demoMode: true,
      speech: FakeResidentSpeech(null),
    )));
    await tester.enterText(find.byType(TextField), 'give my family member list');
    await tester.ensureVisible(find.text('Ask'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ask'));
    await tester.pumpAndSettle();
    expect(find.textContaining('no active approved family members'), findsOneWidget);
    expect(find.textContaining('Priya Sharma'), findsNothing);
    await tester.enterText(find.byType(TextField), 'Show my registered vehicles');
    await tester.ensureVisible(find.text('Ask'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ask'));
    await tester.pumpAndSettle();
    expect(find.textContaining('no active registered vehicles'), findsOneWidget);
    expect(find.textContaining('Maruti'), findsNothing);
    await tester.enterText(find.byType(TextField), 'Show my parcels');
    await tester.ensureVisible(find.text('Ask'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ask'));
    await tester.pumpAndSettle();
    expect(find.textContaining('no parcel records'), findsOneWidget);
    expect(find.textContaining('Amazon'), findsNothing);
    expect(api.posts, isEmpty);
  });

  testWidgets('authorized Assistant answer offers a whitelisted in-app destination', (tester) async {
    final opened = <String>[];
    final api = FakeApiClient();
    await tester.pumpWidget(MaterialApp(home: AiAssistantScreen(
      apiClient: api, unitId: 'demo-unit-1', demoMode: true,
      speech: FakeResidentSpeech(null), onOpenSection: opened.add,
    )));
    await tester.enterText(find.byType(TextField), 'Show my parcels');
    await tester.ensureVisible(find.text('Ask'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ask'));
    await tester.pumpAndSettle();
    expect(find.text('Open Parcels'), findsOneWidget);
    await tester.ensureVisible(find.text('Open Parcels'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Open Parcels'));
    expect(opened, ['parcels']);
    await tester.enterText(find.byType(TextField), 'Who won the cricket match?');
    await tester.ensureVisible(find.text('Ask'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ask'));
    await tester.pumpAndSettle();
    expect(find.text('Open Parcels'), findsNothing);
    expect(opened, ['parcels']);
  });

  testWidgets('no related screen button without selected property or injected callback', (tester) async {
    final opened = <String>[];
    final api = FakeApiClient();
    await tester.pumpWidget(MaterialApp(home: AiAssistantScreen(
      apiClient: api, unitId: null, demoMode: true,
      speech: FakeResidentSpeech(null), onOpenSection: opened.add,
    )));
    await tester.enterText(find.byType(TextField), 'Show my parcels');
    await tester.ensureVisible(find.text('Ask'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ask'));
    await tester.pumpAndSettle();
    expect(find.text('Open Parcels'), findsNothing);
    expect(opened, isEmpty);
  });

  testWidgets('demo keeps society updates but does not mistake generic updates for notices', (tester) async {
    final api = FakeApiClient();
    await tester.pumpWidget(MaterialApp(home: AiAssistantScreen(
      apiClient: api, unitId: 'demo-unit-1', demoMode: true,
      speech: FakeResidentSpeech(null),
    )));
    await tester.enterText(find.byType(TextField), 'Summarize society updates');
    await tester.ensureVisible(find.text('Ask'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ask'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Key updates: lift maintenance'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'How do I update my phone OS?');
    await tester.tap(find.text('Ask'));
    await tester.pumpAndSettle();
    expect(find.textContaining('outside Aaraagate Assistant’s scope'), findsOneWidget);
    expect(find.textContaining('Key updates: lift maintenance'), findsNothing);
  });

  testWidgets('explicit complaint-creation questions offer review before any mutation', (tester) async {
    final api = FakeApiClient();
    await tester.pumpWidget(MaterialApp(home: AiAssistantScreen(
      apiClient: api, unitId: '22222222-2222-4222-8222-222222222222',
      speech: FakeResidentSpeech(null),
    )));
    await tester.enterText(find.byType(TextField), 'Raise a complaint about leaking kitchen sink');
    await tester.ensureVisible(find.text('Ask'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ask'));
    await tester.pumpAndSettle();
    expect(find.text('Prepare complaint for review'), findsOneWidget);
    expect(api.posts.where((path)=>path.endsWith('/assistant/helpdesk-from-text')), isEmpty);
    await tester.ensureVisible(find.text('Prepare complaint for review'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Prepare complaint for review'));
    await tester.pumpAndSettle();
    expect(find.text('Review complaint before submitting'), findsOneWidget);
    expect(find.text('Confirm complaint'), findsOneWidget);
    expect(api.posts.where((path)=>path.endsWith('/confirm')), isEmpty);
  });

  testWidgets('lookup questions and edited drafts cannot activate a stale proposal action', (tester) async {
    final api = FakeApiClient();
    await tester.pumpWidget(MaterialApp(home: AiAssistantScreen(
      apiClient: api, unitId: 'demo-unit', demoMode:true,
      speech: FakeResidentSpeech(null),
    )));
    await tester.enterText(find.byType(TextField), 'Show my complaints');
    await tester.ensureVisible(find.text('Ask'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ask'));
    await tester.pumpAndSettle();
    expect(find.text('Prepare complaint for review'), findsNothing);
    await tester.enterText(find.byType(TextField), 'Create complaint about water leakage');
    await tester.tap(find.text('Ask'));
    await tester.pumpAndSettle();
    expect(find.text('Prepare complaint for review'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'What is my maintenance due?');
    await tester.pumpAndSettle();
    expect(find.text('Prepare complaint for review'), findsNothing);
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
