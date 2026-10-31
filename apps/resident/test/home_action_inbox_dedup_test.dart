import 'package:aaraagate_resident/data/demo_resident_repository.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/screens/home_screen.dart';
import 'package:aaraagate_resident/theme/aaraagate_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {

  for (final dark in <bool>[false, true]) {
    testWidgets('Home retains pending gate context when refresh fails: dark=$dark', (tester) async {
      tester.view.physicalSize = const Size(390, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final controller = ResidentDataController(
        DemoResidentRepository(), activeUnitId: 'unit-a', fetchEntitlements: false,
      )
        ..accessRequests = [
          {'id': 'visitor-1', 'subjectName': 'Waiting visitor', 'subjectType': 'VISITOR', 'status': 'PENDING'},
        ]
        ..accessError = 'Connection unavailable';
      addTearDown(controller.dispose);
      await tester.pumpWidget(MaterialApp(
        theme: dark ? AaraagateTheme.dark() : AaraagateTheme.light(),
        home: Scaffold(body: HomeScreen(
          controller: controller,
          showGate: true, showStaff: false, showServices: false,
          showHelpdesk: false, showNotices: false, showBilling: false,
          showAmenities: false, showSos: false, showAi: false,
          onOpenStaff: () {}, onOpenServices: () {}, onOpenHelpdesk: () {},
          onOpenNotices: () {}, onOpenBilling: () {}, onOpenAmenities: () {},
          onOpenAi: (_) {},
        )),
      ));
      await tester.pumpAndSettle();
      expect(find.text('Action inbox'), findsOneWidget);
      expect(find.text('Access requests could not be loaded.'), findsOneWidget);
      // The same pending identity also appears in Recent gate activity.
      expect(find.text('Waiting visitor'), findsWidgets);
      expect(find.text('Allow'), findsOneWidget);
      expect(find.text('Deny'), findsOneWidget);
      expect(find.text('All clear — nothing needs approval right now.'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('Home never reports all-clear on a failed empty Gate load', (tester) async {
    final controller = ResidentDataController(
      DemoResidentRepository(), activeUnitId: 'unit-a', fetchEntitlements: false,
    )..accessError = 'Connection unavailable';
    addTearDown(controller.dispose);
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: HomeScreen(
      controller: controller,
      showGate: true, showStaff: false, showServices: false,
      showHelpdesk: false, showNotices: false, showBilling: false,
      showAmenities: false, showSos: false, showAi: false,
      onOpenStaff: () {}, onOpenServices: () {}, onOpenHelpdesk: () {},
      onOpenNotices: () {}, onOpenBilling: () {}, onOpenAmenities: () {},
      onOpenAi: (_) {},
    ))));
    await tester.pumpAndSettle();
    expect(find.text('Access requests could not be loaded.'), findsOneWidget);
    expect(find.text('All clear — nothing needs approval right now.'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Action inbox shows one aggregate count and keeps urgency on the item only', (tester) async {
    await tester.binding.setSurfaceSize(const Size(700, 1600));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final controller = ResidentDataController(
      DemoResidentRepository(),
      activeUnitId: 'unit-a',
      fetchEntitlements: false,
    )
      ..accessRequests = [
        {
          'id': 'visit-1',
          'subjectName': 'Amit Verma',
          'subjectType': 'VISITOR',
          'purpose': 'Family visit',
          'status': 'PENDING',
        },
      ]
      ..helpdeskTickets = [
        {
          'id': 'ticket-1',
          'title': 'Water seepage near kitchen',
          'status': 'OPEN',
          'priority': 'HIGH',
          'updatedAt': '2026-09-24T08:00:00.000Z',
        },
      ];

    await tester.pumpWidget(
      MaterialApp(
        theme: AaraagateTheme.light(),
        home: Scaffold(
          body: HomeScreen(
            controller: controller,
            showGate: true,
            showStaff: true,
            showServices: true,
            showHelpdesk: true,
            showNotices: false,
            showBilling: false,
            showAmenities: true,
            showSos: false,
            showAi: true,
            onOpenStaff: () {},
            onOpenServices: () {},
            onOpenHelpdesk: () {},
            onOpenNotices: () {},
            onOpenBilling: () {},
            onOpenAmenities: () {},
            onOpenAi: (_) {},
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Action inbox'), findsOneWidget);
    expect(find.text('2 items need your attention.'), findsOneWidget);
    expect(find.textContaining('ACT NOW'), findsNothing);
    expect(find.textContaining('SOON 1'), findsNothing);
    expect(find.textContaining('INFO 0'), findsNothing);
    expect(find.text('Waiting'), findsOneWidget);
    expect(find.text('Soon'), findsOneWidget);

    final semantics = tester.widget<Semantics>(
      find.byWidgetPredicate(
        (widget) => widget is Semantics && widget.properties.label == 'Action inbox. 2 items need your attention.',
      ),
    );
    expect(semantics.properties.liveRegion, isTrue);
    expect(
      find.byWidgetPredicate(
        (widget) => widget is Semantics && widget.properties.label == 'Soon. Water seepage near kitchen. High priority · action in progress. Open helpdesk',
      ),
      findsOneWidget,
    );
  });
  testWidgets('informational activity does not inflate needs-attention count', (tester) async {
    await tester.binding.setSurfaceSize(const Size(700, 1200));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final controller = ResidentDataController(
      DemoResidentRepository(),
      activeUnitId: 'unit-a',
      fetchEntitlements: false,
    )
      ..notices = [
        {
          'id': 'notice-1',
          'title': 'Garden maintenance completed',
          'requiresAcknowledgement': false,
          'publishedAt': '2026-10-07T08:00:00.000Z',
        },
      ];

    await tester.pumpWidget(
      MaterialApp(
        theme: AaraagateTheme.light(),
        home: Scaffold(
          body: HomeScreen(
            controller: controller,
            showGate: false,
            showStaff: false,
            showServices: false,
            showHelpdesk: false,
            showNotices: true,
            showBilling: false,
            showAmenities: false,
            showSos: false,
            showAi: false,
            onOpenStaff: () {},
            onOpenServices: () {},
            onOpenHelpdesk: () {},
            onOpenNotices: () {},
            onOpenBilling: () {},
            onOpenAmenities: () {},
            onOpenAi: (_) {},
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('Action inbox'), findsOneWidget);
    expect(find.text('No urgent follow-up. Recent activity is shown below.'), findsOneWidget);
    expect(find.text('Garden maintenance completed'), findsOneWidget);
    expect(find.text('1 item needs your attention.'), findsNothing);
  });

  for (final dark in <bool>[false, true]) {
    for (final scenario in <String>['single', 'other', 'crowded', 'acknowledgement']) {
      testWidgets('Home notice identity dedup: $scenario, dark=$dark', (tester) async {
        await tester.binding.setSurfaceSize(Size(dark ? 320 : 390, 2400));
        addTearDown(() => tester.binding.setSurfaceSize(null));
        final controller = ResidentDataController(
          DemoResidentRepository(), activeUnitId: 'unit-a', fetchEntitlements: false,
        );
        addTearDown(controller.dispose);
        controller.notices = [
          {'id': 'latest', 'title': 'Water tank cleaning', 'publishedAt': '2026-10-30T08:00:00Z',
            'requiresAcknowledgement': scenario == 'acknowledgement'},
          if (scenario == 'other')
            {'id': 'older', 'title': 'Library hours', 'publishedAt': '2026-10-29T08:00:00Z'},
        ];
        final crowded = scenario == 'crowded';
        if (crowded) {
          controller.maintenanceInvoices = [{'id': 'invoice', 'status': 'ISSUED', 'amountPaise': 10000, 'dueDate': '2026-01-01'}];
          controller.helpdeskTickets = [{'title': 'Lift repair', 'status': 'OPEN', 'priority': 'CRITICAL'}];
          controller.bookings = [{'status': 'CONFIRMED', 'scheduledFrom': '2099-01-01T10:00:00Z', 'offering': {'name': 'AC service'}}];
        }
        var opened = 0;
        await tester.pumpWidget(MaterialApp(
          theme: dark ? AaraagateTheme.dark() : AaraagateTheme.light(),
          builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(dark ? 2 : 1)),
            child: child!,
          ),
          home: Scaffold(body: HomeScreen(
            controller: controller,
            showGate: false, showStaff: false, showServices: crowded,
            showHelpdesk: crowded, showNotices: true, showBilling: crowded,
            showAmenities: false, showSos: false, showAi: false,
            onOpenStaff: () {}, onOpenServices: () {}, onOpenHelpdesk: () {},
            onOpenNotices: () { opened++; }, onOpenBilling: () {}, onOpenAmenities: () {}, onOpenAi: (_) {},
          )),
        ));
        await tester.pumpAndSettle();
        // At 200% text, the Community preview is lazily built below the fold.
        // Scroll to its section before checking a notice displaced from inbox.
        if (crowded) {
          await tester.scrollUntilVisible(find.text('Community'), 250,
              scrollable: find.byType(Scrollable).first);
        }
        expect(find.text('Water tank cleaning'), findsOneWidget);
        expect(find.text('Community'), scenario == 'other' || crowded ? findsOneWidget : findsNothing);
        if (scenario == 'other') expect(find.text('Library hours'), findsOneWidget);
        if (scenario == 'acknowledgement') expect(find.text('1 item needs your attention.'), findsOneWidget);
        if (scenario == 'single') expect(find.text('No urgent follow-up. Recent activity is shown below.'), findsOneWidget);
        await tester.ensureVisible(find.text('Water tank cleaning'));
        await tester.tap(find.text('Water tank cleaning'));
        await tester.pumpAndSettle();
        expect(opened, 1);
        expect(tester.takeException(), isNull);
      });
    }
  }

}
