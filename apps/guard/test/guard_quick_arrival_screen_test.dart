import 'package:aaraagate_guard/data/guard_api.dart';
import 'package:aaraagate_guard/data/guard_session_store.dart';
import 'package:aaraagate_guard/data/offline_action_queue.dart';
import 'package:aaraagate_guard/guard_controller.dart';
import 'package:aaraagate_guard/screens/guard_quick_arrival_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main(){
  testWidgets('quick arrival searches large societies and offers delivery presets',(tester)async{
    final controller=GuardController(api:GuardApi(baseUrl:'http://localhost:3000'),sessions:const GuardSessionStore(),offlineQueue:const OfflineActionQueue());
    controller.units=const [
      {'id':'u1','number':'A-101','building':{'name':'Alpha'}},
      {'id':'u2','number':'B-202','building':{'name':'Beta'}},
    ];
    await tester.pumpWidget(MaterialApp(home:GuardQuickArrivalScreen(controller:controller)));
    expect(find.text('Swiggy'),findsOneWidget);
    expect(find.text('Beta · B-202'),findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField,'Find building / unit'),'alpha');
    await tester.pump();
    expect(find.text('Alpha · A-101'),findsOneWidget);
    expect(find.text('Beta · B-202'),findsNothing);
    await tester.tap(find.text('Swiggy'));
    await tester.pump();
    expect(find.widgetWithText(TextField,'Person / provider name'),findsOneWidget);
  });
}
