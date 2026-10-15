import 'package:aaraagate_guard/data/guard_api.dart';
import 'package:aaraagate_guard/data/guard_recent_arrival_store.dart';
import 'package:aaraagate_guard/data/guard_session_store.dart';
import 'package:aaraagate_guard/data/offline_action_queue.dart';
import 'package:aaraagate_guard/guard_controller.dart';
import 'package:aaraagate_guard/screens/guard_quick_arrival_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _MemoryRecentStore extends GuardRecentArrivalStore {
  _MemoryRecentStore(this.items);
  final List<GuardRecentArrival> items;
  @override
  Future<List<GuardRecentArrival>> readFor({required String societyId, required String guardUserId}) async => items
      .where((item) => item.belongsTo(societyId: societyId, guardUserId: guardUserId))
      .toList(growable: false);
  @override
  Future<void> remember(GuardRecentArrival arrival) async => items.insert(0, arrival);
}

const session=GuardSession(sessionId:'s1',accessToken:'token',refreshToken:'refresh',userId:'guard-1',societyId:'society-1');

GuardController controller()=>GuardController(api:GuardApi(baseUrl:'http://localhost:3000'),sessions:const GuardSessionStore(),offlineQueue:const OfflineActionQueue())
  ..session=session
  ..units=const [
    {'id':'u1','number':'A-101','building':{'name':'Alpha'}},
    {'id':'u2','number':'B-202','building':{'name':'Beta'}},
  ];

void main(){
  testWidgets('quick arrival makes queued offline work explicit',(tester)async{
    final c=controller();
    c.queuedActions=2;
    c.offlineSyncMessage='2 actions remain queued.';
    await tester.pumpWidget(MaterialApp(home:GuardQuickArrivalScreen(controller:c,recentStore:_MemoryRecentStore([]))));
    await tester.pump();
    expect(find.text('2 actions waiting to sync'),findsOneWidget);
    expect(find.text('RETRY SAFE SYNC'),findsOneWidget);
  });

  testWidgets('quick arrival searches large societies and offers delivery presets',(tester)async{
    final c=controller();
    await tester.pumpWidget(MaterialApp(home:GuardQuickArrivalScreen(controller:c,recentStore:_MemoryRecentStore([]))));
    await tester.pump();
    expect(find.text('Swiggy'),findsOneWidget);
    expect(find.text('Beta · B-202'),findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField,'Find building / unit'),'alpha');
    await tester.pump();
    expect(find.text('Alpha · A-101'),findsOneWidget);
    expect(find.text('Beta · B-202'),findsNothing);
    await tester.tap(find.text('Swiggy'));
    await tester.pump();
    expect(find.widgetWithText(TextField,'Person / provider name'),findsOneWidget);
    await tester.tap(find.text('Alpha · A-101'));
    await tester.pump();
    await tester.enterText(find.widgetWithText(TextField,'Person / provider name'),'Swiggy rider');
    await tester.pump();
    await tester.scrollUntilVisible(find.text('REQUEST APPROVAL'),300,scrollable:find.byType(Scrollable).first);
    await tester.pumpAndSettle();
    final submitFinder=find.ancestor(of:find.text('REQUEST APPROVAL'),matching:find.byWidgetPredicate((widget)=>widget is FilledButton));
    final submit=tester.widget<FilledButton>(submitFinder);
    expect(submit.onPressed,isNotNull);
  });

  testWidgets('repeat arrival restores destination and provider in one tap',(tester)async{
    final c=controller();
    final store=_MemoryRecentStore([
      GuardRecentArrival(
        societyId:'society-1',guardUserId:'guard-1',unitId:'u2',subjectType:'DELIVERY',name:'Amazon',provider:'Amazon',
        lastUsedAt:DateTime.utc(2026,9,18),
      ),
      GuardRecentArrival(
        societyId:'other-society',guardUserId:'other-guard',unitId:'u1',subjectType:'CAB',name:'Uber',provider:'Uber',
        lastUsedAt:DateTime.utc(2026,9,18),
      ),
    ]);
    await tester.pumpWidget(MaterialApp(home:GuardQuickArrivalScreen(controller:c,recentStore:store)));
    await tester.pumpAndSettle();

    expect(find.text('Repeat arrival'),findsOneWidget);
    expect(find.text('Amazon · Beta · B-202'),findsOneWidget);
    expect(find.textContaining('Uber · Alpha'),findsNothing);

    await tester.tap(find.text('Amazon · Beta · B-202'));
    await tester.pump();

    expect(find.text('Beta · B-202'),findsOneWidget);
    // Voice quick-fill adds a deliberate review control above the manual fields.
    // Scroll before inspecting the lazily built field so the regression test
    // continues to validate restored form state rather than viewport height.
    await tester.drag(find.byType(ListView),const Offset(0,-320));
    await tester.pumpAndSettle();
    final nameField=tester.widget<TextField>(find.widgetWithText(TextField,'Person / provider name'));
    expect(nameField.controller?.text,'Amazon');
  });
}
