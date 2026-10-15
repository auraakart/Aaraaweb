import 'dart:async';
import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/data/resident_repository.dart';
import 'package:aaraagate_resident/screens/parcels_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _ParcelsApi extends ApiClient {
  _ParcelsApi() : super(baseUrl:'http://test',accessToken:'token');
  String? postPath;

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
    return {'parcelId':'parcel-a','code':'482731','expiresAt':'2026-09-18T10:10:00Z','maxAttempts':5};
  }
}

class _SlowParcelsApi extends _ParcelsApi {
  final Completer<dynamic> issuance = Completer<dynamic>();
  int postCalls = 0;

  @override
  Future<dynamic> post(String path,[Map<String,dynamic>? body]) {
    postPath=path;
    postCalls++;
    return issuance.future;
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
    expect(find.textContaining('Valid until'),findsOneWidget);
    expect(find.textContaining('up to 5 attempts'),findsOneWidget);
    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();

    expect(find.text('I collected it'),findsNothing);
    expect(find.text('Pickup codes are short-lived. Security verifies the code before handing over the parcel.'),findsOneWidget);
    expect(tester.takeException(),isNull);
  });

  testWidgets('pickup-code issuance disables duplicate submission until the server responds',(tester) async {
    final api=_SlowParcelsApi();
    await tester.pumpWidget(MaterialApp(
      home:ParcelsScreen(repository:ResidentRepository(api),unitId:'unit-a'),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Pickup code'));
    await tester.pump();
    expect(api.postCalls,1);
    expect(find.text('Creating code…'),findsOneWidget);
    final button=tester.widget<FilledButton>(find.byType(FilledButton));
    expect(button.onPressed,isNull);

    api.issuance.complete({'parcelId':'parcel-a','code':'482731','expiresAt':'2026-09-18T10:10:00Z','maxAttempts':5});
    await tester.pumpAndSettle();
    expect(find.text('482731'),findsOneWidget);
    expect(api.postCalls,1);
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
