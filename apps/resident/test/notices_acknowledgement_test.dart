import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/data/resident_data_controller.dart';
import 'package:aaraagate_resident/data/resident_repository.dart';
import 'package:aaraagate_resident/screens/notices_screen.dart';
import 'package:aaraagate_resident/theme/aaraagate_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _NoticeRepository extends ResidentRepository {
  _NoticeRepository({this.failAcknowledgement = false})
      : super(ApiClient(baseUrl: 'http://127.0.0.1:3000', accessToken: 'test'));

  bool failAcknowledgement;
  int acknowledgementCalls = 0;
  final List<Map<String, dynamic>> rows = [
    {
      'id': 'notice-a',
      'title': 'Water shutdown',
      'body': 'Water supply will pause for tank cleaning.',
      'category': 'MAINTENANCE',
      'publishedAt': '2026-09-26T08:00:00Z',
      'requiresAcknowledgement': true,
      'acknowledgedAt': null,
    },
  ];

  @override
  Future<List<Map<String, dynamic>>> notices() async =>
      rows.map((item) => Map<String, dynamic>.from(item)).toList(growable: false);

  @override
  Future<Map<String, dynamic>> acknowledgeNotice(String noticeId) async {
    acknowledgementCalls++;
    if (failAcknowledgement) throw Exception('simulated acknowledgement failure');
    final notice = rows.firstWhere((item) => item['id'] == noticeId);
    notice['acknowledgedAt'] = '2026-09-26T09:00:00Z';
    return Map<String, dynamic>.from(notice);
  }
}

Future<ResidentDataController> _controller(_NoticeRepository repository) async {
  final controller = ResidentDataController(
    repository,
    initialEnabledFeatures: {'NOTICES'},
    fetchEntitlements: false,
  );
  await controller.refreshNotices();
  return controller;
}

void main() {
  testWidgets('resident reviews and acknowledges a required notice', (tester) async {
    final repository = _NoticeRepository();
    final controller = await _controller(repository);
    addTearDown(controller.dispose);

    await tester.pumpWidget(
      MaterialApp(
        theme: AaraagateTheme.light(),
        home: NoticesScreen(controller: controller),
      ),
    );

    expect(find.text('Acknowledgement required'), findsOneWidget);
    await tester.tap(find.text('Water shutdown'));
    await tester.pumpAndSettle();

    expect(find.text('Acknowledge notice'), findsOneWidget);
    await tester.tap(find.text('Acknowledge notice'));
    await tester.pumpAndSettle();

    expect(repository.acknowledgementCalls, 1);
    expect(find.text('Acknowledged'), findsOneWidget);
    expect(find.text('Acknowledge notice'), findsNothing);
  });

  testWidgets('failed acknowledgement remains retryable', (tester) async {
    final repository = _NoticeRepository(failAcknowledgement: true);
    final controller = await _controller(repository);
    addTearDown(controller.dispose);

    await tester.pumpWidget(
      MaterialApp(
        theme: AaraagateTheme.light(),
        home: NoticesScreen(controller: controller),
      ),
    );
    await tester.tap(find.text('Water shutdown'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Acknowledge notice'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));

    expect(repository.acknowledgementCalls, 1);
    expect(find.text('Acknowledgement could not be saved. Please retry.'), findsOneWidget);
    expect(find.text('Acknowledge notice'), findsOneWidget);
  });
}
