import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/data/resident_repository.dart';
import 'package:aaraagate_resident/screens/helpdesk_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _HelpdeskRepository extends ResidentRepository {
  _HelpdeskRepository():super(ApiClient(baseUrl:'http://127.0.0.1:3000',accessToken:'test'));

  int reopenCalls = 0;
  String? reopenReason;
  int commentCalls = 0;
  bool failFirstComment = false;
  final List<String> commentKeys = <String>[];

  @override
  Future<List<Map<String,dynamic>>> helpdeskTickets() async => [
    {
      'id':'ticket-1',
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
    expect(find.text('Create complaint'),findsOneWidget);

    controller.dispose();
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

    await tester.scrollUntilVisible(find.text('Add a comment'),300,scrollable:find.byType(Scrollable).first);
    await tester.enterText(find.widgetWithText(TextField,'Comment'),'Please share the repair update');
    await tester.tap(find.text('Send comment'));
    await tester.pumpAndSettle();

    expect(repository.commentCalls,1);
    expect(repository.commentKeys.single,startsWith('resident-helpdesk-comment-'));
    expect(find.textContaining('Retry will reuse this comment submission'),findsOneWidget);

    await tester.tap(find.text('Send comment'));
    await tester.pumpAndSettle();

    expect(repository.commentCalls,2);
    expect(repository.commentKeys[1],repository.commentKeys[0]);
    expect(find.textContaining('Retry will reuse this comment submission'),findsNothing);

    controller.dispose();
  });

}
