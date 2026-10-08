import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:aaraagate_resident/data/demo_resident_repository.dart';
import 'package:aaraagate_resident/screens/community_circles_screen.dart';

void main() {
  testWidgets('joined members see sender identities and can report a message', (tester) async {
    await tester.pumpWidget(MaterialApp(home: CommunityCirclesScreen(repository: DemoResidentRepository())));
    await tester.pumpAndSettle();
    await tester.tap(find.text('OPEN CIRCLE'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Arun Kumar · A · 204'), findsOneWidget);
    expect(find.textContaining('You (Priya Sharma) · Maple Tower · A-1204'), findsOneWidget);
    await tester.tap(find.byTooltip('Report message').first);
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, 'Inappropriate content');
    await tester.tap(find.text('Send report'));
    await tester.pumpAndSettle();
    expect(find.text('Report sent to the society managers for review.'), findsOneWidget);
  });
  testWidgets('resident requests show pending rather than publishing immediately', (tester) async {
    await tester.pumpWidget(MaterialApp(home: CommunityCirclesScreen(repository: DemoResidentRepository())));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Request a circle'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, 'Walking neighbours');
    await tester.tap(find.text('Submit request'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();
    expect(find.text('Walking neighbours'), findsOneWidget);
    expect(find.text('PENDING'), findsOneWidget);
  });
}
