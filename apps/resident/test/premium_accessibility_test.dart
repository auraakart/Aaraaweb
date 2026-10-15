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
