import 'package:aaraagate_resident/localization/aaraagate_strings.dart';
import 'package:aaraagate_resident/theme/aaraagate_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final binding = TestWidgetsFlutterBinding.ensureInitialized();
  const codes = ['en', 'hi', 'ta', 'te', 'kn', 'ml', 'mr', 'bn'];
  const keys = ['navHome', 'navGate', 'navServices', 'navCommunity', 'navProfile'];

  for (final code in codes) {
    for (final dark in [false, true]) {
      testWidgets('five Resident nav identities in $code at 320dp: dark=$dark', (tester) async {
        tester.view.physicalSize = const Size(320, 760);
        tester.view.devicePixelRatio = 1;
        binding.platformDispatcher.localeTestValue = Locale(code, 'IN');
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(binding.platformDispatcher.clearLocaleTestValue);
        final strings = AaraagateStrings.device();
        final labels = keys.map(strings.text).toList(growable: false);
        expect(strings.languageCode, code);
        expect(labels.toSet().length, 5);
        expect(labels.every((label) => label.isNotEmpty), isTrue);

        var selected = 0;
        await tester.pumpWidget(MaterialApp(
          theme: dark ? AaraagateTheme.dark() : AaraagateTheme.light(),
          home: StatefulBuilder(builder: (context, setState) => Scaffold(
            body: Text('Current tab: $selected'),
            bottomNavigationBar: NavigationBar(
              selectedIndex: selected,
              onDestinationSelected: (index) => setState(() => selected = index),
              destinations: [
                for (var index = 0; index < labels.length; index++)
                  NavigationDestination(
                    icon: const Icon(Icons.circle_outlined),
                    label: labels[index],
                  ),
              ],
            ),
          )),
        ));
        await tester.pumpAndSettle();
        expect(find.byType(NavigationDestination), findsNWidgets(5));
        for (final label in labels) expect(find.text(label), findsOneWidget);
        await tester.tap(find.text(labels[4]));
        await tester.pumpAndSettle();
        expect(find.text('Current tab: 4'), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }
  }

  for (final code in ['hi', 'ta']) {
    testWidgets('localized 5-tab nav remains usable at 200% text: $code', (tester) async {
      tester.view.physicalSize = const Size(320, 760);
      tester.view.devicePixelRatio = 1;
      binding.platformDispatcher.localeTestValue = Locale(code, 'IN');
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(binding.platformDispatcher.clearLocaleTestValue);
      final strings = AaraagateStrings.device();
      await tester.pumpWidget(MaterialApp(
        theme: AaraagateTheme.light(),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
            textScaler: const TextScaler.linear(2), disableAnimations: true,
          ),
          child: child!,
        ),
        home: Scaffold(
          bottomNavigationBar: NavigationBar(
            selectedIndex: 0,
            onDestinationSelected: (_) {},
            destinations: [
              for (final key in keys)
                NavigationDestination(icon: const Icon(Icons.circle_outlined), label: strings.text(key)),
            ],
          ),
          body: const SizedBox.shrink(),
        ),
      ));
      await tester.pumpAndSettle();
      expect(find.byType(NavigationDestination), findsNWidgets(5));
      expect(tester.takeException(), isNull);
    });
  }
}
