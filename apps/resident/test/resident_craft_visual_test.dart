import 'dart:async';
import 'package:aaraagate_resident/data/demo_resident_repository.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/screens/community_screen.dart';
import 'package:aaraagate_resident/screens/helpdesk_screen.dart';
import 'package:aaraagate_resident/screens/home_screen.dart';
import 'package:aaraagate_resident/screens/profile_screen.dart';
import 'package:aaraagate_resident/screens/services_screen.dart';
import 'package:aaraagate_resident/screens/workforce_screen.dart';
import 'package:aaraagate_resident/widgets/premium_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'support/resident_visual_capture.dart';

HomeScreen _home(ResidentDataController controller, {bool minimal = false, ValueChanged<String>? opened}) => HomeScreen(
  controller: controller,
  showGate: true, showStaff: !minimal, showServices: !minimal,
  showHelpdesk: !minimal, showNotices: !minimal, showBilling: !minimal,
  showAmenities: !minimal, showSos: false, showAi: !minimal,
  onOpenStaff: () => opened?.call('Staff'), onOpenServices: () => opened?.call('Services'),
  onOpenHelpdesk: () => opened?.call('Helpdesk'), onOpenNotices: () => opened?.call('Community'),
  onOpenBilling: () => opened?.call('Billing'), onOpenAmenities: () => opened?.call('Amenities'),
  onOpenAi: (_) => opened?.call('Assistant'),
);

// No platform initialization or live data is needed to verify presentation.
Future<ResidentDataController> _controller() async {
  final repository = DemoResidentRepository();
  final controller = ResidentDataController(repository, activeUnitId: 'demo-unit-1', fetchEntitlements: false)
    ..households = await repository.households()
    ..workforceAssignments = await repository.workforce()
    ..serviceOfferings = await repository.serviceOfferings()
    ..notices = await repository.notices()
    ..helpdeskTickets = await repository.helpdeskTickets()
    ..accessRequests = [
      {'id': 'arrival-long', 'subjectName': 'Anand Krishnamurthy Ramanathan',
       'subjectType': 'VISITOR', 'status': 'PENDING',
       'purpose': 'Family visit at the north residential entrance'},
    ];
  return controller;
}

class _DecisionController extends ResidentDataController {
  _DecisionController() : super(DemoResidentRepository(), fetchEntitlements: false);
  final decision = Completer<void>();
  int denials = 0, approvals = 0;
  @override
  Future<void> denyAccess(String requestId) async { denials++; await decision.future; }
  @override
  Future<Map<String, dynamic>> approveAccess(String requestId, {Duration? duration}) async {
    approvals++; await decision.future; return {};
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(loadSdkFonts);
  for (final dark in [false, true]) {
    for (final size in [(390.0, 844.0, 1.0), (320.0, 844.0, 2.0), (840.0, 1000.0, 1.0)]) {
      for (final screen in ['home', 'staff', 'helpdesk', 'services', 'community', 'profile']) {
        testWidgets('craft $screen dark=$dark width=${size.$1} scale=${size.$3}', (tester) async {
          tester.view.physicalSize = Size(size.$1, size.$2);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          final controller = await _controller();
          addTearDown(controller.dispose);
          final opened = <String>[];
          final page = switch (screen) {
            'home' => _home(controller, opened: opened.add),
            'staff' => WorkforceScreen(controller: controller),
            'helpdesk' => HelpdeskScreen(controller: controller),
            'services' => ServicesScreen(controller: controller, consumerApiClient: controller.repository.api),
            'community' => CommunityScreen(controller: controller),
            _ => ProfileScreen(controller: controller, onSignOut: () async {},
              canManageFamilyMembers: true, propertyContexts: const [],
              currentSocietyId: 'demo-society', currentUnitId: 'demo-unit-1',
              onSwitchProperty: (_, _) async {}, easyMode: false, onEasyModeChanged: (_) async {}),
          };
          final boundary = GlobalKey();
          await tester.pumpWidget(RepaintBoundary(key: boundary, child: MaterialApp(
            debugShowCheckedModeBanner: false, theme: captureTheme(dark),
            builder: (context, child) => MediaQuery(
              data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(size.$3), disableAnimations: true),
              child: child!,
            ),
            home: Scaffold(body: page),
          )));
          await tester.pumpAndSettle();
          final name = 'craft-$screen-${dark ? 'dark' : 'light'}-${size.$1.toInt()}-${size.$3}';
          await captureResidentScreen(tester, boundary, name);
          expect(tester.takeException(), isNull);
          if (screen == 'home') {
            // All four approved quick actions retain their original destinations.
            for (final label in ['Staff', 'Billing', 'Amenities', 'Helpdesk']) {
              await tester.scrollUntilVisible(find.text(label), 200, scrollable: find.byType(Scrollable).first);
              await tester.ensureVisible(find.text(label));
              await tester.tap(find.text(label));
              await tester.pumpAndSettle();
              expect(opened.last, label);
            }
            await tester.scrollUntilVisible(find.text('Allow'), 240, scrollable: find.byType(Scrollable).first);
            await tester.ensureVisible(find.text('Allow'));
            await captureResidentScreen(tester, boundary, '$name-arrival');
            expect(tester.takeException(), isNull);
          } else if (screen == 'staff') {
            for (final label in ['ADD LEAVE', 'RATE', 'VIEW ATTENDANCE', 'PAYMENTS']) {
              await tester.scrollUntilVisible(find.text(label).first, 240, scrollable: find.byType(Scrollable).first);
              await tester.ensureVisible(find.text(label).first);
              expect(find.text(label).first.hitTestable(), findsOneWidget);
              expect(tester.takeException(), isNull);
            }
          }
          await tester.pumpWidget(const SizedBox());
          await tester.pumpAndSettle();
        });
      }
    }
  }

