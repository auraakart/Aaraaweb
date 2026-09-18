import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/data/resident_repository.dart';
import 'package:aaraagate_resident/screens/sos_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _SosApi extends ApiClient {
  _SosApi({this.failLoad=false}) : super(baseUrl:'http://test',accessToken:'token');
  final bool failLoad;
  String? patchPath;

  @override
  Future<dynamic> get(String path) async {
    if(path=='/api/v1/sos/mine'){
      if(failLoad) throw ApiException(500,'database stack trace must not leak');
      return [
        {'id':'sos-a','unitId':'unit-a','status':'TRIGGERED','message':'A emergency'},
        {'id':'sos-b','unitId':'unit-b','status':'TRIGGERED','message':'B emergency'},
      ];
    }
    throw StateError('Unexpected GET $path');
  }

  @override
  Future<dynamic> patch(String path,[Map<String,dynamic>? body]) async {
    patchPath=path;
    return {'id':'sos-a','unitId':'unit-a','status':'CANCELLED'};
  }
}

ResidentDataController _controller(ApiClient api){
  final controller=ResidentDataController(ResidentRepository(api),activeUnitId:'unit-a',fetchEntitlements:false);
  controller.households=[{'id':'house-a','unitId':'unit-a'}];
  return controller;
}

void main(){
  testWidgets('SOS shows and acts on incidents only for the active property',(tester) async {
    final api=_SosApi();
    final controller=_controller(api);
    await tester.pumpWidget(MaterialApp(home:SosScreen(controller:controller)));
    await tester.pumpAndSettle();

    expect(find.text('A emergency'),findsOneWidget);
    expect(find.text('B emergency'),findsNothing);
    expect(find.text('SOS is active'),findsOneWidget);

    await tester.tap(find.text('Cancel active SOS'));
    await tester.pumpAndSettle();
    expect(find.text('Cancel active SOS?'),findsOneWidget);
    await tester.tap(find.text('Cancel SOS'));
    await tester.pumpAndSettle();

    expect(api.patchPath,'/api/v1/sos/sos-a/cancel');
    controller.dispose();
  });

  testWidgets('SOS hides raw backend errors and stays usable at large text scale',(tester) async {
    final api=_SosApi(failLoad:true);
    final controller=_controller(api);
    await tester.pumpWidget(
      MediaQuery(
        data:const MediaQueryData(textScaler:TextScaler.linear(2.0)),
        child:MaterialApp(home:SosScreen(controller:controller)),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('SOS could not be completed. Check your connection and try again.'),findsOneWidget);
    expect(find.textContaining('database stack trace'),findsNothing);
    expect(find.text('SEND SOS'),findsOneWidget);
    expect(tester.takeException(),isNull);
    controller.dispose();
  });
}
