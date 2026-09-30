import 'dart:async';
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

class _DeferredEventRepository extends _EventRepository{
  final loads=<Completer<List<Map<String,dynamic>>>>[];
  final responsePending=Completer<Map<String,dynamic>>();

  @override
  Future<List<Map<String,dynamic>>> communityEvents(){
    final pending=Completer<List<Map<String,dynamic>>>();
    loads.add(pending);
    return pending.future;
  }

  @override
  Future<Map<String,dynamic>> respondCommunityEvent({required String eventId,required String status})=>responsePending.future;
}

void main(){
  testWidgets('RSVP completion after disposal does not reload or update state',(tester)async{
    final repository=_DeferredEventRepository();
    await tester.pumpWidget(MaterialApp(home:CommunityEventsScreen(repository:repository)));
    repository.loads.single.complete(await _EventRepository().communityEvents());
    await tester.pumpAndSettle();
    final refresh=tester.widget<RefreshIndicator>(find.byType(RefreshIndicator)).onRefresh;
    await tester.tap(find.text('I’m going'));
    await tester.pumpWidget(const MaterialApp(home:SizedBox()));
    repository.responsePending.complete({'myRsvp':'GOING'});
    await tester.pumpAndSettle();
    // A retained refresh callback must also be harmless after disposal.
    await expectLater(refresh(),completes);
    expect(repository.loads,hasLength(1));
    expect(tester.takeException(),isNull);
  });

  for(final staleFails in [false,true]){
    testWidgets('stale refresh cannot overwrite RSVP refresh (failure: $staleFails)',(tester)async{
      final repository=_DeferredEventRepository();
      await tester.pumpWidget(MaterialApp(home:CommunityEventsScreen(repository:repository)));
      final initial=await _EventRepository().communityEvents();
      repository.loads.single.complete(initial);
      await tester.pumpAndSettle();

      final refresh=tester.widget<RefreshIndicator>(find.byType(RefreshIndicator)).onRefresh();
      await tester.pump();
      await tester.tap(find.text('I’m going'));
      repository.responsePending.complete({'myRsvp':'GOING'});
      await tester.pump();
      expect(repository.loads,hasLength(3));
      repository.loads[2].complete([{...initial.single,'myRsvp':'GOING','goingCount':13}]);
      await tester.pumpAndSettle();
      if(staleFails){repository.loads[1].completeError(Exception('Old refresh failed'));}
      else{repository.loads[1].complete(initial);}
      await refresh;
      await tester.pumpAndSettle();
      expect(find.text('Going'),findsOneWidget);
      expect(find.textContaining('13 / 30 going'),findsOneWidget);
      expect(find.text('Retry'),findsNothing);
      expect(tester.takeException(),isNull);
    });
  }

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
