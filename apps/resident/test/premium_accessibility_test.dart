import 'package:aaraagate_resident/theme/aaraagate_theme.dart';
import 'package:aaraagate_resident/widgets/premium_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

double contrast(Color first, Color second) {
  final a = first.computeLuminance();
  final b = second.computeLuminance();
  return (a > b ? a + .05 : b + .05) / (a > b ? b + .05 : a + .05);
}

void main() {
  testWidgets('pending feedback stops ticking behind a modal and resumes on return', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: AaraagateTheme.light(),
      home: Builder(builder: (context) => Scaffold(body: FilledButton(
        onPressed: () => showModalBottomSheet<void>(context: context, builder: (sheetContext) =>
          TextButton(onPressed: () => Navigator.pop(sheetContext), child: const Text('Done'))),
        child: const PremiumActionLabel(label: 'Preparing payment…', busy: true),
      ))),
    ));
    await tester.pump();
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    await tester.tap(find.text('Preparing payment…'));
    await tester.pumpAndSettle();
    expect(find.byType(CircularProgressIndicator), findsNothing);
    await tester.tap(find.text('Done'));
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pump();
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  for (final dark in [false, true]) {
    for (final reduced in [false, true]) {
      testWidgets('pending action keeps its label, 48px target and reduced motion: dark=$dark reduced=$reduced', (tester) async {
        tester.view.physicalSize = const Size(320, 800);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.pumpWidget(MaterialApp(
          theme: dark ? AaraagateTheme.dark() : AaraagateTheme.light(),
          home: MediaQuery(
            data: MediaQueryData(disableAnimations: reduced, textScaler: const TextScaler.linear(2)),
            child: Scaffold(body: Padding(
              padding: const EdgeInsets.all(20),
              child: FilledButton(onPressed: null, child: const PremiumActionLabel(label: 'Preparing payment…', busy: true)),
            )),
          ),
        ));
        await tester.pump();
        expect(find.text('Preparing payment…'), findsOneWidget);
        expect(find.byType(CircularProgressIndicator), reduced ? findsNothing : findsOneWidget);
        final busy = tester.widget<Semantics>(find.byWidgetPredicate((w) => w is Semantics && w.properties.value == 'In progress'));
        expect(busy.properties.liveRegion, isTrue);
        expect(tester.getSize(find.byType(FilledButton)).height, greaterThanOrEqualTo(48));
        expect(tester.takeException(), isNull);
      });
    }
  }

  for (final dark in [false, true]) {
    test('${dark ? 'dark' : 'light'} label pairs meet AA and control outlines meet 3:1', () {
      final theme = dark ? AaraagateTheme.dark() : AaraagateTheme.light();
      final c = theme.colorScheme;
      for (final pair in [
        (c.primary, c.onPrimary),
        (c.primaryContainer, c.onPrimaryContainer),
        (c.secondaryContainer, c.onSecondaryContainer),
        (c.tertiaryContainer, c.onTertiaryContainer),
        (c.errorContainer, c.onErrorContainer),
        (c.surfaceContainerHigh, c.onSurfaceVariant),
        (c.surface, c.onSurface),
      ]) {
        expect(contrast(pair.$1, pair.$2), greaterThanOrEqualTo(4.5));
      }
      expect(contrast(c.outline, c.surface), greaterThanOrEqualTo(3));
    });
  }

  testWidgets('small interactive surfaces remain 48px and honour reduced motion', (tester) async {
    var taps = 0;
    await tester.pumpWidget(MaterialApp(
      theme: AaraagateTheme.light(),
      home: MediaQuery(
        data: const MediaQueryData(disableAnimations: true),
        child: Scaffold(body: Align(
          alignment: Alignment.topLeft,
          child: PremiumSurface(
            padding: EdgeInsets.zero,
            onTap: () => taps++,
            child: const Text('Go'),
          ),
        )),
      ),
    ));
    final target = find.byType(InkWell);
    expect(tester.getSize(target).width, greaterThanOrEqualTo(48));
    expect(tester.getSize(target).height, greaterThanOrEqualTo(48));
    final gesture = await tester.startGesture(tester.getCenter(target));
    await tester.pump(const Duration(milliseconds: 100));
    final scale = tester.widget<AnimatedScale>(find.byType(AnimatedScale));
    expect(scale.scale, 1);
    expect(scale.duration, Duration.zero);
    await gesture.up();
    await tester.pumpAndSettle();
    expect(taps, 1);
  });

  testWidgets('identity header reflows at 320px and 200% type in both themes', (tester) async {
    tester.view.physicalSize = const Size(320, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    for (final theme in [AaraagateTheme.light(), AaraagateTheme.dark()]) {
      await tester.pumpWidget(MaterialApp(
        theme: theme,
        home: MediaQuery(
          data: const MediaQueryData(textScaler: TextScaler.linear(2)),
          child: const Scaffold(body: SingleChildScrollView(
            padding: EdgeInsets.all(20),
            child: PremiumIdentityHeader(
              icon: Icons.sports_tennis_rounded,
              title: 'Community badminton court',
              supportingText: 'Clubhouse, second floor',
              status: AaraagateStatusPill(label: 'Approval required'),
            ),
          )),
        ),
      ));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      final title = tester.widget<Text>(find.text('Community badminton court'));
      expect(title.maxLines, isNull);
    }
  });
}
