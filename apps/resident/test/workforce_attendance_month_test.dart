import 'dart:async';
import 'package:aaraagate_resident/data/demo_resident_repository.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/screens/workforce_history_sheets.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'support/resident_visual_capture.dart';

class _AttendanceRepository extends DemoResidentRepository {
  final requests = <({String assignmentId, DateTime from, DateTime to})>[];
  final pending = <Completer<Map<String, dynamic>>>[];
  bool defer = false;
  bool failNext = false;

  Map<String, dynamic> result(DateTime from, DateTime to, {int presentDays = 1}) => {
    'from': from.toIso8601String().split('T').first,
    'to': to.toIso8601String().split('T').first,
    'summary': {'presentDays': presentDays, 'totalVisits': presentDays, 'leavePeriods': 1},
    'schedule': {'days': ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']},
    'days': [{'date': from.toIso8601String(), 'minutesInside': 120, 'visitCount': 1}],
    'leaves': [{'startsOn': DateTime(from.year, from.month, 2).toIso8601String(), 'endsOn': DateTime(from.year, from.month, 2).toIso8601String()}],
  };

  @override
  Future<Map<String, dynamic>> workforceAttendance(String assignmentId, {DateTime? from, DateTime? to}) async {
    requests.add((assignmentId: assignmentId, from: from!, to: to!));
    if (failNext) { failNext = false; throw StateError('Offline'); }
    if (defer) {
      final completer = Completer<Map<String, dynamic>>();
      pending.add(completer);
      return completer.future;
    }
    return result(from, to);
  }
}

ResidentDataController _controller(_AttendanceRepository repository) => ResidentDataController(
  repository, activeUnitId: 'unit-one', fetchEntitlements: false,
)..workforceAssignments = [{'id': 'assignment-one'}];

Future<void> _mount(WidgetTester tester, ResidentDataController controller, {DateTime? now}) async {
  await tester.pumpWidget(MaterialApp(home: Scaffold(body: WorkforceAttendanceSheet(
    controller: controller, assignmentId: 'assignment-one', clock: () => now ?? DateTime.utc(2026, 10, 18, 6),
  ))));
  await tester.pumpAndSettle();
}

Finder _day(String date) => find.byKey(ValueKey('attendance-day-$date'));

void main() {
  setUpAll(loadSdkFonts);

  testWidgets('opens a complete calendar month with correctly aligned weekdays and no future gaps', (tester) async {
    final repository = _AttendanceRepository();
    final controller = _controller(repository);
    addTearDown(controller.dispose);
    await _mount(tester, controller);
    expect(repository.requests.single.from, DateTime(2026, 10, 1));
    expect(repository.requests.single.to, DateTime(2026, 10, 18));
    expect(find.byKey(const ValueKey('attendance-calendar')), findsOneWidget);
    expect(find.byWidgetPredicate((widget) => widget is Semantics && (widget.key?.toString().contains('attendance-day-') ?? false)), findsNWidgets(31));
    expect(_day('2026-09-30'), findsNothing);
    expect(_day('2026-11-01'), findsNothing);
    final table = tester.widget<Table>(find.byKey(const ValueKey('attendance-calendar')));
    // en_US starts on Sunday: Thursday 1 October belongs in column 4.
    expect(find.descendant(of: find.byWidget(table.children[1].children[4]), matching: _day('2026-10-01')), findsOneWidget);
    expect(tester.widget<Semantics>(_day('2026-10-19')).properties.label, contains('Upcoming day'));
    expect(tester.widget<Semantics>(_day('2026-10-03')).properties.label, contains('no gate evidence'));
    expect(tester.widget<Semantics>(_day('2026-10-01')).properties.label, contains('Gate presence recorded'));
    expect(tester.widget<Semantics>(_day('2026-10-02')).properties.label, contains('Recorded leave'));
    expect(tester.widget<IconButton>(find.byWidgetPredicate((widget) => widget is IconButton && widget.tooltip == 'Next month')).onPressed, isNull);
    expect(tester.takeException(), isNull);
  });

  testWidgets('navigates past six completed months and across the year boundary', (tester) async {
    final repository = _AttendanceRepository();
    final controller = _controller(repository);
    addTearDown(controller.dispose);
    await _mount(tester, controller);
    for (var index = 1; index <= 12; index++) {
      await tester.tap(find.byTooltip('Previous month'));
      await tester.pumpAndSettle();
      final month = DateTime(2026, 10 - index);
      expect(repository.requests.last.from, month);
      expect(repository.requests.last.to, DateTime(month.year, month.month + 1, 0));
    }
    expect(repository.requests[6].from, DateTime(2026, 4, 1));
    expect(repository.requests[6].to, DateTime(2026, 4, 30));
    expect(repository.requests.last.from, DateTime(2025, 10, 1));
    expect(tester.widget<IconButton>(find.byWidgetPredicate((widget) => widget is IconButton && widget.tooltip == 'Previous month')).onPressed, isNull);
    await tester.tap(find.byTooltip('Next month'));
    await tester.pumpAndSettle();
    expect(repository.requests.last.from, DateTime(2025, 11, 1));
    expect(repository.requests.every((r) => r.assignmentId == 'assignment-one'), isTrue);
  });

  testWidgets('month picker loads February including leap day', (tester) async {
    final repository = _AttendanceRepository();
    final controller = _controller(repository);
    addTearDown(controller.dispose);
    await _mount(tester, controller, now: DateTime.utc(2024, 3, 15));
    await tester.tap(find.byKey(const ValueKey('attendance-month-selector')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('February 2024').last);
    await tester.pumpAndSettle();
    expect(repository.requests.last.from, DateTime(2024, 2, 1));
    expect(repository.requests.last.to, DateTime(2024, 2, 29));
    expect(_day('2024-02-29'), findsOneWidget);
    expect(_day('2024-02-30'), findsNothing);
    expect(_day('2024-03-01'), findsNothing);
  });

  testWidgets('India midnight uses the new month even while UTC is in the previous month', (tester) async {
    final repository = _AttendanceRepository();
    final controller = _controller(repository);
    addTearDown(controller.dispose);
    await _mount(tester, controller, now: DateTime.utc(2026, 9, 30, 20));
    expect(repository.requests.single.from, DateTime(2026, 10, 1));
    expect(repository.requests.single.to, DateTime(2026, 10, 1));
    expect(_day('2026-10-31'), findsOneWidget);
  });

  testWidgets('rebuilds do not refetch and failed months retry without losing navigation', (tester) async {
    final repository = _AttendanceRepository()..failNext = true;
    final controller = _controller(repository);
    addTearDown(controller.dispose);
    await _mount(tester, controller);
    expect(find.text('Could not load attendance for this month.'), findsOneWidget);
    expect(find.byTooltip('Previous month'), findsOneWidget);
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(repository.requests.length, 2);
    expect(find.text('1 present days'), findsOneWidget);
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: WorkforceAttendanceSheet(
      controller: controller, assignmentId: 'assignment-one', clock: () => DateTime.utc(2026, 10, 18),
    ))));
    await tester.pumpAndSettle();
    expect(repository.requests.length, 2);
  });

  testWidgets('late month responses cannot replace the selected month', (tester) async {
    final repository = _AttendanceRepository()..defer = true;
    final controller = _controller(repository);
    addTearDown(controller.dispose);
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: WorkforceAttendanceSheet(
      controller: controller, assignmentId: 'assignment-one', clock: () => DateTime.utc(2026, 10, 18),
    ))));
    await tester.pump();
    await tester.tap(find.byTooltip('Previous month'));
    await tester.pump();
    repository.pending[1].complete(repository.result(DateTime(2026, 9, 1), DateTime(2026, 9, 30), presentDays: 20));
    await tester.pumpAndSettle();
    repository.pending[0].complete(repository.result(DateTime(2026, 10, 1), DateTime(2026, 10, 18), presentDays: 10));
    await tester.pumpAndSettle();
    expect(find.text('20 present days'), findsOneWidget);
    expect(find.text('10 present days'), findsNothing);
    expect(_day('2026-09-30'), findsOneWidget);
    expect(_day('2026-10-01'), findsNothing);
  });

  test('demo monthly summary matches dated evidence and a one-day range stays inside its month', () async {
    final repository = DemoResidentRepository();
    final month = await repository.workforceAttendance('demo-workforce-1', from: DateTime(2026, 4, 1), to: DateTime(2026, 4, 30));
    final days = month['days'] as List;
    expect((month['summary'] as Map)['presentDays'], days.length);
    expect((month['summary'] as Map)['totalVisits'], days.length);
    for (final day in days) {
      expect((day['date'] as String).startsWith('2026-04-'), isTrue);
      expect((day['firstEntryAt'] as String).split('T').first, (day['date'] as String).split('T').first);
    }
    final short = await repository.workforceAttendance('demo-workforce-1', from: DateTime(2026, 4, 1), to: DateTime(2026, 4, 1));
    expect(short['days'], isEmpty);
    expect(short['leaves'], isEmpty);
    expect((short['summary'] as Map)['presentDays'], 0);
  });

  for (final dark in [false, true]) {
    for (final size in [(390.0, 1.0), (320.0, 2.0)]) {
      testWidgets('attendance month visual dark=$dark width=${size.$1} scale=${size.$2}', (tester) async {
        tester.view.physicalSize = Size(size.$1, 844);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final controller = _controller(_AttendanceRepository());
        addTearDown(controller.dispose);
        final boundary = GlobalKey();
        await tester.pumpWidget(RepaintBoundary(key: boundary, child: MaterialApp(
          debugShowCheckedModeBanner: false, theme: captureTheme(dark),
          builder: (context, child) => MediaQuery(data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(size.$2)), child: child!),
          home: Builder(builder: (context) => Scaffold(body: TextButton(
            onPressed: () => showModalBottomSheet<void>(context: context, isScrollControlled: true,
              builder: (_) => WorkforceAttendanceSheet(controller: controller, assignmentId: 'assignment-one', clock: () => DateTime.utc(2026, 10, 18))),
            child: const Text('Attendance'),
          ))),
        )));
        await tester.tap(find.text('Attendance'));
        await tester.pumpAndSettle();
        await captureResidentScreen(tester, boundary, 'attendance-${dark ? 'dark' : 'light'}-${size.$1.toInt()}-${size.$2}');
        await tester.ensureVisible(_day('2026-10-31'));
        await tester.pumpAndSettle();
        await captureResidentScreen(tester, boundary, 'attendance-end-${dark ? 'dark' : 'light'}-${size.$1.toInt()}-${size.$2}');
        expect(tester.takeException(), isNull);
      });
    }
  }
}