  testWidgets('Home denial owns its progress and serializes both decisions', (tester) async {
    final controller = _DecisionController()..accessRequests = [
      {'id': 'visitor-1', 'subjectName': 'Anand', 'subjectType': 'VISITOR', 'status': 'PENDING'},
    ];
    addTearDown(controller.dispose);
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: _home(controller, minimal: true))));
    await tester.tap(find.text('Deny'));
    await tester.pump();
    expect(controller.denials, 1);
    expect(controller.approvals, 0);
    expect(tester.widget<PremiumActionLabel>(find.widgetWithText(PremiumActionLabel, 'Deny')).busy, isTrue);
    expect(tester.widget<PremiumActionLabel>(find.widgetWithText(PremiumActionLabel, 'Allow')).busy, isFalse);
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Allow')).onPressed, isNull);
    expect(tester.widget<OutlinedButton>(find.widgetWithText(OutlinedButton, 'Deny')).onPressed, isNull);
    controller.decision.completeError(StateError('Connection lost'));
    await tester.pumpAndSettle();
    expect(find.text('Could not update gate access. Check your connection and retry.'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Allow')).onPressed, isNotNull);
    expect(tester.takeException(), isNull);
  });

  for (final sheet in ['Add household staff', 'ADD LEAVE', 'RATE']) {
    testWidgets('staff sheet $sheet fits compact large text with keyboard', (tester) async {
      tester.view.physicalSize = const Size(320, 700);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final controller = await _controller();
      addTearDown(controller.dispose);
      final boundary = GlobalKey();
      await tester.pumpWidget(RepaintBoundary(key: boundary, child: MaterialApp(
        debugShowCheckedModeBanner: false, theme: captureTheme(false),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(textScaler: const TextScaler.linear(2), viewInsets: const EdgeInsets.only(bottom: 280), disableAnimations: true),
          child: child!,
        ),
        home: Scaffold(body: WorkforceScreen(controller: controller)),
      )));
      await tester.pumpAndSettle();
      final Finder target;
      if (sheet == 'Add household staff') {
        target = find.byTooltip(sheet);
      } else {
        target = find.text(sheet).first;
        await tester.scrollUntilVisible(target, 240, scrollable: find.byType(Scrollable).first);
      }
      await tester.ensureVisible(target);
      await tester.tap(target);
      await tester.pumpAndSettle();
      final submit = find.text(switch (sheet) { 'ADD LEAVE' => 'SAVE LEAVE', 'RATE' => 'SAVE RATING', _ => 'SUBMIT FOR REVIEW' });
      await tester.ensureVisible(submit);
      await tester.pumpAndSettle();
      expect(submit.hitTestable(), findsOneWidget);
      expect(tester.takeException(), isNull);
      await captureResidentScreen(tester, boundary, 'craft-staff-sheet-${sheet.replaceAll(' ', '-')}');
      await tester.pumpWidget(const SizedBox());
      await tester.pumpAndSettle();
    });
  }
}
