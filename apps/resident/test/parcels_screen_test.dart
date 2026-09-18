import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/data/resident_repository.dart';
import 'package:aaraagate_resident/screens/parcels_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _ParcelsApi extends ApiClient {
  _ParcelsApi() : super(baseUrl:'http://test',accessToken:'token');
  String? postPath;
  String? patchPath;

  @override
  Future<dynamic> get(String path) async {
    if(path=='/api/v1/parcels/mine'){
      return [
        {
          'id':'parcel-a',
          'unitId':'unit-a',
          'courierName':'Courier A',
          'status':'RECEIVED',
          'receivedAt':'2026-09-18T10:00:00Z',
          'overdue':false,
        },
        {
          'id':'parcel-b',
          'unitId':'unit-b',
          'courierName':'Courier B',
          'status':'RECEIVED',
          'receivedAt':'2026-09-18T10:00:00Z',
          'overdue':false,
        },
      ];
    }
    throw StateError('Unexpected GET $path');
  }

  @override
  Future<dynamic> post(String path,[Map<String,dynamic>? body]) async {
    postPath=path;
    return {'parcelId':'parcel-a','code':'482731','expiresAt':'2026-09-18T10:10:00Z'};
  }

  @override
  Future<dynamic> patch(String path,[Map<String,dynamic>? body]) async {
    patchPath=path;
    return {'id':'parcel-a','status':'COLLECTED'};
  }
}

void main(){
  testWidgets('parcels render only the active property and issue code for its parcel',(tester) async {
    final api=_ParcelsApi();
    await tester.pumpWidget(MaterialApp(
      home:ParcelsScreen(repository:ResidentRepository(api),unitId:'unit-a'),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Courier A'),findsOneWidget);
    expect(find.text('Courier B'),findsNothing);

    await tester.tap(find.text('Pickup code'));
    await tester.pumpAndSettle();
    expect(api.postPath,'/api/v1/parcels/mine/parcel-a/pickup-code');
    expect(find.text('482731'),findsOneWidget);
    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('I collected it'));
    await tester.pumpAndSettle();
    expect(api.patchPath,'/api/v1/parcels/mine/parcel-a/collect');
    expect(tester.takeException(),isNull);
  });

  testWidgets('parcel screen remains usable with large accessibility text',(tester) async {
    final api=_ParcelsApi();
    await tester.pumpWidget(
      MediaQuery(
        data:const MediaQueryData(textScaler:TextScaler.linear(2.0)),
        child:MaterialApp(
          home:ParcelsScreen(repository:ResidentRepository(api),unitId:'unit-a'),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Courier A'),findsOneWidget);
    expect(find.text('Courier B'),findsNothing);
    expect(tester.takeException(),isNull);
  });
}
