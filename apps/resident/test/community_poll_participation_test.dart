import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/data/resident_repository.dart';
import 'package:aaraagate_resident/screens/community_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _PollRepository extends ResidentRepository {
  _PollRepository():super(ApiClient(baseUrl:'http://127.0.0.1:3000',accessToken:'test'));
  String? recordedOptionId;
  bool failAfterRecord=false;
  bool failWithoutRecord=false;
  int responseCalls=0;
  @override Future<List<Map<String,dynamic>>> communityMeetings() async => const [];
  @override Future<List<Map<String,dynamic>>> communityDocuments() async => const [];
  @override Future<List<Map<String,dynamic>>> societyDocuments() async => const [];
  @override Future<List<Map<String,dynamic>>> helpdeskTickets() async => const [];
  @override Future<List<Map<String,dynamic>>> communityEvents() async => const [];
  @override Future<List<Map<String,dynamic>>> communityPolls() async => [{
    'id':'poll-1','title':'Morning yoga timing','description':'Choose one preferred start time.','status':'OPEN',
    'statutoryUseProhibited':true,'myOptionId':recordedOptionId,
    'options':const [{'id':'option-1','ordinal':1,'label':'6:30 AM'},{'id':'option-2','ordinal':2,'label':'7:30 AM'}],
  }];
  @override Future<Map<String,dynamic>> respondToCommunityPoll({required String pollId,required String optionId}) async {
    responseCalls++;
    if(failWithoutRecord)throw Exception('transport failure');
    recordedOptionId=optionId;
    if(failAfterRecord)throw Exception('response lost after commit');
    return {'pollId':pollId,'optionId':optionId,'status':'RECORDED'};
  }
}
Future<void> _openPoll(WidgetTester tester) async {
  await tester.scrollUntilVisible(find.text('Morning yoga timing'),350,scrollable:find.byType(Scrollable).first);
  await tester.tap(find.text('Respond'));
  await tester.pumpAndSettle();
}
void main(){
  testWidgets('community shortcut bar keeps participation and resident tools discoverable',(tester) async{
    await tester.binding.setSurfaceSize(const Size(390,844));
    addTearDown(()=>tester.binding.setSurfaceSize(null));
    final repository=_PollRepository();
    final controller=ResidentDataController(repository,activeUnitId:'unit-1',fetchEntitlements:false);

    await tester.pumpWidget(MaterialApp(home:CommunityScreen(controller:controller)));
    await tester.pumpAndSettle();

    final bar=find.byKey(const ValueKey('community-shortcuts-bar'));
    expect(bar,findsOneWidget);
    expect(find.descendant(of:bar,matching:find.text('Updates')),findsOneWidget);
    expect(find.descendant(of:bar,matching:find.text('Polls')),findsOneWidget);
    expect(find.descendant(of:bar,matching:find.text('Events')),findsOneWidget);
    expect(find.descendant(of:bar,matching:find.text('Requests')),findsOneWidget);
    expect(find.descendant(of:bar,matching:find.text('Circles')),findsOneWidget);
    expect(find.descendant(of:bar,matching:find.text('Directory')),findsOneWidget);

    await tester.tap(find.descendant(of:bar,matching:find.text('Polls')));
    await tester.pumpAndSettle();
    expect(find.text('Community polls'),findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();

    await tester.tap(find.descendant(of:bar,matching:find.text('Events')));
    await tester.pumpAndSettle();
    expect(find.text('Community events'),findsOneWidget);

    controller.dispose();
  });

  testWidgets('resident reviews and confirms a community poll response from authoritative state',(tester) async{
    final repository=_PollRepository();
    final controller=ResidentDataController(repository,activeUnitId:'unit-1',fetchEntitlements:false);
    await tester.pumpWidget(MaterialApp(home:CommunityScreen(controller:controller)));
    await tester.pumpAndSettle();
    await _openPoll(tester);
    expect(find.text('Community poll only — not statutory voting. A recorded response cannot be changed from the Resident app.'),findsOneWidget);
    await tester.tap(find.text('7:30 AM'));
    await tester.tap(find.text('Confirm response'));
    await tester.pumpAndSettle();
    expect(repository.responseCalls,1);
    expect(repository.recordedOptionId,'option-2');
    expect(find.text('Response recorded · 7:30 AM'),findsOneWidget);
    controller.dispose();
  });
  testWidgets('uncertain poll submission recovers only when refreshed option matches',(tester) async{
    final repository=_PollRepository()..failAfterRecord=true;
    final controller=ResidentDataController(repository,activeUnitId:'unit-1',fetchEntitlements:false);
    await tester.pumpWidget(MaterialApp(home:CommunityScreen(controller:controller)));
    await tester.pumpAndSettle();
    await _openPoll(tester);
    await tester.tap(find.text('7:30 AM'));
    await tester.tap(find.text('Confirm response'));
    await tester.pumpAndSettle();
    expect(repository.responseCalls,1);
    expect(find.text('Response recorded · 7:30 AM'),findsOneWidget);
    expect(find.text('Respond'),findsNothing);
    controller.dispose();
  });
  testWidgets('unverified poll failure remains retryable without manufacturing success',(tester) async{
    final repository=_PollRepository()..failWithoutRecord=true;
    final controller=ResidentDataController(repository,activeUnitId:'unit-1',fetchEntitlements:false);
    await tester.pumpWidget(MaterialApp(home:CommunityScreen(controller:controller)));
    await tester.pumpAndSettle();
    await _openPoll(tester);
    await tester.tap(find.text('7:30 AM'));
    await tester.tap(find.text('Confirm response'));
    await tester.pumpAndSettle();
    expect(repository.responseCalls,1);
    expect(repository.recordedOptionId,isNull);
    expect(find.text('Response could not be verified. Review your selection and retry.'),findsOneWidget);
    expect(find.text('Confirm response'),findsOneWidget);
    controller.dispose();
  });
}
