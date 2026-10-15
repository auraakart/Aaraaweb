import 'package:aaraagate_resident/widgets/visitor_pass_share_message.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('visitor pass share message includes only intended pass details', () {
    final text = VisitorPassShareMessage.build(
      visitorName: 'Arun',
      credential: 'PASS-1234',
      validUntil: DateTime.utc(2026, 9, 10, 12, 30),
    );

    expect(text, contains('Aaraagate visitor pass for Arun'));
    expect(text, contains('Pass code: PASS-1234'));
    expect(text, contains('Valid until:'));
    expect(text, contains('Share it only with the intended visitor.'));
    expect(text, isNot(contains('phone')));
    expect(text, isNot(contains('unit')));
  });
}
