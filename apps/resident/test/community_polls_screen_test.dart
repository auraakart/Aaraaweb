import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/data/resident_repository.dart';
import 'package:aaraagate_resident/screens/community_polls_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _PollApi extends ApiClient {
  _PollApi() : super(baseUrl:'http://test',accessToken:'token');

  @override
  Future<dynamic> get(String path) async {
    if(path=='/api/v1/governance/community-polls'){
      throw ApiException(500,'database stack trace must not leak');
    }
    throw StateError('Unexpected GET $path');
  }
}

void main(){
  testWidgets('community polls hide raw backend errors and remain usable at large text',(tester) async {
    await tester.pumpWidget(
      MediaQuery(
        data:const MediaQueryData(textScaler:TextScaler.linear(2.0)),
        child:MaterialApp(
          home:CommunityPollsScreen(repository:ResidentRepository(_PollApi())),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Community polls could not be loaded. Check your connection and try again.'),findsOneWidget);
    expect(find.textContaining('database stack trace'),findsNothing);
    expect(find.text('Retry'),findsOneWidget);
    expect(tester.takeException(),isNull);
  });
}
