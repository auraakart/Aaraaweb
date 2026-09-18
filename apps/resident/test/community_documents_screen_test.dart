import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/data/resident_repository.dart';
import 'package:aaraagate_resident/screens/community_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _CommunityRepository extends ResidentRepository {
  _CommunityRepository():super(ApiClient(baseUrl:'http://127.0.0.1:3000',accessToken:'test'));

  @override Future<List<Map<String,dynamic>>> communityMeetings() async => const [];
  @override Future<List<Map<String,dynamic>>> communityDocuments() async => [
    {'id':'gov-1','kind':'MEETING_MINUTES','note':'September committee minutes'},
  ];
  @override Future<List<Map<String,dynamic>>> societyDocuments() async => [
    {
      'id':'doc-1','title':'Parking policy','category':'POLICY','audience':'PROPERTY_OWNER_ONLY',
      'version':2,'buildingName':'A Block','unitNumber':'101','supersedesDocumentId':'doc-old',
    },
  ];
  @override Future<List<Map<String,dynamic>>> communityPolls() async => const [];
  @override Future<List<Map<String,dynamic>>> helpdeskTickets() async => const [];
}

void main(){
  testWidgets('Community shows authorized society documents with current version and preserves governance references',(tester) async{
    final repository=_CommunityRepository();
    final controller=ResidentDataController(repository,activeUnitId:'unit-1',fetchEntitlements:false);
    controller.households=[{'id':'house-1','unitId':'unit-1'}];

    await tester.pumpWidget(MaterialApp(home:CommunityScreen(controller:controller)));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(find.text('Society documents'),300,scrollable:find.byType(Scrollable).first);
    await tester.pumpAndSettle();

    expect(find.text('Society documents'),findsOneWidget);
    expect(find.text('Parking policy'),findsOneWidget);
    expect(find.textContaining('Property Owner Only'),findsOneWidget);
    expect(find.textContaining('v2 · Current'),findsOneWidget);
    expect(find.textContaining('A Block · 101'),findsOneWidget);
    expect(find.textContaining('Replaces previous version'),findsOneWidget);
    expect(find.text('Open document'),findsOneWidget);

    expect(find.text('Governance references'),findsOneWidget);
    expect(find.text('Meeting Minutes'),findsOneWidget);
    expect(find.text('September committee minutes'),findsOneWidget);

    controller.dispose();
  });
}
