import 'package:aaraagate_resident/data/resident_history.dart';
import 'dart:async';

import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/data/resident_repository.dart';
import 'package:aaraagate_resident/screens/helpdesk_screen.dart';
import 'package:aaraagate_resident/voice/resident_speech.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:aaraagate_resident/widgets/premium_ui.dart';
import 'package:flutter_test/flutter_test.dart';

class _HelpdeskRepository extends ResidentRepository {
  _HelpdeskRepository():super(ApiClient(baseUrl:'http://127.0.0.1:3000',accessToken:'test'));

  int reopenCalls = 0;
  String? reopenReason;
  int commentCalls = 0;
  bool failFirstComment = false;
  final List<String> commentKeys = <String>[];

  @override
  Future<List<Map<String,dynamic>>> helpdeskHistory({String? unitId,String search='',String? status,ResidentHistoryCursor? before}) async => showcaseHistory(await helpdeskTickets(),unitId:unitId,search:search,status:status,before:before);

  @override
  Future<List<Map<String,dynamic>>> helpdeskTickets() async => [
    {
      'id':'ticket-1',
      'ticketNumber':'HD-2026-000123',
      'unitId':'unit-1',
      'title':'Water leak',
      'description':'Leak near the kitchen sink',
      'priority':'HIGH',
      'status':'RESOLVED',
      'category':'PLUMBING',
      'buildingName':'A Block',
      'unitNumber':'101',
      'computedSlaState':'MET',
      'firstResponseDueAt':'2026-09-19T04:00:00.000Z',
      'resolutionDueAt':'2026-09-19T08:00:00.000Z',
      'resolutionCode':'FIXED',
    }
  ];

  @override
  Future<List<Map<String,dynamic>>> helpdeskActivities(String ticketId) async => [
    {
      'id':'activity-1','type':'REOPENED','message':null,'actorName':'Society Admin',
      'toStatus':'IN_PROGRESS','occurredAt':'2026-09-19T03:00:00.000Z',
    },
    {
      'id':'activity-2','type':'STATUS_CHANGED','message':'Repair completed',
      'actorName':'Facility Manager','toStatus':'RESOLVED','occurredAt':'2026-09-19T05:00:00.000Z',
    },
  ];

  @override
  Future<Map<String,dynamic>> reopenHelpdeskTicket(String ticketId,String note) async {
    reopenCalls++;
    reopenReason=note;
    return {'id':ticketId,'unitId':'unit-1','status':'IN_PROGRESS'};
  }

  @override
  Future<void> addHelpdeskComment(String ticketId,String message,{required String idempotencyKey}) async {
    commentCalls++;
    commentKeys.add(idempotencyKey);
    if(failFirstComment && commentCalls==1) throw StateError('transport lost after commit');
  }
}

class _HeldResidentSpeech implements ResidentSpeech {
  final pendingTranscript = Completer<String?>();
  @override
  Future<String?> listenOnce({required String languageCode}) =>
      pendingTranscript.future;
  @override
  Future<void> stop() async {
    if (!pendingTranscript.isCompleted) pendingTranscript.complete();
  }
}

