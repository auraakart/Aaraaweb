import 'package:aaraagate_guard/localization/guard_strings.dart';
import 'package:aaraagate_guard/theme/aaraagate_guard_theme.dart';
import 'package:aaraagate_guard/widgets/guard_field_attention_header.dart';
import 'package:aaraagate_guard/widgets/guard_field_recovery_notice.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  for (final language in guardLanguages) {
    for (final dark in <bool>[false, true]) {
      testWidgets('Guard attention and safe refresh use ${language.code} dark=$dark', (tester) async {
        tester.view.physicalSize = const Size(320, 900);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final strings = GuardStrings(language.code);
        var readCalls = 0;

        await tester.pumpWidget(MaterialApp(
          theme: dark ? AaraagateGuardTheme.dark() : AaraagateGuardTheme.light(),
          home: Scaffold(body: SafeArea(child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              GuardFieldAttentionHeader(
                urgent: 3,
                attentionLabel: strings.get('fieldAttentionNow'),
                clearLabel: strings.get('fieldAttentionClear'),
              ),
              const SizedBox(height: 16),
              GuardFieldAttentionHeader(
                urgent: 0,
                attentionLabel: strings.get('fieldAttentionNow'),
                clearLabel: strings.get('fieldAttentionClear'),
              ),
              GuardFieldRecoveryNotice(
                message: 'Confirm latest gate status before any action.',
                refreshLabel: strings.get('fieldRefreshStatus'),
                onRefresh: () => readCalls++,
              ),
            ],
          ))),
        ));
        await tester.pumpAndSettle();
        expect(find.text(strings.get('fieldAttentionNow')), findsOneWidget);
        expect(find.text(strings.get('fieldAttentionClear')), findsOneWidget);
        final action = find.widgetWithText(OutlinedButton, strings.get('fieldRefreshStatus'));
        await tester.ensureVisible(action);
        expect(tester.getSize(action).height, greaterThanOrEqualTo(AaraagateGuardTokens.minTouchTarget));
        await tester.tap(action);
        expect(readCalls, 1);
        expect(tester.takeException(), isNull);
      });
    }
  }

  for (final code in <String>['hi', 'ta']) {
    testWidgets('Guard recovery actions fit 320dp 200% text: $code', (tester) async {
      tester.view.physicalSize = const Size(320, 920);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final strings = GuardStrings(code);
      await tester.pumpWidget(MaterialApp(
        theme: AaraagateGuardTheme.dark(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: const TextScaler.linear(2),
            disableAnimations: true,
          ),
          child: child!,
        ),
        home: Scaffold(body: SafeArea(child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            GuardFieldAttentionHeader(
              urgent: 5,
              attentionLabel: strings.get('fieldAttentionNow'),
              clearLabel: strings.get('fieldAttentionClear'),
            ),
            GuardFieldRecoveryNotice(
              message: 'Check status before retrying.',
              refreshLabel: strings.get('fieldRefreshStatus'),
              onRefresh: null,
            ),
          ],
        ))),
      ));
      await tester.pumpAndSettle();
      final action = find.widgetWithText(OutlinedButton, strings.get('fieldRefreshStatus'));
      await tester.ensureVisible(action);
      expect(tester.widget<OutlinedButton>(action).onPressed, isNull);
      expect(find.text(strings.get('fieldAttentionNow')), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}
