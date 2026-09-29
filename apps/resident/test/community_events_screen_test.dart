import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/data/resident_repository.dart';
import 'package:aaraagate_resident/screens/community_events_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _EventRepository extends ResidentRepository{
  _EventRepository():super(ApiClient(baseUrl:'http://127.0.0.1:3000',accessToken:'test'));
  String? response;

  @override
  Future<List<Map<String,dynamic>>> communityEvents() async=>[
    {
      'id':'event-1',
      'title':'Family sports evening',
      'description':'Clubhouse games',
      'audienceScope':'COMMUNITY',
      'status':'PUBLISHED',
      'startsAt':DateTime.now().add(const Duration(days:2)).toUtc().toIso8601String(),
      'endsAt':DateTime.now().add(const Duration(days:2,hours:2)).toUtc().toIso8601String(),
      'location':'Clubhouse',
      'capacity':30,
      'goingCount':12,
      'notGoingCount':2,
      'myRsvp':response,
    }
  ];

  @override
  Future<Map<String,dynamic>> respondCommunityEvent({required String eventId,required String status}) async{
    response=status;
    return {'eventId':eventId,'status':status};
  }
}

void main(){
  testWidgets('resident can record and refresh a non-statutory community event RSVP',(tester)async{
    final repository=_EventRepository();
    await tester.pumpWidget(MaterialApp(home:CommunityEventsScreen(repository:repository)));
    await tester.pumpAndSettle();

    expect(find.text('Family sports evening'),findsOneWidget);
    expect(find.textContaining('12 / 30 going'),findsOneWidget);
    expect(find.text('I’m going'),findsOneWidget);

    await tester.tap(find.text('I’m going'));
    await tester.pumpAndSettle();

    expect(repository.response,'GOING');
    expect(find.text('Going'),findsOneWidget);
    expect(find.textContaining('not a vote'),findsOneWidget);
  });
}
