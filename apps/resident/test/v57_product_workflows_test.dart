import 'dart:typed_data';
import 'package:aaraagate_resident/data/demo_resident_repository.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/localization/aaraagate_strings.dart';
import 'package:aaraagate_resident/localization/v57_critical_copy.dart';
import 'package:aaraagate_resident/media/complaint_photo_picker.dart';
import 'package:aaraagate_resident/widgets/helpdesk_photos.dart';
import 'package:aaraagate_resident/widgets/helpdesk_asset_entry.dart';
import 'package:aaraagate_resident/widgets/service_commercial_terms.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
void main(){
 final binding=TestWidgetsFlutterBinding.ensureInitialized();
 test('all eight languages have complete V5.7 recovery and evidence vocabulary',(){
  final keys=v57CriticalCopy['en']!.keys.toSet();
  expect(v57CriticalCopy.keys.toSet(),{'en','hi','ta','te','kn','ml','mr','bn'});
  for(final entry in v57CriticalCopy.entries){expect(entry.value.keys.toSet(),keys,reason:entry.key);expect(entry.value.values.every((v)=>v.trim().isNotEmpty),isTrue);}
 });
 test('photo metadata stripping keeps image chunks and discards ancillary data',(){
  Uint8List chunk(String type,List<int> data)=>Uint8List.fromList([0,0,0,data.length,...type.codeUnits,...data,0,0,0,0]);
  final source=Uint8List.fromList([137,80,78,71,13,10,26,10,...chunk('IHDR',[1]),...chunk('tEXt',[2]),...chunk('IDAT',[3]),...chunk('IEND',[])]);
  final clean=stripPhotoMetadata(source);
  expect(String.fromCharCodes(clean).contains('tEXt'),isFalse);expect(String.fromCharCodes(clean).contains('IDAT'),isTrue);
  expect(()=>stripPhotoMetadata(Uint8List.fromList([1,2])),throwsStateError);
 });
 for(final code in v57CriticalCopy.keys){
  testWidgets('photo and asset controls at compact width and large text: $code',(tester)async{
   tester.view.physicalSize=const Size(320,840);tester.view.devicePixelRatio=1;
   binding.platformDispatcher.localeTestValue=Locale(code,'IN');
   addTearDown(tester.view.resetPhysicalSize);addTearDown(tester.view.resetDevicePixelRatio);addTearDown(binding.platformDispatcher.clearLocaleTestValue);
   final c=ResidentDataController(DemoResidentRepository(),activeUnitId:'demo-unit-1',fetchEntitlements:false)..households=[{'id':'house','unitId':'demo-unit-1'}];addTearDown(c.dispose);
   await tester.pumpWidget(MaterialApp(home:MediaQuery(data:const MediaQueryData(textScaler:TextScaler.linear(2)),child:Scaffold(body:SingleChildScrollView(child:Column(children:[
    HelpdeskPhotos(controller:c,ticketId:'demo-ticket-1',unitId:'demo-unit-1',closed:false),
    HelpdeskAssetEntry(controller:c,unitId:'demo-unit-1',onChanged:(_){},onBusyChanged:(_){}),
   ]))))));await tester.pumpAndSettle();
   final copy=AaraagateStrings.device();await tester.tap(find.text(copy.text('helpdeskViewPhotos')));await tester.pumpAndSettle();
   expect(find.text(copy.text('helpdeskNoPhotos')),findsOneWidget);
   await tester.ensureVisible(find.text(copy.text('helpdeskRelatedAsset')));await tester.tap(find.text(copy.text('helpdeskRelatedAsset')));await tester.pumpAndSettle();
   expect(tester.takeException(),isNull);
  });
 }
 testWidgets('unspecified declarations are visible and never fabricate policy',(tester)async{
  await tester.pumpWidget(const MaterialApp(home:Scaffold(body:SingleChildScrollView(child:ServiceCommercialTerms(terms:{'refund':'Provider review required'},recorded:true))))));
  expect(find.text('Refund: Provider review required'),findsOneWidget);expect(find.text('Invoice issuer: Not recorded'),findsOneWidget);expect(find.byType(FilledButton),findsNothing);
 });
}
