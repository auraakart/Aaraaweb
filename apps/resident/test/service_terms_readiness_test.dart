import 'package:aaraagate_resident/widgets/service_commercial_terms.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('missing terms stay unknown and declarations never authorize charging', (tester) async {
    await tester.pumpWidget(const MaterialApp(home:Scaffold(body:ServiceCommercialTerms(terms:{'refund':'Contact provider','extra':'Ignored'}))));
    expect(find.text('Declared fields: 1 / 5'), findsOneWidget);
    expect(find.text('Refund: Contact provider'), findsOneWidget);
    expect(find.text('Invoice issuer: Not specified'), findsOneWidget);
    expect(find.textContaining('permission to charge'), findsOneWidget);
    expect(find.textContaining('Ignored'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
