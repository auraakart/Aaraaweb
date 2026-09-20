import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/screens/ai_assistant_screen.dart';

class FakeApiClient extends ApiClient {
  FakeApiClient():super(baseUrl:'http://example.test',accessToken:'token');
  final List<String> posts=[];
  final List<String> gets=[];
  @override
  Future<dynamic> get(String path) async {
    gets.add(path);
    if(path.endsWith('/assistant/tools')){
      return {'tools':[{'id':'RESIDENT_NOTICES','label':'Resident notices','context':'PROPERTY','readOnly':true},{'id':'RESIDENT_GATE','label':'Resident gate status','context':'PROPERTY','readOnly':true}],'mutationAllowList':['CREATE_HELPDESK_TICKET','BOOK_AMENITY','CREATE_VISITOR_PASS']};
    }
    return {};
  }
  @override
  Future<dynamic> post(String path,[Map<String,dynamic>? body]) async {
    posts.add(path);
    if(path.endsWith('/assistant/query')){
      return {'intent':'RESIDENT_STATUS','answer':'Grounded status for the selected property only.','facts':{'tickets':[]},'sources':['HelpdeskTicket'],'grounded':true,'mutationPerformed':false};
    }
    if(path.endsWith('/assistant/helpdesk-from-text')){
      return {'id':'11111111-1111-4111-8111-111111111111','status':'PROPOSED','requiresConfirmation':true};
    }
    if(path.endsWith('/confirm')){
      return {'proposalId':'11111111-1111-4111-8111-111111111111','status':'EXECUTED','result':{'ticketId':'ticket-1'}};
    }
    return {'status':'CANCELLED'};
  }
}

void main(){
  testWidgets('assistant explains grounding and requires complaint confirmation',(tester) async {
    final api=FakeApiClient();
    await tester.pumpWidget(MaterialApp(home:AiAssistantScreen(apiClient:api,unitId:'22222222-2222-4222-8222-222222222222')));
    expect(find.textContaining('cannot change society data directly'),findsOneWidget);
    await tester.pumpAndSettle();
    expect(find.text('Available for you'),findsOneWidget);
    expect(find.text('Resident notices'),findsOneWidget);
    expect(find.text('Resident gate status'),findsOneWidget);
    expect(api.gets.where((path)=>path.endsWith('/assistant/tools')).length,1);
    await tester.enterText(find.byType(TextField),'Water is leaking near the kitchen sink');
    await tester.tap(find.text('Ask'));
    await tester.pumpAndSettle();
    expect(find.text('Grounded status for the selected property only.'),findsOneWidget);
    expect(find.textContaining('tickets:'),findsOneWidget);

    await tester.tap(find.text('Complaint draft'));
    await tester.pumpAndSettle();
    expect(find.text('Nothing is submitted until you confirm. Normal complaint authorization and validation still apply.'),findsOneWidget);
    expect(find.text('Confirm complaint'),findsOneWidget);
    expect(api.posts.where((path)=>path.endsWith('/confirm')),isEmpty);

    await tester.ensureVisible(find.text('Confirm complaint'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Confirm complaint'));
    await tester.pumpAndSettle();
    expect(api.posts.where((path)=>path.endsWith('/confirm')).length,1);
  });

  testWidgets('demo assistant answers locally and never calls the API',(tester) async {
    final api=FakeApiClient();
    await tester.pumpWidget(MaterialApp(home:AiAssistantScreen(apiClient:api,unitId:'demo-unit-1',demoMode:true)));
    expect(find.textContaining('safe AI showcase'),findsOneWidget);
    await tester.enterText(find.byType(TextField),'What is my maintenance due?');
    await tester.ensureVisible(find.text('Ask'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ask'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Your September maintenance bill is ₹4,250'),findsOneWidget);
    expect(api.posts,isEmpty);

    await tester.enterText(find.byType(TextField),'Urgent water leak near kitchen');
    await tester.ensureVisible(find.text('Complaint draft'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Complaint draft'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Demo safeguard'),findsOneWidget);
    expect(find.text('Confirm complaint'),findsOneWidget);
    expect(api.posts,isEmpty);
  });
}
