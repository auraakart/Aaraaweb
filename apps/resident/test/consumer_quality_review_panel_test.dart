import 'dart:async';

import 'package:aaraagate_resident/data/api_client.dart';
import 'package:aaraagate_resident/widgets/consumer_quality_review_panel.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

const booking = '11111111-1111-4111-8111-111111111111';

class QualityClient extends ApiClient {
  QualityClient() : super(baseUrl: 'http://test', accessToken: 'token');
  bool deny = false,
      foreign = false,
      lost = false,
      opened = false,
      captured = true;
  int writes = 0;
  Completer<dynamic>? pending;
  @override
  Future<dynamic> get(String path) async {
    if (deny) throw StateError('Denied');
    if (path.endsWith('/quality-checklist')) {
      if (pending != null) return pending!.future;
      return {
        'bookingId': foreign ? 'foreign' : booking,
        'captured': captured,
        'immutable': captured,
        'templateVersion': captured ? 1 : 0,
        'items': captured
            ? [
                {
                  'id': 'inspect_filter',
                  'label': 'Inspect filter',
                  'required': true,
                },
              ]
            : [],
      };
    }
    if (path.endsWith('/quality-evidence'))
      return captured
          ? [
              {
                'bookingId': booking,
                'assignmentId': 'agent-assignment',
                'itemId': 'inspect_filter',
                'passed': false,
                'note': 'Needs repair',
              },
            ]
          : [];
    if (path.endsWith('/rework-terms'))
      return {
        'bookingId': booking,
        'reviewRequired': true,
        'guaranteedRework': false,
        'chargeAuthorized': false,
        'refundAuthorized': false,
        'status': 'PERIOD_EXPIRED',
      };
    if (path.endsWith('/disputes'))
      return opened
          ? [
              {'bookingId': booking, 'status': 'OPEN'},
            ]
          : [];
    throw StateError('Unexpected request $path');
  }

  @override
  Future<dynamic> post(String path, [Map<String, dynamic>? body]) async {
    expect(path.endsWith('/request-rework'), true);
    expect((body!['detail'] as String).length, greaterThanOrEqualTo(10));
    writes++;
    opened = true;
    if (lost) throw StateError('Lost response');
    return {
      'bookingId': booking,
      'reworkReview': {
        'reviewRequired': true,
        'guaranteedRework': false,
        'chargeAuthorized': false,
        'refundAuthorized': false,
      },
    };
  }
}

Widget host(QualityClient api, {bool completed = true}) => MaterialApp(
  home: Scaffold(
    body: ConsumerQualityReviewPanel(
      apiClient: api,
      bookingId: booking,
      completed: completed,
    ),
  ),
);
void main() {
  testWidgets('late old-client read cannot restore another session checklist', (tester) async {
    final old = QualityClient()..pending = Completer<dynamic>();
    final current = QualityClient()..deny = true;
    await tester.pumpWidget(host(old, completed: false)); await tester.pump();
    await tester.pumpWidget(host(current, completed: false)); await tester.pumpAndSettle();
    old.pending!.complete({'bookingId': booking, 'captured': true, 'immutable': true, 'templateVersion': 1, 'items': [{'id': 'inspect_filter', 'label': 'Inspect filter', 'required': true}]});
    await tester.pumpAndSettle();
    expect(find.text('Inspect filter'), findsNothing);
    expect(find.textContaining('Service quality details are unavailable'), findsOneWidget);
    old.close(); current.close();
  });

  testWidgets(
    'shows immutable steps and assessments without promising rework coverage',
    (tester) async {
      final api = QualityClient();
      await tester.pumpWidget(host(api));
      await tester.pumpAndSettle();
      expect(find.text('Inspect filter'), findsOneWidget);
      expect(find.text('Inspect filter: Needs attention'), findsOneWidget);
      expect(
        find.textContaining('warranty period has expired'),
        findsOneWidget,
      );
      expect(api.writes, 0);
      await tester.enterText(
        find.byType(TextField),
        'The filter needs another inspection',
      );
      await tester.ensureVisible(find.text('Submit for rework review'));
      await tester.tap(find.text('Submit for rework review'));
      await tester.pumpAndSettle();
      expect(find.textContaining('submitted for review'), findsOneWidget);
      expect(api.writes, 1);
      api.close();
    },
  );
  testWidgets(
    'lost response requires refresh and discovers an existing open review',
    (tester) async {
      final api = QualityClient()..lost = true;
      await tester.pumpWidget(host(api));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byType(TextField),
        'The filter needs another inspection',
      );
      await tester.ensureVisible(find.text('Submit for rework review'));
      await tester.tap(find.text('Submit for rework review'));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Submit for rework review'),
            )
            .onPressed,
        isNull,
      );
      await tester.ensureVisible(
        find.text('Refresh quality and review status'),
      );
      await tester.tap(find.text('Refresh quality and review status'));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('An open review already exists'),
        findsOneWidget,
      );
      expect(api.writes, 1);
      api.close();
    },
  );
  testWidgets(
    'foreign and denied responses fail closed; legacy has no retrospective requirements',
    (tester) async {
      final api = QualityClient()..foreign = true;
      await tester.pumpWidget(host(api, completed: false));
      await tester.pumpAndSettle();
      expect(find.text('Inspect filter'), findsNothing);
      api.foreign = false;
      api.captured = false;
      await tester.tap(find.text('Refresh quality and review status'));
      await tester.pumpAndSettle();
      expect(find.textContaining('No checklist was captured'), findsOneWidget);
      expect(find.text('Submit for rework review'), findsNothing);
      expect(api.writes, 0);
      api.close();
    },
  );
}
