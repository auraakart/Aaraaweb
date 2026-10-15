import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/data/resident_repository.dart';
import 'package:aaraagate_resident/screens/sos_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _SosApi extends ApiClient {
  _SosApi({this.failLoad=false,this.failTriggerAfterCommit=false,this.failCancelAfterCommit=false,List<Map<String,dynamic>>? incidents})
      : _incidents=incidents ?? [{'id':'sos-a','unitId':'unit-a','status':'ACTIVE','message':'A emergency'},{'id':'sos-b','unitId':'unit-b','status':'ACTIVE','message':'B emergency'}],
        super(baseUrl:'http://test',accessToken:'token');
  final bool failLoad;
  final bool failTriggerAfterCommit;
  final bool failCancelAfterCommit;
  final List<Map<String,dynamic>> _incidents;
  String? patchPath;
  int postCalls=0;

  @override
  Future<dynamic> get(String path) async {
    if(path=='/api/v1/sos/mine'){
      if(failLoad) throw ApiException(500,'database stack trace must not leak');
      return _incidents.map((item)=>Map<String,dynamic>.from(item)).toList(growable:false);
    }
    throw StateError('Unexpected GET $path');
  }

  @override
  Future<dynamic> post(String path,[Map<String,dynamic>? body]) async {
    if(path!='/api/v1/sos') throw StateError('Unexpected POST $path');
    postCalls++;
    final incident={'id':'sos-new','unitId':body?['unitId']?.toString() ?? 'unit-a','status':'ACTIVE','message':body?['message']?.toString() ?? 'Emergency SOS'};
    _incidents.insert(0,incident);
    if(failTriggerAfterCommit) throw ApiException(503,'upstream timeout after commit');
    return incident;
  }

  @override
  Future<dynamic> patch(String path,[Map<String,dynamic>? body]) async {
    patchPath=path;
    final parts=path.split('/').where((part)=>part.isNotEmpty).toList();
    final id=parts.length>3 ? parts[3] : "";
    final index=_incidents.indexWhere((item)=>item['id']==id);
    if(index>=0) _incidents[index]={..._incidents[index],'status':'CANCELLED'};
    if(failCancelAfterCommit) throw ApiException(503,'upstream timeout after commit');
    return {'id':id,'unitId':'unit-a','status':'CANCELLED'};
  }
}

ResidentDataController _controller(ApiClient api){
  final controller=ResidentDataController(ResidentRepository(api),activeUnitId:'unit-a',fetchEntitlements:false);
  controller.households=[{'id':'house-a','unitId':'unit-a'}];
  return controller;
}

Future<void> _confirmTrigger(WidgetTester tester) async {
  await tester.tap(find.text('SEND SOS').first);
  await tester.pumpAndSettle();
  await tester.tap(find.descendant(of:find.byType(AlertDialog),matching:find.text('SEND SOS')));
  await tester.pumpAndSettle();
}

Future<void> _confirmCancel(WidgetTester tester) async {
  await tester.tap(find.text('Cancel active SOS'));
  await tester.pumpAndSettle();
  await tester.tap(find.descendant(of:find.byType(AlertDialog),matching:find.text('Cancel SOS')));
  await tester.pumpAndSettle();
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
    await _confirmCancel(tester);
    expect(api.patchPath,'/api/v1/sos/sos-a/cancel');
    controller.dispose();
  });

  testWidgets('uncertain SOS trigger recovers authoritative active incident without a second submission',(tester) async {
    final api=_SosApi(incidents:<Map<String,dynamic>>[],failTriggerAfterCommit:true);
    final controller=_controller(api);
    await tester.pumpWidget(MaterialApp(home:SosScreen(controller:controller)));
    await tester.pumpAndSettle();
    await _confirmTrigger(tester);
    expect(api.postCalls,1);
    expect(find.text('SOS is active'),findsOneWidget);
    expect(find.text('SOS is active. Security has been notified.'),findsOneWidget);
    controller.dispose();
  });

  testWidgets('uncertain SOS cancellation reloads authoritative inactive state',(tester) async {
    final api=_SosApi(failCancelAfterCommit:true);
    final controller=_controller(api);
    await tester.pumpWidget(MaterialApp(home:SosScreen(controller:controller)));
    await tester.pumpAndSettle();
    await _confirmCancel(tester);
    expect(find.text('Cancel active SOS'),findsNothing);
    expect(find.text('SOS state refreshed. This incident is no longer active.'),findsOneWidget);
    controller.dispose();
  });

  testWidgets('SOS hides raw backend errors and stays usable at large text scale',(tester) async {
    final api=_SosApi(failLoad:true);
    final controller=_controller(api);
    await tester.pumpWidget(MediaQuery(data:const MediaQueryData(textScaler:TextScaler.linear(2.0)),child:MaterialApp(home:SosScreen(controller:controller))));
    await tester.pumpAndSettle();
    expect(find.text('SEND SOS'),findsOneWidget);
    await tester.drag(find.byType(ListView), const Offset(0, -500));
    await tester.pumpAndSettle();
    expect(find.text('SOS could not be completed. Check your connection and try again.'),findsOneWidget);
    expect(find.textContaining('database stack trace'),findsNothing);
    expect(tester.takeException(),isNull);
    controller.dispose();
  });
}
