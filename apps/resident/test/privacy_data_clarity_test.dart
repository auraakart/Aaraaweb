import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/screens/privacy_data_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _PrivacyApi extends ApiClient {
  _PrivacyApi():super(baseUrl:'http://127.0.0.1:3000',accessToken:'test');

  @override
  Future<dynamic> get(String path) async {
    if(path=='/api/v1/privacy/self/context'){
      return {
        'grievanceContact':{
          'displayName':'Society Privacy Officer',
          'email':'privacy@example.com',
          'phone':'+919000000000',
          'instructions':'Use this contact for privacy questions.',
        },
      };
    }
    if(path=='/api/v1/privacy/self/requests'){
      return [
        {
          'id':'req-1','requestType':'ACCESS','status':'IN_REVIEW',
          'requestSummary':'Provide my data','legalHold':false,
          'dueAt':'2026-09-25T00:00:00.000Z','createdAt':'2026-09-19T00:00:00.000Z',
        },
        {
          'id':'req-2','requestType':'ERASURE','status':'WAITING',
          'requestSummary':'Review erasure','legalHold':true,
          'createdAt':'2026-09-18T00:00:00.000Z',
        },
      ];
    }
    throw ApiException(404,'Not found');
  }
}

void main(){
  testWidgets('privacy self-service shows grievance contact and request next actions',(tester) async{
    await tester.pumpWidget(MaterialApp(home:PrivacyDataScreen(apiClient:_PrivacyApi())));
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(find.text('Manage my data'),300);
    expect(find.text('Manage my data'),findsOneWidget);
    expect(find.text('Get a copy of my data'),findsOneWidget);
    expect(find.text('Correct my information'),findsOneWidget);

    await tester.scrollUntilVisible(find.text('Privacy help & grievance contact'),300);
    expect(find.text('Society Privacy Officer'),findsOneWidget);
    expect(find.text('privacy@example.com'),findsOneWidget);
    expect(find.textContaining('does not determine legal rights'),findsOneWidget);

    await tester.scrollUntilVisible(find.text('Privacy request status'),300);
    expect(find.text('Privacy request status'),findsOneWidget);

    await tester.scrollUntilVisible(find.text('Data access request'),300);
    expect(find.text('Your request is being reviewed.'),findsOneWidget);
    expect(find.textContaining('Operational target:'),findsOneWidget);
    expect(find.textContaining('Data export becomes available after this ACCESS request is completed.'),findsOneWidget);

    await tester.scrollUntilVisible(find.text('Erasure review request'),300);
    expect(find.textContaining('Retention/legal-hold review is active'),findsOneWidget);
  });
}