void main(){
  testWidgets('helpdesk exposes its primary complaint action in the page hierarchy',(tester) async{
    final repository=_HelpdeskRepository();
    final controller=ResidentDataController(repository,activeUnitId:'unit-1',fetchEntitlements:false);
    controller.households=[{'id':'house-1','unitId':'unit-1'}];

    await tester.pumpWidget(MaterialApp(home:HelpdeskScreen(controller:controller)));
    await tester.pumpAndSettle();

    expect(find.byType(FloatingActionButton),findsNothing);
    expect(find.widgetWithText(FilledButton,'New complaint'),findsOneWidget);
    await tester.tap(find.text('New complaint'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextField,'Issue title'),findsOneWidget);

    controller.dispose();
  });

  testWidgets('ticket number is visible in list and details and can be copied', (tester) async {
    final repository = _HelpdeskRepository();
    final controller = ResidentDataController(repository, activeUnitId: 'unit-1', fetchEntitlements: false)
      ..households = [{'id': 'house-1', 'unitId': 'unit-1'}];
    addTearDown(controller.dispose);
    String? clipboardText;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') clipboardText = (call.arguments as Map)['text'] as String;
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
    await tester.pumpWidget(MaterialApp(home: HelpdeskScreen(controller: controller)));
    await tester.pumpAndSettle();
    expect(find.text('HD-2026-000123'), findsOneWidget);
    await tester.tap(find.text('Water leak'));
    await tester.pumpAndSettle();
    expect(find.text('HD-2026-000123'), findsOneWidget);
    await tester.tap(find.byTooltip('Copy ticket number'));
    await tester.pumpAndSettle();
    expect(clipboardText, 'HD-2026-000123');
    expect(find.text('Ticket number copied'), findsOneWidget);
  });

  testWidgets('resident helpdesk shows property, SLA targets, next action and recovery evidence',(tester) async{
    final repository=_HelpdeskRepository();
    final controller=ResidentDataController(repository,activeUnitId:'unit-1',fetchEntitlements:false);
    controller.households=[{'id':'house-1','unitId':'unit-1'}];

    await tester.pumpWidget(MaterialApp(home:HelpdeskScreen(controller:controller)));
    await tester.pumpAndSettle();

    expect(find.text('Water leak'),findsOneWidget);
    expect(find.textContaining('A Block · 101'),findsOneWidget);
    expect(find.text('SLA Met'),findsOneWidget);

    await tester.tap(find.text('Water leak'));
    await tester.pumpAndSettle();

    expect(find.text('Service recovery'),findsOneWidget);
    expect(find.text('What happens next'),findsOneWidget);
    expect(find.textContaining('marked this resolved'),findsOneWidget);
    expect(find.text('First response target'),findsOneWidget);
    expect(find.text('Resolution target'),findsOneWidget);
    expect(find.text('Resolution evidence'),findsOneWidget);
    expect(find.text('Fixed'),findsOneWidget);

    await tester.scrollUntilVisible(find.text('Reopen complaint'),300,scrollable:find.byType(Scrollable).first);
    await tester.enterText(find.widgetWithText(TextField,'Why are you reopening this complaint?'),'The leak has returned');
    final reopenButton=find.ancestor(of:find.text('Reopen complaint'),matching:find.byType(FilledButton));
    expect(reopenButton,findsOneWidget);
    final button=tester.widget<FilledButton>(reopenButton);
    expect(button.onPressed,isNotNull);
    button.onPressed!.call();
    await tester.pumpAndSettle();

    expect(repository.reopenCalls,1);
    expect(repository.reopenReason,'The leak has returned');
    expect(find.text('Complaint reopened and returned to the society team.'),findsOneWidget);
    expect(find.text('Reopen complaint'),findsNothing);

    await tester.scrollUntilVisible(find.text('Reopened'),300,scrollable:find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    expect(find.text('Reopened'),findsOneWidget);

    controller.dispose();
  });

  testWidgets('resident comment retry reuses request identity after ambiguous transport failure',(tester) async{
    final repository=_HelpdeskRepository()..failFirstComment=true;
    final controller=ResidentDataController(repository,activeUnitId:'unit-1',fetchEntitlements:false);
    controller.households=[{'id':'house-1','unitId':'unit-1'}];

    await tester.pumpWidget(MaterialApp(home:HelpdeskScreen(controller:controller)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Water leak'));
    await tester.pumpAndSettle();

    final commentField = find.widgetWithText(TextField, 'Comment');
    await tester.scrollUntilVisible(commentField, 300, scrollable: find.byType(Scrollable).first);
    await tester.enterText(commentField, 'Please share the repair update');
    await tester.scrollUntilVisible(find.text('Send comment'), 150, scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Send comment'));
    await tester.pumpAndSettle();

    expect(repository.commentCalls,1);
    expect(repository.commentKeys.single,startsWith('resident-helpdesk-comment-'));
    expect(find.textContaining('Retry will reuse this comment submission'),findsOneWidget);

    await tester.scrollUntilVisible(find.text('Send comment'), 150, scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Send comment'));
    await tester.pumpAndSettle();

    expect(repository.commentCalls,2);
    expect(repository.commentKeys[1],repository.commentKeys[0]);
    expect(find.textContaining('Retry will reuse this comment submission'),findsNothing);

    controller.dispose();
  });

  testWidgets('Helpdesk complaint form retains full labels at compact width and 200% text', (tester) async {
    tester.view.physicalSize = const Size(320, 760);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final repository = _HelpdeskRepository();
    final controller = ResidentDataController(
      repository, activeUnitId: 'unit-1', fetchEntitlements: false,
    )..households = [{'id': 'house-1', 'unitId': 'unit-1'}];
    addTearDown(controller.dispose);

    await tester.pumpWidget(MaterialApp(
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(
          textScaler: const TextScaler.linear(2),
          disableAnimations: true,
        ),
        child: child!,
      ),
      home: HelpdeskScreen(controller: controller),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('New complaint').first);
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Submit complaint'), 200,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.pumpAndSettle();

    expect(find.text('Submit complaint'), findsOneWidget);
    expect(find.byType(PremiumActionLabel), findsOneWidget);
    expect(tester.widget<DropdownButton<String>>(
      find.byType(DropdownButton<String>),
    ).isExpanded, isTrue);
    expect(tester.takeException(), isNull);
  });

  testWidgets('complaint draft explains required fields and cannot submit mid-dictation', (tester) async {
    final repository = _HelpdeskRepository();
    final controller = ResidentDataController(
      repository, activeUnitId: 'unit-1', fetchEntitlements: false,
    )..households = [{'id': 'house-1', 'unitId': 'unit-1'}];
    addTearDown(controller.dispose);
    final speech = _HeldResidentSpeech();

    await tester.pumpWidget(MaterialApp(
      home: HelpdeskScreen(controller: controller, speech: speech),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.text('New complaint').first);
    await tester.pumpAndSettle();

    expect(find.text('Required · at least 3 characters'), findsOneWidget);
    expect(find.text('Required · at least 5 characters'), findsOneWidget);
    await tester.tap(find.text('Speak'));
    await tester.pump();

    final submit = find.ancestor(
      of: find.text('Submit complaint'),
      matching: find.byType(FilledButton),
    );
    expect(tester.widget<FilledButton>(submit).onPressed, isNull);
    expect(find.textContaining('Listening'), findsWidgets);

    speech.pendingTranscript.complete(null);
    await tester.pumpAndSettle();
    expect(tester.widget<FilledButton>(submit).onPressed, isNotNull);
    expect(tester.takeException(), isNull);
  });

}
